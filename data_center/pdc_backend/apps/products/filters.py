"""
Django filter for Product model.
Supports filtering by: category (ID or slug), status, brand, inventory_type,
has_images, search (full-text), ordering.
"""
import django_filters
from apps.products.models import Product, ProductStatus, InventoryType


def get_descendant_ids(category_id: int) -> list[int]:
    """
    Return all descendant category IDs (including the category itself)
    using a single optimised query via the parent FK tree.
    Works for unlimited depth without django-mptt.
    """
    from apps.categories.models import Category

    # Fetch all categories once, build a children map in Python
    all_cats = Category.objects.only('id', 'parent_id').values_list('id', 'parent_id')
    children_map: dict[int, list[int]] = {}
    for cid, pid in all_cats:
        if pid is not None:
            children_map.setdefault(pid, []).append(cid)

    # BFS traversal from the root
    result = []
    queue = [category_id]
    while queue:
        current = queue.pop()
        result.append(current)
        queue.extend(children_map.get(current, []))
    return result


class ProductFilter(django_filters.FilterSet):
    category = django_filters.CharFilter(method='filter_category')
    status = django_filters.ChoiceFilter(choices=ProductStatus.choices)
    brand = django_filters.CharFilter(field_name='brand__id', lookup_expr='exact')
    inventory_type = django_filters.ChoiceFilter(choices=InventoryType.choices)
    origin_country = django_filters.CharFilter(lookup_expr='icontains')
    has_images = django_filters.BooleanFilter(method='filter_has_images')
    has_lifestyle_image = django_filters.BooleanFilter(method='filter_has_lifestyle')
    price_min = django_filters.NumberFilter(field_name='price_sar', lookup_expr='gte')
    price_max = django_filters.NumberFilter(field_name='price_sar', lookup_expr='lte')
    color = django_filters.CharFilter(lookup_expr='icontains')
    created_after = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')

    class Meta:
        model = Product
        fields = [
            'category', 'status', 'brand', 'inventory_type',
            'origin_country', 'has_images', 'price_min', 'price_max',
        ]

    def filter_category(self, queryset, name, value):
        """
        Filter by category ID or slug, including all descendant categories.
        e.g. clicking "Ceramics & Porcelain" shows products in that category
        AND all its child/grandchild categories.
        """
        if not value:
            return queryset
        if value.isdigit():
            ids = get_descendant_ids(int(value))
            return queryset.filter(category__id__in=ids)
        # Slug: resolve to ID first, then expand to descendants
        from apps.categories.models import Category
        try:
            cat = Category.objects.only('id').get(slug=value)
            ids = get_descendant_ids(cat.id)
            return queryset.filter(category__id__in=ids)
        except Category.DoesNotExist:
            return queryset.filter(category__slug=value)

    def filter_has_images(self, queryset, name, value):
        if value:
            return queryset.filter(images__isnull=False).distinct()
        return queryset.filter(images__isnull=True)

    def filter_has_lifestyle(self, queryset, name, value):
        if value:
            return queryset.filter(images__image_type='lifestyle', images__status='approved').distinct()
        return queryset.exclude(images__image_type='lifestyle', images__status='approved').distinct()
