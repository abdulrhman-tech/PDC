import logging
import uuid
import requests as http_requests
from urllib.parse import urlparse
from rest_framework import status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import DecorativeGeneration, DecorativeGenerationStatus, ProductImage, ImageType, ImageStatus
from .serializers import (
    DecorativeGenerationSerializer,
    AnalyzeImageSerializer,
    GenerateDecorativeSerializer,
    AnalyzeMultiSerializer,
    GenerateMultiSerializer,
    AnalyzeDualSerializer,
    GenerateDualSerializer,
    EnhanceImageSerializer,
)
from apps.integrations.openai_service import analyze_product_image
from apps.integrations.kie_ai_service import (
    create_generation_task,
    get_task_status,
    build_prompt,
    build_multi_product_prompt,
    build_dual_same_category_prompt,
    build_enhance_prompt,
    NEGATIVE_PROMPT,
    ENHANCE_NEGATIVE_PROMPT,
    check_credits,
)
from apps.products.models import Product
from apps.integrations.r2_client import upload_bytes

logger = logging.getLogger(__name__)

QUALITY_RESOLUTION_MAP = {
    'preview': '1K',
    'standard': '2K',
    'high': '4K',
}


class IsSuperAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == 'super_admin'
        )


@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def upload_source_image(request):
    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'لم يُرسل أي ملف'}, status=status.HTTP_400_BAD_REQUEST)

    allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if file.content_type not in allowed_types:
        return Response({'error': 'نوع الملف غير مدعوم. الأنواع المدعومة: JPG, PNG, WebP'}, status=status.HTTP_400_BAD_REQUEST)

    if file.size > 10 * 1024 * 1024:
        return Response({'error': 'حجم الملف أكبر من 10 ميجابايت'}, status=status.HTTP_400_BAD_REQUEST)

    ext = file.name.rsplit('.', 1)[-1].lower() if '.' in file.name else 'jpg'
    unique_name = f"{uuid.uuid4().hex[:12]}.{ext}"
    r2_key = f"decorative/source/{unique_name}"

    try:
        file_bytes = file.read()
        r2_url = upload_bytes(r2_key, file_bytes, content_type=file.content_type)
    except Exception as e:
        logger.error(f"R2 upload error for decorative source: {e}")
        return Response(
            {'error': 'فشل رفع الملف إلى التخزين'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response({
        'image_url': r2_url,
        'r2_key': r2_key,
        'filename': file.name,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def analyze_image(request):
    ser = AnalyzeImageSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    image_url = ser.validated_data['image_url']
    product_id = ser.validated_data.get('product_id')
    material_subtype_hint = ser.validated_data.get('material_subtype_hint', '')
    generation_mode_hint = ser.validated_data.get('generation_mode_hint', '')

    if product_id is not None:
        if not Product.objects.filter(id=product_id).exists():
            return Response(
                {'error': 'المنتج غير موجود'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    gen = DecorativeGeneration.objects.create(
        source_image_url=image_url,
        product_id=product_id,
        created_by=request.user,
        status=DecorativeGenerationStatus.ANALYZING,
    )

    try:
        analysis = analyze_product_image(
            image_url,
            material_subtype_hint=material_subtype_hint,
            generation_mode_hint=generation_mode_hint,
        )
        gen.vision_analysis = analysis
        gen.status = DecorativeGenerationStatus.ANALYZED
        gen.save()
    except Exception as e:
        logger.error(f"Vision analysis failed: {e}")
        gen.status = DecorativeGenerationStatus.FAILED
        gen.error_message = str(e)
        gen.save()
        return Response(
            {'error': f'فشل تحليل الصورة: {e}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(DecorativeGenerationSerializer(gen).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def generate_decorative(request):
    ser = GenerateDecorativeSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    data = ser.validated_data
    gen_id = data.pop('generation_id')

    try:
        gen = DecorativeGeneration.objects.get(id=gen_id, created_by=request.user)
    except DecorativeGeneration.DoesNotExist:
        return Response({'error': 'السجل غير موجود'}, status=status.HTTP_404_NOT_FOUND)

    if gen.status not in (DecorativeGenerationStatus.ANALYZED, DecorativeGenerationStatus.FAILED):
        return Response(
            {'error': 'لا يمكن التوليد في هذه الحالة'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    analysis = dict(gen.vision_analysis or {})
    override_desc = data.pop('override_description_en', '')
    override_mode = data.pop('override_generation_mode', '')
    custom_notes = data.pop('custom_notes', '')

    if override_desc:
        analysis['description_en'] = override_desc
    if override_mode:
        analysis['generation_mode'] = override_mode

    generation_mode = analysis.get('generation_mode', 'surface')

    prompt = build_prompt(
        product_description=analysis.get('description_en', 'building material product'),
        placement=data.get('placement', 'main feature'),
        selections=data,
        analysis=analysis,
        custom_notes=custom_notes,
    )

    gen.generation_settings = {**data, 'generation_mode': generation_mode}
    gen.prompt_used = prompt
    gen.negative_prompt = NEGATIVE_PROMPT
    gen.status = DecorativeGenerationStatus.GENERATING
    gen.error_message = ''
    gen.save()

    resolution = QUALITY_RESOLUTION_MAP.get(data.get('render_quality', 'standard'), '2K')

    try:
        task_id = create_generation_task(
            prompt=prompt,
            image_url=gen.source_image_url,
            aspect_ratio=data.get('aspect_ratio', '16:9'),
            resolution=resolution,
        )
        gen.kie_task_id = task_id
        gen.save()
    except Exception as e:
        logger.error(f"Kie.ai task creation failed: {e}")
        gen.status = DecorativeGenerationStatus.FAILED
        gen.error_message = str(e)
        gen.save()
        return Response(
            {'error': f'فشل إنشاء المهمة: {e}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(DecorativeGenerationSerializer(gen).data)


@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def enhance_image(request):
    """
    Enhance / clean up a product image using the same Kie.ai pipeline.
    Output is a clean catalog product photo (white background, sharp, well-lit) —
    NOT a decorative scene. Reuses the analyze step (must be called first).
    """
    ser = EnhanceImageSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    data = ser.validated_data
    gen_id = data.pop('generation_id')

    try:
        gen = DecorativeGeneration.objects.get(id=gen_id, created_by=request.user)
    except DecorativeGeneration.DoesNotExist:
        return Response({'error': 'السجل غير موجود'}, status=status.HTTP_404_NOT_FOUND)

    if gen.status not in (
        DecorativeGenerationStatus.ANALYZED,
        DecorativeGenerationStatus.FAILED,
        DecorativeGenerationStatus.COMPLETED,
    ):
        return Response(
            {'error': 'لا يمكن التوليد في هذه الحالة'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    analysis = dict(gen.vision_analysis or {})
    override_desc = data.pop('override_description_en', '')
    custom_notes = data.pop('custom_notes', '')

    if override_desc:
        analysis['description_en'] = override_desc

    prompt = build_enhance_prompt(analysis, data, custom_notes=custom_notes)

    gen.generation_settings = {**data, 'mode': 'enhance'}
    gen.prompt_used = prompt
    gen.negative_prompt = ENHANCE_NEGATIVE_PROMPT
    gen.status = DecorativeGenerationStatus.GENERATING
    gen.error_message = ''
    gen.save()

    resolution = QUALITY_RESOLUTION_MAP.get(data.get('render_quality', 'standard'), '2K')

    try:
        task_id = create_generation_task(
            prompt=prompt,
            image_url=gen.source_image_url,
            aspect_ratio=data.get('aspect_ratio', '1:1'),
            resolution=resolution,
        )
        gen.kie_task_id = task_id
        gen.save()
    except Exception as e:
        logger.error(f"Kie.ai enhancement task creation failed: {e}")
        gen.status = DecorativeGenerationStatus.FAILED
        gen.error_message = str(e)
        gen.save()
        return Response(
            {'error': f'فشل إنشاء المهمة: {e}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(DecorativeGenerationSerializer(gen).data)


_KIE_ALLOWED_IMAGE_HOSTS = {
    'storage.googleapis.com',
    'cdn.kie.ai',
    'kie.ai',
    'img.kie.ai',
    'aiquickdraw.com',
    'tempfile.aiquickdraw.com',
    'res.cloudinary.com',
}


def _persist_kie_result_to_r2(gen, kie_url: str) -> str:
    """
    Download a result image from kie.ai's temporary host and re-upload it to R2
    so the URL remains valid permanently. Returns the new R2 URL on success,
    or the original kie_url on failure (failure is logged, never raised).
    """
    parsed = urlparse(kie_url)
    host = parsed.hostname or ''
    if not any(host == a or host.endswith('.' + a) for a in _KIE_ALLOWED_IMAGE_HOSTS):
        logger.warning(f"persist_kie_result: disallowed host '{host}', keeping original URL")
        return kie_url

    try:
        resp = http_requests.get(kie_url, timeout=30, allow_redirects=False)
        if resp.status_code in (301, 302, 303, 307, 308):
            redirect_url = resp.headers.get('Location', '')
            redirect_host = urlparse(redirect_url).hostname or ''
            if not any(redirect_host == a or redirect_host.endswith('.' + a) for a in _KIE_ALLOWED_IMAGE_HOSTS):
                logger.warning(f"persist_kie_result: disallowed redirect host '{redirect_host}'")
                return kie_url
            resp = http_requests.get(redirect_url, timeout=30, allow_redirects=False)
        resp.raise_for_status()
        image_bytes = resp.content
        content_type = resp.headers.get('Content-Type', 'image/jpeg').split(';')[0].strip()
        if not content_type.startswith('image/'):
            logger.warning(f"persist_kie_result: unexpected content-type '{content_type}'")
            return kie_url
    except Exception as e:
        logger.warning(f"persist_kie_result: failed to download for gen={gen.id}: {e}")
        return kie_url

    ext_map = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}
    ext = ext_map.get(content_type, 'jpg')
    r2_key = f"decorative/results/{gen.id}_{uuid.uuid4().hex[:12]}.{ext}"

    try:
        r2_url = upload_bytes(r2_key, image_bytes, content_type=content_type)
        logger.info(f"persist_kie_result: gen={gen.id} stored at {r2_key}")
        return r2_url
    except Exception as e:
        logger.error(f"persist_kie_result: R2 upload failed for gen={gen.id}: {e}")
        return kie_url


@api_view(['GET'])
@permission_classes([IsSuperAdmin])
def check_generation_status(request, generation_id):
    try:
        gen = DecorativeGeneration.objects.get(id=generation_id, created_by=request.user)
    except DecorativeGeneration.DoesNotExist:
        return Response({'error': 'السجل غير موجود'}, status=status.HTTP_404_NOT_FOUND)

    if gen.status != DecorativeGenerationStatus.GENERATING or not gen.kie_task_id:
        return Response(DecorativeGenerationSerializer(gen).data)

    try:
        task_status = get_task_status(gen.kie_task_id)
    except Exception as e:
        logger.error(f"Failed to check task status: {e}")
        return Response(
            {'error': f'فشل التحقق من الحالة: {e}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if task_status['state'] == 'success':
        urls = task_status.get('result_urls', [])
        if urls:
            persistent_url = _persist_kie_result_to_r2(gen, urls[0])
            gen.result_image_url = persistent_url
            gen.status = DecorativeGenerationStatus.COMPLETED
        else:
            gen.status = DecorativeGenerationStatus.FAILED
            gen.error_message = 'اكتملت المهمة بدون نتيجة صورة'
        gen.save()
    elif task_status['state'] == 'failed':
        gen.status = DecorativeGenerationStatus.FAILED
        gen.error_message = task_status.get('error', 'Unknown error')
        gen.save()

    return Response(DecorativeGenerationSerializer(gen).data)


@api_view(['GET'])
@permission_classes([IsSuperAdmin])
def generation_history(request):
    qs = DecorativeGeneration.objects.select_related('product', 'created_by').filter(
        created_by=request.user,
    )
    product_id = request.query_params.get('product_id')
    if product_id:
        try:
            qs = qs.filter(product_id=int(product_id))
        except (ValueError, TypeError):
            return Response(
                {'error': 'معرف المنتج غير صالح'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    try:
        page_size = min(int(request.query_params.get('page_size', 20)), 100)
    except (ValueError, TypeError):
        page_size = 20

    qs = qs[:page_size]
    return Response(DecorativeGenerationSerializer(qs, many=True).data)


@api_view(['GET', 'DELETE'])
@permission_classes([IsSuperAdmin])
def generation_detail(request, generation_id):
    try:
        gen = DecorativeGeneration.objects.select_related('product', 'created_by').get(
            id=generation_id, created_by=request.user,
        )
    except DecorativeGeneration.DoesNotExist:
        return Response({'error': 'السجل غير موجود'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        gen_id = gen.id
        gen.delete()
        return Response(
            {'success': True, 'id': gen_id, 'message': 'تم حذف السجل'},
            status=status.HTTP_200_OK,
        )

    return Response(DecorativeGenerationSerializer(gen).data)


@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def attach_to_product(request, generation_id):
    """
    Attach a completed decorative generation's result image to a product
    as a lifestyle image (pending_review).
    """
    try:
        gen = DecorativeGeneration.objects.get(id=generation_id, created_by=request.user)
    except DecorativeGeneration.DoesNotExist:
        return Response({'error': 'السجل غير موجود'}, status=status.HTTP_404_NOT_FOUND)

    if gen.status != DecorativeGenerationStatus.COMPLETED or not gen.result_image_url:
        return Response(
            {'error': 'التوليد لم يكتمل بعد أو لا توجد صورة ناتجة'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    raw_product_ids = request.data.get('product_ids', [])
    product_id = request.data.get('product_id') or gen.product_id

    if not isinstance(raw_product_ids, list):
        return Response(
            {'error': 'product_ids يجب أن يكون قائمة'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    product_ids = []
    for pid in raw_product_ids:
        try:
            product_ids.append(int(pid))
        except (TypeError, ValueError):
            return Response(
                {'error': f'معرف المنتج غير صالح: {pid}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
    product_ids = list(dict.fromkeys(product_ids))

    if not product_ids and not product_id:
        return Response(
            {'error': 'يرجى تحديد المنتج المراد إضافة الصورة إليه'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not product_ids:
        product_ids = [int(product_id)]

    products_to_attach = []
    for pid in product_ids:
        try:
            products_to_attach.append(Product.objects.select_related('category').get(id=pid))
        except Product.DoesNotExist:
            return Response({'error': f'المنتج برقم {pid} غير موجود'}, status=status.HTTP_404_NOT_FOUND)

    result_url = gen.result_image_url

    ALLOWED_IMAGE_HOSTS = {
        'storage.googleapis.com',
        'cdn.kie.ai',
        'kie.ai',
        'img.kie.ai',
        'aiquickdraw.com',
        'tempfile.aiquickdraw.com',
        'res.cloudinary.com',
    }
    parsed = urlparse(result_url)
    host = parsed.hostname or ''
    if not any(host == allowed or host.endswith('.' + allowed) for allowed in ALLOWED_IMAGE_HOSTS):
        logger.warning(f"attach_to_product: disallowed image host '{host}'")
        return Response(
            {'error': 'مصدر الصورة غير مسموح به'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        resp = http_requests.get(result_url, timeout=30, allow_redirects=False)
        if resp.status_code in (301, 302, 303, 307, 308):
            redirect_url = resp.headers.get('Location', '')
            redirect_parsed = urlparse(redirect_url)
            redirect_host = redirect_parsed.hostname or ''
            if not any(redirect_host == a or redirect_host.endswith('.' + a) for a in ALLOWED_IMAGE_HOSTS):
                logger.warning(f"attach_to_product: disallowed redirect host '{redirect_host}'")
                return Response(
                    {'error': 'مصدر الصورة بعد إعادة التوجيه غير مسموح به'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            resp = http_requests.get(redirect_url, timeout=30, allow_redirects=False)
        resp.raise_for_status()
        image_bytes = resp.content
        content_type = resp.headers.get('Content-Type', 'image/jpeg').split(';')[0].strip()
        if not content_type.startswith('image/'):
            logger.warning(f"attach_to_product: unexpected content-type '{content_type}'")
            return Response(
                {'error': f'نوع الملف غير مدعوم: {content_type}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
    except Exception as e:
        logger.error(f"Failed to fetch generated image for attach: {e}")
        return Response(
            {'error': f'فشل تحميل الصورة المولدة: {e}'},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    ext_map = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}
    ext = ext_map.get(content_type, 'jpg')

    attached = []
    errors = []
    for product in products_to_attach:
        unique_name = f"ai_{uuid.uuid4().hex[:12]}.{ext}"
        category_slug = product.category.slug if hasattr(product.category, 'slug') else str(product.category_id)
        r2_key = f"products/{category_slug}/{product.sku}/lifestyle/{unique_name}"

        try:
            r2_url = upload_bytes(r2_key, image_bytes, content_type=content_type)
        except Exception as e:
            logger.error(f"R2 upload failed for attach-to-product (product {product.id}): {e}")
            errors.append({'product_id': product.id, 'product_name': product.product_name_ar, 'error': str(e)})
            continue

        img = ProductImage.objects.create(
            product=product,
            image_type=ImageType.LIFESTYLE,
            r2_key=r2_key,
            r2_url=r2_url,
            original_filename=unique_name,
            status=ImageStatus.APPROVED,
            is_ai_generated=True,
            ai_prompt_used=gen.prompt_used or '',
            uploaded_by=request.user,
        )
        attached.append({
            'image_id': img.id,
            'product_id': product.id,
            'product_name': product.product_name_ar,
            'r2_url': img.r2_url,
        })

    if not gen.product_id and attached:
        gen.product_id = attached[0]['product_id']
        gen.save(update_fields=['product'])

    if len(products_to_attach) == 1 and attached:
        return Response({
            'success': True,
            'image_id': attached[0]['image_id'],
            'image_type': 'lifestyle',
            'r2_url': attached[0]['r2_url'],
            'product_id': attached[0]['product_id'],
            'product_name': attached[0]['product_name'],
            'status': 'approved',
            'message': f'تمت إضافة الصورة بنجاح إلى منتج "{attached[0]["product_name"]}"',
        }, status=status.HTTP_201_CREATED)

    return Response({
        'success': len(errors) == 0,
        'attached_count': len(attached),
        'error_count': len(errors),
        'attached': attached,
        'errors': errors,
        'message': f'تمت إضافة الصورة إلى {len(attached)} منتج' + (f' مع {len(errors)} أخطاء' if errors else ''),
    }, status=status.HTTP_201_CREATED if attached else status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def bulk_images_upload(request):
    """
    رفع صور جماعي مرتبط بأكواد المنتجات.

    اصطلاحان مدعومان (يمكن خلطهما في نفس الطلب):

    1) ملفات مفردة (الاصطلاح القديم):
         {sku}.jpg          → صورة gallery (order=0)
         {sku}_1.jpg        → صورة gallery إضافية
         {sku}_2.jpg        → صورة gallery إضافية

    2) مجلدات (الاصطلاح الجديد):
         {sku}/1.jpg        → الصورة الرئيسية (image_type=MAIN, order=1)
         {sku}/2.jpg        → gallery, order=2
         {sku}/3.jpg        → gallery, order=3
         {sku}/4.jpg        → gallery, order=4
       اسم المجلد قد يحتوي امتداد صورة (مثل F19.006-2.jpg) — يُجرَّد تلقائياً.
       عند وجود 1.jpg، تُخفَّض الصورة الرئيسية القديمة للمنتج (إن وجدت)
       إلى gallery قبل تثبيت الجديدة كرئيسية.
    """
    files = request.FILES.getlist('files')
    if not files:
        return Response({'error': 'لم تُرسل أي ملفات'}, status=status.HTTP_400_BAD_REQUEST)

    if len(files) > 200:
        return Response({'error': 'الحد الأقصى 200 صورة في الطلب الواحد'}, status=status.HTTP_400_BAD_REQUEST)

    # Optional parallel list of relative paths from the client (folder mode).
    # When supplied it MUST be the same length as `files` so we can zip them.
    relative_paths = request.POST.getlist('relative_paths')
    if relative_paths and len(relative_paths) != len(files):
        return Response(
            {'error': 'عدم تطابق بين الملفات والمسارات المرسلة'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    import re

    IMG_EXTS = {'.jpg', '.jpeg', '.png', '.webp'}

    def strip_image_ext(name: str) -> str:
        lower = name.lower()
        for ext in IMG_EXTS:
            if lower.endswith(ext):
                return name[: -len(ext)]
        return name

    def parse_sku_from_filename(filename: str) -> str:
        """Parse SKU from a loose filename like SKU.jpg or SKU_2.jpg."""
        name = strip_image_ext(filename)
        match = re.match(r'^(.+)_(\d+)$', name)
        if match:
            return match.group(1)
        return name

    def parse_relative_path(rel_path: str, fallback_filename: str):
        """
        Returns a tuple (sku, image_type, order) given a relative path string.

        Folder mode (rel_path contains a '/'):
          - sku  = strip_image_ext(first segment)
          - file = last segment, e.g. '1.jpg'
          - if file's stem is an integer N:
                N == 1 → (sku, MAIN, 1)
                N >  1 → (sku, GALLERY, N)
          - otherwise: (sku, GALLERY, 0)

        Loose mode (no '/'): legacy behavior, GALLERY with order=0.
        """
        rel_path = (rel_path or '').strip().replace('\\', '/')
        if '/' in rel_path:
            parts = [p for p in rel_path.split('/') if p]
            if len(parts) >= 2:
                folder_name = parts[0]
                file_name = parts[-1]
                sku = strip_image_ext(folder_name)
                stem = strip_image_ext(file_name)
                try:
                    n = int(stem)
                    if n == 1:
                        return sku, ImageType.MAIN, 1
                    return sku, ImageType.GALLERY, n
                except ValueError:
                    return sku, ImageType.GALLERY, 0
        # loose / no folder
        return parse_sku_from_filename(fallback_filename), ImageType.GALLERY, 0

    matched = []
    unmatched = []
    errors = []

    for idx, file in enumerate(files):
        fname = file.name
        rel_path = relative_paths[idx] if relative_paths else fname

        sku, image_type, order = parse_relative_path(rel_path, fname)

        try:
            product = Product.objects.select_related('category').get(sku=sku)
        except Product.DoesNotExist:
            unmatched.append({
                'filename': rel_path,
                'parsed_sku': sku,
            })
            continue

        allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
        if file.content_type not in allowed_types:
            errors.append({'filename': rel_path, 'error': f'نوع الملف غير مدعوم: {file.content_type}'})
            continue

        if file.size > 10 * 1024 * 1024:
            errors.append({'filename': rel_path, 'error': 'حجم الملف أكبر من 10 ميجابايت'})
            continue

        ext = fname.rsplit('.', 1)[-1].lower() if '.' in fname else 'jpg'
        unique_name = f"{uuid.uuid4().hex[:10]}.{ext}"
        category_slug = product.category.slug if hasattr(product.category, 'slug') else str(product.category_id)
        sub_dir = 'main' if image_type == ImageType.MAIN else 'gallery'
        r2_key = f"products/{category_slug}/{product.sku}/{sub_dir}/{unique_name}"

        try:
            file_bytes = file.read()
            r2_url = upload_bytes(r2_key, file_bytes, content_type=file.content_type)
        except Exception as e:
            logger.error(f"Bulk upload R2 error for {rel_path}: {e}")
            errors.append({'filename': rel_path, 'error': 'فشل رفع الملف إلى التخزين'})
            continue

        # If we're inserting a new MAIN, demote ANY existing MAIN of this
        # product to GALLERY first. Done before each insert (not just once
        # per product) so that if the same SKU appears with multiple 1.jpg
        # entries in the same request — e.g. two folders that strip to the
        # same SKU — only the LAST one remains MAIN ("last one wins").
        if image_type == ImageType.MAIN:
            ProductImage.objects.filter(
                product=product,
                image_type=ImageType.MAIN,
            ).update(image_type=ImageType.GALLERY)

        img = ProductImage.objects.create(
            product=product,
            image_type=image_type,
            r2_key=r2_key,
            r2_url=r2_url,
            original_filename=fname,
            file_size_kb=round(file.size / 1024),
            status=ImageStatus.APPROVED,
            order=order,
            uploaded_by=request.user,
        )
        matched.append({
            'filename': rel_path,
            'sku': sku,
            'product_name': product.product_name_ar,
            'image_id': img.id,
            'r2_url': r2_url,
            'image_type': image_type,
            'order': order,
        })

    return Response({
        'total': len(files),
        'matched_count': len(matched),
        'unmatched_count': len(unmatched),
        'error_count': len(errors),
        'matched': matched,
        'unmatched': unmatched,
        'errors': errors,
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsSuperAdmin])
def kie_credits(request):
    try:
        credits = check_credits()
        return Response(credits)
    except Exception as e:
        return Response(
            {'error': f'فشل جلب الرصيد: {e}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def analyze_multi(request):
    ser = AnalyzeMultiSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    slots = ser.validated_data['slots']

    for slot in slots:
        pid = slot.get('product_id')
        if pid is not None and not Product.objects.filter(id=pid).exists():
            return Response(
                {'error': f'المنتج برقم {pid} غير موجود'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    roles = [s['role'] for s in slots]
    if roles.count('floor') > 1:
        return Response({'error': 'لا يمكن تحديد أكثر من منتج واحد كأرضية'}, status=status.HTTP_400_BAD_REQUEST)
    if roles.count('wall') > 1:
        return Response({'error': 'لا يمكن تحديد أكثر من منتج واحد كجدار'}, status=status.HTTP_400_BAD_REQUEST)

    analyzed_slots = []

    for slot in slots:
        image_url = slot['image_url']
        material_subtype_hint = slot.get('material_subtype_hint', '')
        generation_mode_hint = slot.get('generation_mode_hint', '')

        try:
            analysis = analyze_product_image(
                image_url,
                material_subtype_hint=material_subtype_hint,
                generation_mode_hint=generation_mode_hint,
            )
        except Exception as e:
            logger.error(f"Multi-product vision analysis failed for {image_url[:60]}: {e}")
            return Response(
                {'error': f'فشل تحليل صورة المنتج ({slot["role"]}): {e}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        analyzed_slots.append({
            'role': slot['role'],
            'image_url': image_url,
            'product_id': slot.get('product_id'),
            'material_subtype_hint': material_subtype_hint,
            'generation_mode_hint': generation_mode_hint,
            'analysis': analysis,
        })

    PLACEMENT_TO_SPACE = {
        'bathroom': 'bathroom',
        'kitchen': 'kitchen',
        'bedroom': 'bedroom',
        'living_room': 'living_room',
        'outdoor': 'outdoor',
        'pool_area': 'outdoor',
        'entrance': 'lobby',
        'studio': 'living_room',
        'office': 'office',
    }
    SUBTYPE_TO_SPACE = {
        'sanitary': 'bathroom',
        'faucet': 'bathroom',
        'bathtub': 'bathroom',
        'shower': 'bathroom',
        'toilet': 'bathroom',
        'basin': 'bathroom',
        'kitchen_sink': 'kitchen',
    }

    space_votes: dict[str, int] = {}
    for slot in analyzed_slots:
        analysis = slot.get('analysis', {})
        placement = analysis.get('recommended_placement', '')
        subtype = analysis.get('material_subtype', '')

        space = PLACEMENT_TO_SPACE.get(placement, '')
        if not space and subtype:
            space = SUBTYPE_TO_SPACE.get(subtype, '')

        if space:
            space_votes[space] = space_votes.get(space, 0) + 1

    suggested_space_type = ''
    if space_votes:
        suggested_space_type = max(space_votes, key=space_votes.get)

    first_image = analyzed_slots[0]['image_url'] if analyzed_slots else ''
    gen = DecorativeGeneration.objects.create(
        source_image_url=first_image,
        created_by=request.user,
        status=DecorativeGenerationStatus.ANALYZED,
        is_multi_product=True,
        multi_product_data=analyzed_slots,
        vision_analysis=analyzed_slots[0].get('analysis', {}),
    )

    resp_data = DecorativeGenerationSerializer(gen).data
    resp_data['suggested_space_type'] = suggested_space_type
    return Response(resp_data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def generate_multi(request):
    ser = GenerateMultiSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    data = ser.validated_data
    gen_id = data.pop('generation_id')

    try:
        gen = DecorativeGeneration.objects.get(id=gen_id, created_by=request.user)
    except DecorativeGeneration.DoesNotExist:
        return Response({'error': 'السجل غير موجود'}, status=status.HTTP_404_NOT_FOUND)

    if not gen.is_multi_product:
        return Response(
            {'error': 'هذا السجل ليس مشهداً متعدد المنتجات'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if gen.status not in (DecorativeGenerationStatus.ANALYZED, DecorativeGenerationStatus.FAILED):
        return Response(
            {'error': 'لا يمكن التوليد في هذه الحالة'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    slots = gen.multi_product_data or []
    if not slots or len(slots) < 2:
        return Response(
            {'error': 'يجب أن يحتوي المشهد على منتجين على الأقل'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    slot_overrides = data.pop('slot_overrides', [])
    for override in slot_overrides:
        idx = override.pop('index', -1)
        if 0 <= idx < len(slots):
            analysis = slots[idx].get('analysis', {})
            for key, value in override.items():
                if value:
                    analysis[key] = value
            slots[idx]['analysis'] = analysis
    if slot_overrides:
        gen.multi_product_data = slots
        gen.save(update_fields=['multi_product_data'])

    image_urls = [s.get('image_url') for s in slots if s.get('image_url')]
    if len(image_urls) < 2:
        return Response(
            {'error': 'بيانات المنتجات غير مكتملة — أعد المحاولة'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    custom_notes = data.pop('custom_notes', '')

    prompt = build_multi_product_prompt(slots, data, custom_notes=custom_notes)

    gen.generation_settings = data
    gen.prompt_used = prompt
    gen.negative_prompt = NEGATIVE_PROMPT
    gen.status = DecorativeGenerationStatus.GENERATING
    gen.error_message = ''
    gen.save()

    image_urls = [s['image_url'] for s in slots if s.get('image_url')]
    resolution = QUALITY_RESOLUTION_MAP.get(data.get('render_quality', 'standard'), '2K')

    try:
        task_id = create_generation_task(
            prompt=prompt,
            image_urls=image_urls,
            aspect_ratio=data.get('aspect_ratio', '16:9'),
            resolution=resolution,
        )
        gen.kie_task_id = task_id
        gen.save()
    except Exception as e:
        logger.error(f"Kie.ai multi-product task creation failed: {e}")
        gen.status = DecorativeGenerationStatus.FAILED
        gen.error_message = str(e)
        gen.save()
        return Response(
            {'error': f'فشل إنشاء المهمة: {e}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(DecorativeGenerationSerializer(gen).data)


@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def analyze_dual(request):
    """Analyze 2 products of the same category for dual-surface mixing."""
    ser = AnalyzeDualSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    surface = ser.validated_data['surface']
    slots = ser.validated_data['slots']

    if len(slots) != 2:
        return Response(
            {'error': 'يجب اختيار منتجين بالضبط لهذا الوضع'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    for slot in slots:
        pid = slot.get('product_id')
        if pid is not None and not Product.objects.filter(id=pid).exists():
            return Response(
                {'error': f'المنتج برقم {pid} غير موجود'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    analyzed_slots = []
    for idx, slot in enumerate(slots):
        image_url = slot['image_url']
        material_subtype_hint = slot.get('material_subtype_hint', '')
        generation_mode_hint = slot.get('generation_mode_hint', '')

        try:
            analysis = analyze_product_image(
                image_url,
                material_subtype_hint=material_subtype_hint,
                generation_mode_hint=generation_mode_hint,
            )
        except Exception as e:
            logger.error(f"Dual-mode vision analysis failed for {image_url[:60]}: {e}")
            return Response(
                {'error': f'فشل تحليل صورة المنتج: {e}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        analyzed_slots.append({
            'slot_index': idx,
            'role': 'pattern_a' if idx == 0 else 'pattern_b',
            'surface': surface,
            'image_url': image_url,
            'product_id': slot.get('product_id'),
            'material_subtype_hint': material_subtype_hint,
            'generation_mode_hint': generation_mode_hint,
            'analysis': analysis,
        })

    # Suggest a space type from the surface choice + analyses (best-effort)
    PLACEMENT_TO_SPACE = {
        'bathroom': 'bathroom',
        'kitchen': 'kitchen',
        'bedroom': 'bedroom',
        'living_room': 'living_room',
        'outdoor': 'outdoor',
        'pool_area': 'outdoor',
        'entrance': 'lobby',
        'office': 'office',
    }
    space_votes: dict[str, int] = {}
    for slot in analyzed_slots:
        placement = slot.get('analysis', {}).get('recommended_placement', '')
        space = PLACEMENT_TO_SPACE.get(placement, '')
        if space:
            space_votes[space] = space_votes.get(space, 0) + 1
    suggested_space_type = max(space_votes, key=space_votes.get) if space_votes else ''

    first_image = analyzed_slots[0]['image_url']
    gen = DecorativeGeneration.objects.create(
        source_image_url=first_image,
        created_by=request.user,
        status=DecorativeGenerationStatus.ANALYZED,
        is_multi_product=True,
        multi_product_data=analyzed_slots,
        vision_analysis=analyzed_slots[0].get('analysis', {}),
        # Mark this generation as a dual-same-category scene so the
        # generate step can route to the correct prompt builder.
        generation_settings={'dual_mode': True, 'surface': surface},
    )

    resp_data = DecorativeGenerationSerializer(gen).data
    resp_data['suggested_space_type'] = suggested_space_type
    resp_data['surface'] = surface
    return Response(resp_data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def generate_dual(request):
    """Generate a dual-same-category mixed-surface scene."""
    ser = GenerateDualSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    data = ser.validated_data
    gen_id = data.pop('generation_id')
    pattern = data.pop('pattern')

    try:
        gen = DecorativeGeneration.objects.get(id=gen_id, created_by=request.user)
    except DecorativeGeneration.DoesNotExist:
        return Response({'error': 'السجل غير موجود'}, status=status.HTTP_404_NOT_FOUND)

    if not gen.is_multi_product or not (gen.generation_settings or {}).get('dual_mode'):
        return Response(
            {'error': 'هذا السجل ليس مشهداً بنمط دمج خامتين'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if gen.status not in (DecorativeGenerationStatus.ANALYZED, DecorativeGenerationStatus.FAILED):
        return Response(
            {'error': 'لا يمكن التوليد في هذه الحالة'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    slots = list(gen.multi_product_data or [])
    if len(slots) != 2:
        return Response(
            {'error': 'يجب أن يحتوي المشهد على منتجين بالضبط'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Preserve A/B identity: sort by explicit slot_index when present,
    # falling back to original positional order for backward compatibility.
    if all(isinstance(s.get('slot_index'), int) for s in slots):
        slots.sort(key=lambda s: s['slot_index'])

    surface = (gen.generation_settings or {}).get('surface', 'floor')

    # Apply slot overrides if any (same shape as multi)
    slot_overrides = data.pop('slot_overrides', [])
    for override in slot_overrides:
        idx = override.pop('index', -1)
        if 0 <= idx < len(slots):
            analysis = slots[idx].get('analysis', {})
            for key, value in override.items():
                if value:
                    analysis[key] = value
            slots[idx]['analysis'] = analysis
    if slot_overrides:
        gen.multi_product_data = slots
        gen.save(update_fields=['multi_product_data'])

    image_urls = [s.get('image_url') for s in slots if s.get('image_url')]
    if len(image_urls) != 2:
        return Response(
            {'error': 'بيانات المنتجات غير مكتملة — أعد المحاولة'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    custom_notes = data.pop('custom_notes', '')

    prompt = build_dual_same_category_prompt(
        slots=slots,
        pattern=pattern,
        surface=surface,
        selections=data,
        custom_notes=custom_notes,
    )

    # Persist settings — preserve dual_mode + surface markers
    settings_blob = dict(data)
    settings_blob['dual_mode'] = True
    settings_blob['surface'] = surface
    settings_blob['pattern'] = pattern
    gen.generation_settings = settings_blob
    gen.prompt_used = prompt
    gen.negative_prompt = NEGATIVE_PROMPT
    gen.status = DecorativeGenerationStatus.GENERATING
    gen.error_message = ''
    gen.save()

    resolution = QUALITY_RESOLUTION_MAP.get(data.get('render_quality', 'standard'), '2K')

    try:
        task_id = create_generation_task(
            prompt=prompt,
            image_urls=image_urls,
            aspect_ratio=data.get('aspect_ratio', '16:9'),
            resolution=resolution,
        )
        gen.kie_task_id = task_id
        gen.save()
    except Exception as e:
        logger.error(f"Kie.ai dual-mode task creation failed: {e}")
        gen.status = DecorativeGenerationStatus.FAILED
        gen.error_message = str(e)
        gen.save()
        return Response(
            {'error': f'فشل إنشاء المهمة: {e}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(DecorativeGenerationSerializer(gen).data)
