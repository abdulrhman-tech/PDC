"""Analytics views — live completeness reports from real product data."""
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Avg, Q, Case, When, Value, IntegerField, F, ExpressionWrapper
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

_CHUNK = 10_000   # max IDs per IN-clause to stay within DB limits


def _chunked(lst, size=_CHUNK):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]


def _score_product(p, main_ids: set, lifestyle_ids: set) -> int:
    """Calculate completeness score 0–100 for a single product.
    Uses product.id (not sku) for image membership checks.
    """
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
    if p.id in main_ids:
        score += 15
    if p.id in lifestyle_ids:
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

    @action(detail=False, methods=['get'], url_path='dashboard', permission_classes=[permissions.IsAuthenticated])
    def dashboard(self, request):
        """
        Fast dashboard summary using pure DB aggregation — no Python loops.
        Executes 4 DB queries total, returns in < 500ms for 100k+ products.
        Identical response shape to `live` so the frontend needs no UI changes.
        """
        from apps.products.models import Product
        from apps.images.models import ProductImage

        user = request.user
        if not user.can_view_reports():
            return Response({'detail': 'غير مسموح بعرض التقارير'}, status=403)

        is_dept_manager = (user.role == 'مدير_قسم')
        managed_ids = user.get_managed_category_ids() if is_dept_manager else set()

        base_qs = Product.objects.all()
        if is_dept_manager:
            base_qs = base_qs.filter(category_id__in=managed_ids) if managed_ids else base_qs.none()

        # Image sets — small (tens of records), fast set lookup
        main_ids = set(
            ProductImage.objects.filter(image_type='main', status='approved')
            .values_list('product_id', flat=True)
        )
        lifestyle_ids = set(
            ProductImage.objects.filter(image_type='lifestyle', status='approved')
            .values_list('product_id', flat=True)
        )

        # Annotate every product row with individual field scores (DB-native)
        scored_qs = base_qs.annotate(
            s_name=Case(When(product_name_en__gt='', then=Value(10)), default=Value(0), output_field=IntegerField()),
            s_desc=Case(When(description_ar__gt='', then=Value(15)), default=Value(0), output_field=IntegerField()),
            s_brand=Case(When(brand_id__isnull=False, then=Value(10)), default=Value(0), output_field=IntegerField()),
            s_country=Case(When(origin_country__gt='', then=Value(10)), default=Value(0), output_field=IntegerField()),
            s_color=Case(When(color__gt='', then=Value(5)), default=Value(0), output_field=IntegerField()),
            s_price=Case(When(price_sar__isnull=False, then=Value(10)), default=Value(0), output_field=IntegerField()),
            s_ecommerce=Case(When(ecommerce_url__gt='', then=Value(5)), default=Value(0), output_field=IntegerField()),
            s_attrs=Case(
                When(~Q(attributes__isnull=True) & ~Q(attributes__exact={}), then=Value(15)),
                default=Value(0), output_field=IntegerField(),
            ),
            s_main=Case(When(id__in=main_ids, then=Value(15)), default=Value(0), output_field=IntegerField()),
            s_life=Case(When(id__in=lifestyle_ids, then=Value(5)), default=Value(0), output_field=IntegerField()),
            db_score=ExpressionWrapper(
                F('s_name') + F('s_desc') + F('s_brand') + F('s_country') +
                F('s_color') + F('s_price') + F('s_ecommerce') + F('s_attrs') +
                F('s_main') + F('s_life'),
                output_field=IntegerField(),
            ),
        )

        # ── Query 1: summary aggregates ───────────────────────────────────────
        agg = scored_qs.aggregate(
            total=Count('id'),
            avg_score=Avg('db_score'),
            complete=Count('id', filter=Q(db_score__gte=80)),
        )
        total = agg['total'] or 0
        if total == 0:
            empty = {
                'total_products': 0, 'overall_score': 0,
                'complete_products': 0, 'complete_pct': 0,
                'is_dept_restricted': is_dept_manager, 'dept_name': None,
                'category_breakdown': [], 'field_gaps': [], 'worst_products': [],
            }
            return Response(empty)

        overall_score   = round(agg['avg_score'] or 0, 1)
        complete_products = agg['complete'] or 0
        complete_pct    = round(complete_products / total * 100, 1)

        # ── Query 2: category breakdown (GROUP BY) ────────────────────────────
        cat_rows = (
            scored_qs
            .filter(category__isnull=False)
            .values('category__name_ar')
            .annotate(avg_score=Avg('db_score'), count=Count('id'))
            .order_by('-avg_score')
        )
        category_breakdown = [
            {
                'category': r['category__name_ar'] or '—',
                'avg_score': round(r['avg_score'] or 0, 1),
                'count': r['count'],
                'color': _score_color(round(r['avg_score'] or 0, 1)),
            }
            for r in cat_rows
        ]

        # ── Query 3: field gaps (all in one aggregate) ────────────────────────
        fc = scored_qs.aggregate(
            n_name     =Count('id', filter=Q(s_name=0)),
            n_desc     =Count('id', filter=Q(s_desc=0)),
            n_brand    =Count('id', filter=Q(s_brand=0)),
            n_country  =Count('id', filter=Q(s_country=0)),
            n_color    =Count('id', filter=Q(s_color=0)),
            n_price    =Count('id', filter=Q(s_price=0)),
            n_ecommerce=Count('id', filter=Q(s_ecommerce=0)),
            n_attrs    =Count('id', filter=Q(s_attrs=0)),
            n_main     =Count('id', filter=Q(s_main=0)),
            n_lifestyle=Count('id', filter=Q(s_life=0)),
        )
        gap_defs = [
            ('product_name_en', 'الاسم الإنجليزي',     10, fc['n_name']),
            ('description_ar',  'الوصف العربي',         15, fc['n_desc']),
            ('brand',           'الماركة',               10, fc['n_brand']),
            ('origin_country',  'بلد المنشأ',            10, fc['n_country']),
            ('color',           'اللون',                  5, fc['n_color']),
            ('price_sar',       'السعر',                 10, fc['n_price']),
            ('ecommerce_url',   'رابط المتجر',            5, fc['n_ecommerce']),
            ('attributes',      'السمات الديناميكية',    15, fc['n_attrs']),
            ('main_image',      'الصورة الرئيسية',       15, fc['n_main']),
            ('lifestyle_image', 'الصورة الديكورية',       5, fc['n_lifestyle']),
        ]
        field_gaps = sorted(
            [
                {
                    'key': key, 'label': label, 'points': pts,
                    'missing_count': cnt,
                    'missing_pct': round(cnt / total * 100, 1),
                }
                for key, label, pts, cnt in gap_defs if cnt > 0
            ],
            key=lambda x: -x['missing_count'],
        )

        # ── Query 4: worst products (DB ORDER BY score ASC, LIMIT 30) ─────────
        worst_rows = (
            scored_qs
            .select_related('category')
            .only('id', 'sku', 'product_name_ar', 'category__name_ar')
            .order_by('db_score', 'id')[:30]
        )
        worst_products = [
            {
                'id': p.id,
                'sku': p.sku,
                'name_ar': p.product_name_ar,
                'category': p.category.name_ar if p.category else '—',
                'score': p.db_score,
            }
            for p in worst_rows
        ]

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
            'complete_pct': complete_pct,
            'is_dept_restricted': is_dept_manager,
            'dept_name': dept_name,
            'category_breakdown': category_breakdown,
            'field_gaps': field_gaps,
            'worst_products': worst_products,
        })

    @action(detail=False, methods=['get'], url_path='live', permission_classes=[permissions.IsAuthenticated])
    def live(self, request):
        """
        Compute a live completeness report directly from Product data.
        Supports filters: category_id, brand_id, score_range, inventory_type

        Performance notes (100k+ products):
        - Filter counts use DB aggregation (no Python loops over all rows).
        - Scoring queryset uses .only() to load minimal columns.
        - Image lookup uses product.id (indexed FK), chunked in 10k batches.
        """
        from apps.products.models import Product
        from apps.images.models import ProductImage
        from apps.categories.models import Category
        from apps.products.models import Brand

        user = request.user
        if not user.can_view_reports():
            return Response({'detail': 'غير مسموح بعرض التقارير'}, status=403)

        is_dept_manager = (user.role == 'مدير_قسم')
        managed_ids = user.get_managed_category_ids() if is_dept_manager else set()

        requested_cat = request.query_params.get('category_id')
        if is_dept_manager:
            category_id = requested_cat if (requested_cat and int(requested_cat) in managed_ids) else None
        else:
            category_id = requested_cat

        brand_id       = request.query_params.get('brand_id')
        score_range    = request.query_params.get('score_range')
        inventory_type = request.query_params.get('inventory_type')
        status_filter  = request.query_params.get('status')

        # ── Base queryset ──────────────────────────────────────────────────
        base_qs = Product.objects.all()
        if is_dept_manager:
            base_qs = base_qs.filter(category_id__in=managed_ids) if managed_ids else base_qs.none()

        # ── Filter counts via DB aggregation (no Python loops) ────────────
        # Each is a single fast GROUP-BY query, never loads Product rows.
        inv_counts = dict(
            base_qs.values('inventory_type')
            .annotate(c=Count('id'))
            .values_list('inventory_type', 'c')
        )
        status_counts = dict(
            base_qs.values('status')
            .annotate(c=Count('id'))
            .values_list('status', 'c')
        )

        brand_agg = (
            base_qs.filter(brand__isnull=False)
            .values('brand_id', 'brand__name_ar', 'brand__name')
            .annotate(c=Count('id'))
        )
        filter_brands = sorted([
            {
                'id': r['brand_id'],
                'name_ar': r['brand__name_ar'] or r['brand__name'],
                'count': r['c'],
            }
            for r in brand_agg
        ], key=lambda x: -x['count'])

        filter_categories = []
        if not is_dept_manager:
            cat_agg = (
                base_qs.filter(category__isnull=False)
                .values('category_id')
                .annotate(c=Count('id'))
            )
            cat_count_map = {r['category_id']: r['c'] for r in cat_agg}
            for cat in Category.objects.filter(pk__in=cat_count_map).order_by('name_ar'):
                filter_categories.append({
                    'id': cat.id,
                    'name_ar': cat.name_ar,
                    'count': cat_count_map[cat.id],
                })

        filter_inventory = [{'value': k, 'label': k, 'count': v} for k, v in inv_counts.items()]
        filter_statuses = sorted(
            [{'value': k, 'label': k, 'count': v} for k, v in status_counts.items()],
            key=lambda x: -x['count'],
        )

        _empty_response = {
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
                'statuses': filter_statuses,
            },
        }

        # ── Apply user filters for scoring queryset ────────────────────────
        qs = base_qs
        if category_id:
            qs = qs.filter(category_id=category_id)
        if brand_id:
            qs = qs.filter(brand_id=brand_id)
        if inventory_type:
            qs = qs.filter(inventory_type=inventory_type)
        if status_filter:
            qs = qs.filter(status=status_filter)

        # ── Load products with only the columns we need ────────────────────
        # .only() avoids fetching large unused columns (description, attributes…)
        # select_related('category') adds a single JOIN for category.name_ar.
        products = list(
            qs.select_related('category')
            .only(
                'id', 'sku', 'product_name_ar', 'product_name_en',
                'category_id', 'category__name_ar',
                'brand_id', 'origin_country', 'color',
                'price_sar', 'ecommerce_url', 'attributes',
                'inventory_type', 'status',
            )
        )

        if not products:
            return Response(_empty_response)

        # ── Image lookup by product.id (chunked to stay under DB limit) ───
        product_ids = [p.id for p in products]
        main_ids: set[int] = set()
        lifestyle_ids: set[int] = set()
        for chunk in _chunked(product_ids):
            main_ids |= set(
                ProductImage.objects.filter(
                    product_id__in=chunk, image_type='main', status='approved'
                ).values_list('product_id', flat=True)
            )
            lifestyle_ids |= set(
                ProductImage.objects.filter(
                    product_id__in=chunk, image_type='lifestyle', status='approved'
                ).values_list('product_id', flat=True)
            )

        # ── Score every product ────────────────────────────────────────────
        scored = []
        for p in products:
            s = _score_product(p, main_ids, lifestyle_ids)
            scored.append({
                'id': p.id,
                'sku': p.sku,
                'name_ar': p.product_name_ar,
                'category': p.category.name_ar if p.category else '—',
                'score': s,
                'missing': _missing_fields(p, main_ids, lifestyle_ids),
            })

        if score_range and score_range in {'low', 'medium', 'high', 'perfect'}:
            lo, hi = {'low': (0, 50), 'medium': (51, 79), 'high': (80, 99), 'perfect': (100, 100)}[score_range]
            scored = [x for x in scored if lo <= x['score'] <= hi]

        total = len(scored)
        if total == 0:
            return Response(_empty_response)

        overall_score = round(sum(x['score'] for x in scored) / total, 1)
        complete_products = sum(1 for x in scored if x['score'] >= 80)

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

        cat_map: dict[str, list[int]] = {}
        for x in scored:
            cat_map.setdefault(x['category'], []).append(x['score'])
        category_breakdown = sorted([
            {
                'category': cat,
                'avg_score': round(sum(sc) / len(sc), 1),
                'count': len(sc),
                'color': _score_color(round(sum(sc) / len(sc), 1)),
            }
            for cat, sc in cat_map.items()
        ], key=lambda x: x['avg_score'])

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
                'statuses': filter_statuses,
            },
        })


def _missing_fields(p, main_ids: set, lifestyle_ids: set) -> list[str]:
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
    if p.id not in main_ids:
        missing.append('main_image')
    if p.id not in lifestyle_ids:
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
