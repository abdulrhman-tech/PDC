"""Analytics views — live completeness reports from real product data."""
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Avg, Q
from apps.analytics.models import CompletenessReport
from apps.analytics.serializers import CompletenessReportSerializer


# ── Scoring weights ──────────────────────────────────────────────────────────
SCORE_FIELDS = {
    'product_name_en': {'points': 10, 'label': 'الاسم الإنجليزي'},
    'description_ar':  {'points': 15, 'label': 'الوصف العربي'},
    'brand':           {'points': 10, 'label': 'الماركة'},
    'origin_country':  {'points': 10, 'label': 'بلد المنشأ'},
    'color':           {'points': 5,  'label': 'اللون'},
    'price_sar':       {'points': 10, 'label': 'السعر'},
    'ecommerce_url':   {'points': 5,  'label': 'رابط المتجر'},
    'attributes':      {'points': 15, 'label': 'السمات الديناميكية'},
    'main_image':      {'points': 15, 'label': 'الصورة الرئيسية'},
    'lifestyle_image': {'points': 5,  'label': 'الصورة الديكورية'},
}
MAX_SCORE = sum(f['points'] for f in SCORE_FIELDS.values())  # 100


def _score_product(p, approved_main_skus: set, approved_lifestyle_skus: set) -> int:
    """Calculate completeness score 0–100 for a single product."""
    score = 0
    if p.product_name_en and p.product_name_en.strip():
        score += 10
    if p.description_ar and p.description_ar.strip():
        score += 15
    if p.brand_id:
        score += 10
    if p.origin_country and p.origin_country.strip():
        score += 10
    if p.color and p.color.strip():
        score += 5
    if p.price_sar is not None:
        score += 10
    if p.ecommerce_url and p.ecommerce_url.strip():
        score += 5
    if p.attributes and isinstance(p.attributes, dict) and len(p.attributes) > 0:
        score += 15
    if p.sku in approved_main_skus:
        score += 15
    if p.sku in approved_lifestyle_skus:
        score += 5
    return score


class CompletenessReportViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CompletenessReport.objects.order_by('-generated_at')
    serializer_class = CompletenessReportSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user.can_view_reports():
            return CompletenessReport.objects.none()
        return super().get_queryset()

    @action(detail=False, methods=['get'], url_path='live', permission_classes=[permissions.IsAuthenticated])
    def live(self, request):
        """
        Compute a live completeness report directly from Product data.
        Supports filters: category_id, brand_id, score_range, inventory_type
        """
        from apps.products.models import Product
        from apps.images.models import ProductImage
        from apps.categories.models import Category
        from apps.products.models import Brand

        # Access control
        user = request.user
        if not user.can_view_reports():
            return Response({'detail': 'غير مسموح بعرض التقارير'}, status=403)

        # ── Detect dept manager restriction ──
        is_dept_manager = (user.role == 'مدير_قسم')
        managed_ids = user.get_managed_category_ids() if is_dept_manager else set()

        # ── Read filters ──
        # Dept managers may still narrow within their assigned scope, but any
        # explicit category_id they pass is intersected with their allowed set.
        requested_cat = request.query_params.get('category_id')
        if is_dept_manager:
            if requested_cat and int(requested_cat) in managed_ids:
                category_id = requested_cat
            else:
                category_id = None  # use full managed scope
        else:
            category_id = requested_cat

        brand_id       = request.query_params.get('brand_id')
        score_range    = request.query_params.get('score_range')    # low/medium/high/perfect
        inventory_type = request.query_params.get('inventory_type') # دوري / ستوك

        # ── Base queryset: active products only ──
        qs = Product.objects.filter(status='نشط').select_related('category', 'brand')

        if is_dept_manager:
            qs = qs.filter(category_id__in=managed_ids) if managed_ids else qs.none()

        if category_id:
            qs = qs.filter(category_id=category_id)
        if brand_id:
            qs = qs.filter(brand_id=brand_id)
        if inventory_type:
            qs = qs.filter(inventory_type=inventory_type)

        # ── Filter options (scoped by dept for managers) ──
        # Compute from products scoped to dept (but without brand/inv filters applied)
        if is_dept_manager:
            all_active = Product.objects.filter(
                status='نشط', category_id__in=managed_ids
            ).select_related('category', 'brand') if managed_ids else Product.objects.none()
        else:
            all_active = Product.objects.filter(status='نشط').select_related('category', 'brand')

        filter_categories = []
        if not is_dept_manager:
            cat_counts: dict[int, int] = {}
            for p in all_active:
                if p.category_id:
                    cat_counts[p.category_id] = cat_counts.get(p.category_id, 0) + 1
            for cat in Category.objects.filter(pk__in=cat_counts.keys()).order_by('name_ar'):
                filter_categories.append({'id': cat.id, 'name_ar': cat.name_ar, 'count': cat_counts[cat.id]})

        brand_counts: dict[int, int] = {}
        brand_names: dict[int, str] = {}
        for p in all_active:
            if p.brand_id:
                brand_counts[p.brand_id] = brand_counts.get(p.brand_id, 0) + 1
                brand_names[p.brand_id] = p.brand.name_ar or p.brand.name
        filter_brands = sorted([
            {'id': bid, 'name_ar': brand_names[bid], 'count': cnt}
            for bid, cnt in brand_counts.items()
        ], key=lambda x: -x['count'])

        inv_counts: dict[str, int] = {}
        for p in all_active:
            inv_counts[p.inventory_type] = inv_counts.get(p.inventory_type, 0) + 1
        filter_inventory = [{'value': k, 'label': k, 'count': v} for k, v in inv_counts.items()]

        # ── Load filtered products ──
        products = list(qs)
        total = len(products)

        if total == 0:
            return Response({
                'total_products': 0,
                'overall_score': 0,
                'complete_products': 0,
                'category_breakdown': [],
                'score_distribution': [],
                'field_gaps': [],
                'worst_products': [],
                'top_products': [],
                'filter_options': {
                    'categories': filter_categories,
                    'brands': filter_brands,
                    'inventory_types': filter_inventory,
                },
            })

        skus = [p.sku for p in products]

        # Pre-fetch image data (avoid N+1)
        main_skus = set(
            ProductImage.objects.filter(
                product__sku__in=skus, image_type='main', status='approved'
            ).values_list('product__sku', flat=True)
        )
        lifestyle_skus = set(
            ProductImage.objects.filter(
                product__sku__in=skus, image_type='lifestyle', status='approved'
            ).values_list('product__sku', flat=True)
        )

        # Score every product
        scored = []
        for p in products:
            s = _score_product(p, main_skus, lifestyle_skus)
            scored.append({
                'id': p.id,
                'sku': p.sku,
                'name_ar': p.product_name_ar,
                'category': p.category.name_ar if p.category else '—',
                'score': s,
                'missing': _missing_fields(p, main_skus, lifestyle_skus),
            })

        # Apply score_range filter
        score_range_map = {
            'low':     (0, 50),
            'medium':  (51, 79),
            'high':    (80, 99),
            'perfect': (100, 100),
        }
        if score_range and score_range in score_range_map:
            lo, hi = score_range_map[score_range]
            scored = [x for x in scored if lo <= x['score'] <= hi]

        total = len(scored)
        if total == 0:
            return Response({
                'total_products': 0,
                'overall_score': 0,
                'complete_products': 0,
                'category_breakdown': [],
                'score_distribution': [],
                'field_gaps': [],
                'worst_products': [],
                'top_products': [],
                'filter_options': {
                    'categories': filter_categories,
                    'brands': filter_brands,
                    'inventory_types': filter_inventory,
                },
            })

        overall_score = round(sum(x['score'] for x in scored) / total, 1)
        complete_products = sum(1 for x in scored if x['score'] >= 80)

        # ── Score distribution ──
        dist = [
            {'range': '0–25%',  'min': 0,  'max': 25, 'count': 0, 'color': '#EF4444'},
            {'range': '26–50%', 'min': 26, 'max': 50, 'count': 0, 'color': '#F97316'},
            {'range': '51–75%', 'min': 51, 'max': 75, 'count': 0, 'color': '#EAB308'},
            {'range': '76–100%','min': 76, 'max': 100,'count': 0, 'color': '#22C55E'},
        ]
        for x in scored:
            for bucket in dist:
                if bucket['min'] <= x['score'] <= bucket['max']:
                    bucket['count'] += 1
                    break

        # ── Category breakdown ──
        cat_map: dict[str, list[int]] = {}
        for x in scored:
            cat_map.setdefault(x['category'], []).append(x['score'])
        category_breakdown = sorted([
            {
                'category': cat,
                'avg_score': round(sum(scores) / len(scores), 1),
                'count': len(scores),
                'color': _score_color(round(sum(scores) / len(scores), 1)),
            }
            for cat, scores in cat_map.items()
        ], key=lambda x: x['avg_score'])

        # ── Field gaps ──
        field_missing: dict[str, int] = {k: 0 for k in SCORE_FIELDS}
        for x in scored:
            for f in x['missing']:
                field_missing[f] = field_missing.get(f, 0) + 1
        field_gaps = sorted([
            {
                'key': key,
                'label': SCORE_FIELDS[key]['label'],
                'points': SCORE_FIELDS[key]['points'],
                'missing_count': field_missing.get(key, 0),
                'missing_pct': round(field_missing.get(key, 0) / total * 100, 1),
            }
            for key in SCORE_FIELDS
            if field_missing.get(key, 0) > 0
        ], key=lambda x: -x['missing_count'])

        # ── Worst & Top products ──
        sorted_by_score = sorted(scored, key=lambda x: x['score'])
        worst_products = sorted_by_score[:15]
        top_products = sorted_by_score[-10:][::-1]

        if is_dept_manager:
            dept_names = list(user.departments.values_list('name_ar', flat=True))
            if not dept_names and user.department_id:
                dept_names = [user.department.name_ar]
            dept_name = ' / '.join(dept_names) if dept_names else None
        else:
            dept_name = None

        return Response({
            'total_products': total,
            'overall_score': overall_score,
            'complete_products': complete_products,
            'complete_pct': round(complete_products / total * 100, 1),
            'category_breakdown': category_breakdown,
            'score_distribution': dist,
            'field_gaps': field_gaps,
            'worst_products': worst_products,
            'top_products': top_products,
            'max_score': MAX_SCORE,
            'is_dept_restricted': is_dept_manager,
            'dept_name': dept_name,
            'filter_options': {
                'categories': filter_categories,
                'brands': filter_brands,
                'inventory_types': filter_inventory,
            },
        })


def _missing_fields(p, main_skus: set, lifestyle_skus: set) -> list[str]:
    missing = []
    if not (p.product_name_en and p.product_name_en.strip()):
        missing.append('product_name_en')
    if not (p.description_ar and p.description_ar.strip()):
        missing.append('description_ar')
    if not p.brand_id:
        missing.append('brand')
    if not (p.origin_country and p.origin_country.strip()):
        missing.append('origin_country')
    if not (p.color and p.color.strip()):
        missing.append('color')
    if p.price_sar is None:
        missing.append('price_sar')
    if not (p.ecommerce_url and p.ecommerce_url.strip()):
        missing.append('ecommerce_url')
    if not (p.attributes and isinstance(p.attributes, dict) and len(p.attributes) > 0):
        missing.append('attributes')
    if p.sku not in main_skus:
        missing.append('main_image')
    if p.sku not in lifestyle_skus:
        missing.append('lifestyle_image')
    return missing


def _score_color(score: float) -> str:
    if score >= 76:
        return '#22C55E'
    if score >= 51:
        return '#EAB308'
    if score >= 26:
        return '#F97316'
    return '#EF4444'
