"""Views for the projects app."""
import uuid
import logging
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from django.db.models import Q

from apps.products.models import Product
from apps.integrations.r2_client import upload_bytes, delete_object

from .models import Project, ProjectImage
from .serializers import (
    ProjectListSerializer,
    ProjectDetailSerializer,
    ProjectPublicSerializer,
    ProjectImageSerializer,
    ProductMinimalSerializer,
)
from .permissions import ProjectPermissions

logger = logging.getLogger(__name__)


_ALLOWED_IMAGE_CONTENT_TYPES = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB per file


def _user_allowed_products_qs(user):
    """Return the product queryset the user is allowed to see in the project
    product picker.

    Read access to the product catalog is broadly available across the system,
    so any authenticated user gets the full queryset; a dept_manager is
    intentionally restricted to their managed categories so the picker can't
    suggest products they couldn't actually attach. Write-time scope is still
    re-validated by ``ProjectWriteSerializer.validate_product_ids``.
    """
    qs = Product.objects.select_related('category').prefetch_related('images')
    if not (user and user.is_authenticated):
        return qs.none()
    if user.is_dept_manager:
        managed = user.get_managed_category_ids()
        return qs.filter(category_id__in=managed) if managed else qs.none()
    # super_admin and other authenticated roles: full read of the catalog.
    return qs


class ProjectViewSet(viewsets.ModelViewSet):
    """
    /api/v1/projects/                          → list (search, filter is_active)
    /api/v1/projects/{id}/                     → detail
    POST /api/v1/projects/                     → create
    PUT/PATCH /api/v1/projects/{id}/           → update
    DELETE /api/v1/projects/{id}/              → delete (super_admin or
                                                  in-scope dept_manager)
    PATCH /api/v1/projects/{id}/toggle-active/ → flip is_active
    POST /api/v1/projects/{id}/images/         → upload one or many images
    DELETE /api/v1/projects/{id}/images/{img}/ → delete one image
    PATCH /api/v1/projects/{id}/images/reorder/ → reorder + set cover
    """
    serializer_class = ProjectDetailSerializer
    permission_classes = [ProjectPermissions]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        user = self.request.user
        qs = (
            Project.objects
            .prefetch_related('products', 'products__category', 'products__images', 'images')
            .order_by('sort_order', '-created_at')
        )

        # Filter by is_active
        is_active = self.request.query_params.get('is_active')
        if is_active in ('true', '1'):
            qs = qs.filter(is_active=True)
        elif is_active in ('false', '0'):
            qs = qs.filter(is_active=False)

        # Search
        q = (self.request.query_params.get('search') or '').strip()
        if q:
            qs = qs.filter(
                Q(name_ar__icontains=q) |
                Q(name_en__icontains=q) |
                Q(description_ar__icontains=q) |
                Q(description_en__icontains=q)
            )

        # Scoping for dept_manager: only projects containing at least one
        # product inside the manager's categories.
        if user.is_authenticated and user.is_dept_manager:
            managed = user.get_managed_category_ids()
            if not managed:
                return qs.none()
            qs = qs.filter(products__category_id__in=managed).distinct()

        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return ProjectListSerializer
        return ProjectDetailSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['patch'], url_path='toggle-active')
    def toggle_active(self, request, pk=None):
        project = self.get_object()
        project.is_active = not project.is_active
        project.save(update_fields=['is_active', 'updated_at'])
        return Response(ProjectDetailSerializer(project).data)

    # ── Image management ────────────────────────────────────────────────
    @action(
        detail=True, methods=['post'], url_path='images',
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_images(self, request, pk=None):
        project = self.get_object()
        files = request.FILES.getlist('files') or request.FILES.getlist('file')
        if not files:
            return Response(
                {'detail': 'لم يتم إرسال أي ملفات'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_count = project.images.count()
        had_cover = project.images.filter(is_cover=True).exists()
        created = []
        errors = []

        for f in files:
            ct = (f.content_type or '').lower()
            ext = _ALLOWED_IMAGE_CONTENT_TYPES.get(ct)
            if not ext:
                errors.append({'name': f.name, 'error': 'صيغة غير مدعومة (JPG/PNG/WEBP فقط)'})
                continue
            if f.size and f.size > _MAX_IMAGE_BYTES:
                errors.append({'name': f.name, 'error': 'الحجم أكبر من 10MB'})
                continue
            try:
                key = f'projects/{project.id}/{uuid.uuid4().hex}.{ext}'
                url = upload_bytes(key, f.read(), content_type=ct)
                next_order = existing_count + len(created)
                img = ProjectImage.objects.create(
                    project=project,
                    image_url=url,
                    image_key=key,
                    alt_text=project.name_ar,
                    sort_order=next_order,
                    is_cover=False,
                )
                created.append(img)
            except Exception as exc:
                logger.exception('Project image upload failed')
                errors.append({'name': f.name, 'error': str(exc)[:200]})

        # Promote a cover if the project still has none after the batch.
        if created and not had_cover:
            first = created[0]
            first.is_cover = True
            first.save(update_fields=['is_cover'])

        return Response(
            {
                'created': ProjectImageSerializer(created, many=True).data,
                'errors': errors,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=['delete'], url_path=r'images/(?P<image_id>\d+)')
    def delete_image(self, request, pk=None, image_id=None):
        project = self.get_object()
        img = get_object_or_404(ProjectImage, pk=image_id, project=project)
        was_cover = img.is_cover
        try:
            if img.image_key:
                delete_object(img.image_key)
        except Exception:
            logger.exception('Failed to delete R2 object %s', img.image_key)
        img.delete()

        # Promote a new cover if the deleted one was the cover
        if was_cover:
            new_cover = project.images.order_by('sort_order', 'created_at').first()
            if new_cover and not new_cover.is_cover:
                new_cover.is_cover = True
                new_cover.save(update_fields=['is_cover'])

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['patch'], url_path='images/reorder')
    def reorder_images(self, request, pk=None):
        project = self.get_object()
        raw_ids = request.data.get('ordered_ids') or []
        if not isinstance(raw_ids, list) or not raw_ids:
            return Response(
                {'detail': 'ordered_ids must be a non-empty list of image IDs'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        owned_ids = set(project.images.values_list('id', flat=True))
        ordered_ids: list[int] = []
        for x in raw_ids:
            try:
                xi = int(x)
            except (TypeError, ValueError):
                continue
            if xi in owned_ids and xi not in ordered_ids:
                ordered_ids.append(xi)
        if not ordered_ids:
            return Response(
                {'detail': 'لا توجد صور صالحة لإعادة الترتيب'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            for new_order, img_id in enumerate(ordered_ids):
                ProjectImage.objects.filter(pk=img_id).update(
                    sort_order=new_order,
                    is_cover=(new_order == 0),
                )
            # Anything not in the list goes to the end and is never the cover
            tail = list(owned_ids - set(ordered_ids))
            for offset, img_id in enumerate(tail):
                ProjectImage.objects.filter(pk=img_id).update(
                    sort_order=len(ordered_ids) + offset,
                    is_cover=False,
                )

        project.refresh_from_db()
        return Response(ProjectDetailSerializer(project).data)

    # ── Helper: search products the user is allowed to attach ──────────
    @action(
        detail=False, methods=['get'], url_path='search-products',
        permission_classes=[permissions.IsAuthenticated],
    )
    def search_products(self, request):
        q = (request.query_params.get('q') or '').strip()
        qs = _user_allowed_products_qs(request.user)
        if q:
            qs = qs.filter(
                Q(sku__icontains=q) |
                Q(product_name_ar__icontains=q) |
                Q(product_name_en__icontains=q)
            )
        qs = qs.order_by('product_name_ar')[:20]
        return Response(ProductMinimalSerializer(qs, many=True).data)


# ── Public endpoint: projects for a single product ────────────────────
@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def projects_for_product(request, product_id: int):
    """
    GET /api/v1/products/{id}/projects/
    Return the *active* projects that include this product.
    Public — used by the customer-facing product page.
    """
    qs = (
        Project.objects.filter(is_active=True, products__id=product_id)
        .prefetch_related('images', 'products', 'products__images')
        .order_by('sort_order', '-created_at')
        .distinct()
    )
    return Response(ProjectPublicSerializer(qs, many=True).data)
