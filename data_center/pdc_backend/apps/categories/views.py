"""
Categories views — hierarchical self-referencing model.
Read for all authenticated users, write for super_admin only.
"""
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
import io
import logging
import re
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from apps.categories.models import Category, SubCategory, CategoryAttributeSchema
from apps.categories.serializers import (
    CategorySerializer, CategoryWriteSerializer, CategoryTreeSerializer,
    CategoryFlatSerializer, CategoryAttributeSchemaSerializer,
    SubCategorySerializer, SubCategoryWriteSerializer,
)
from apps.integrations.translate_views import translate_text_core, TranslateError

logger = logging.getLogger(__name__)


# Regex character classes used to detect actual language content.
# Arabic Unicode block U+0600-U+06FF covers the letters we care about;
# we rely on PostgreSQL's POSIX regex via Django's __regex lookup.
_ARABIC_RX = r'[\u0600-\u06FF]'
_LATIN_RX  = r'[A-Za-z]'


def _untranslated_qs():
    """
    Categories where one of the two language fields is effectively missing.

    "Effectively missing" means either truly empty OR filled with content
    that doesn't contain a single letter of the expected script — e.g.
    SAP codes like ``AG8200100`` stuffed into ``name_ar`` are NOT a real
    Arabic translation, so the row still needs translating.

    To translate, we also need a usable source on the other side, so each
    branch requires the *other* field to contain valid letters of its
    own script.
    """
    needs_ar = (
        (Q(name_ar='') | ~Q(name_ar__regex=_ARABIC_RX))
        & Q(name_en__regex=_LATIN_RX)
    )
    needs_en = (
        (Q(name_en='') | ~Q(name_en__regex=_LATIN_RX))
        & Q(name_ar__regex=_ARABIC_RX)
    )
    return Category.objects.filter(needs_ar | needs_en)


class IsSuperAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_authenticated and request.user.role == 'super_admin'


class CategoryViewSet(viewsets.ModelViewSet):
    """
    Category CRUD + tree/flat/attributes/children actions.
    Endpoints:
      GET  /categories/tree/             — full recursive tree (root only nodes with nested children)
      GET  /categories/flat/             — flat list with path_ar/path_en (for dropdowns)
      GET  /categories/{id}/attributes/  — attribute schemas for this category
      POST /categories/{id}/attributes/  — add attribute schema
      GET  /categories/{id}/children/    — direct children
      POST /categories/{id}/children/    — add child category
    """
    permission_classes = [IsSuperAdminOrReadOnly]

    def get_queryset(self):
        qs = Category.objects.prefetch_related(
            'children', 'subcategories', 'attribute_schemas'
        ).select_related('parent').order_by('sort_order', 'order', 'name_ar')

        user = self.request.user
        if (
            user.is_authenticated
            and getattr(user, 'role', None) == 'مدير_قسم'
            and getattr(user, 'department_id', None)
        ):
            qs = qs.filter(pk=user.department_id)
        return qs

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return CategoryWriteSerializer
        return CategorySerializer

    # ── Tree view ────────────────────────────────────────────────
    @action(detail=False, methods=['get'], url_path='tree')
    def tree(self, request):
        """
        Returns full hierarchical tree (root nodes with nested children).
        Optimized: uses 2 queries total (categories + attribute counts),
        builds the tree in Python — avoids the N+1 storm of the recursive
        serializer (~150 queries for a 50-node tree).
        """
        from django.db.models import Count

        # Single query for ALL categories
        cats = list(
            Category.objects.all()
            .order_by('sort_order', 'order', 'name_ar')
            .values(
                'id', 'code', 'name_ar', 'name_en', 'level', 'sort_order',
                'is_active', 'icon', 'description_ar', 'parent_id',
            )
        )

        # Single query: schemas live on root categories only
        attr_counts = {
            row['category_id']: row['c']
            for row in CategoryAttributeSchema.objects
                .values('category_id')
                .annotate(c=Count('id'))
        }

        # Index by id and group children by parent
        by_id = {c['id']: c for c in cats}
        children_map = {}
        for c in cats:
            children_map.setdefault(c['parent_id'], []).append(c)

        # Resolve each node's root ancestor (with memoization)
        root_cache = {}
        def root_id(cid):
            if cid in root_cache:
                return root_cache[cid]
            cur = by_id.get(cid)
            while cur and cur['parent_id'] is not None and cur['parent_id'] in by_id:
                cur = by_id[cur['parent_id']]
            rid = cur['id'] if cur else cid
            root_cache[cid] = rid
            return rid

        # Pass 1: compute attribute_count via root resolution (needs parent_id intact on all nodes)
        for c in cats:
            c['attribute_count'] = attr_counts.get(root_id(c['id']), 0)

        # Pass 2: attach children + counts. Keep parent_id so the edit dialog
        # can show the current parent and allow moving categories.
        for c in cats:
            kids = children_map.get(c['id'], [])
            c['children'] = kids
            c['children_count'] = len(kids)

        return Response(children_map.get(None, []))

    # ── Flat list (for dropdowns) ─────────────────────────────────
    @action(detail=False, methods=['get'], url_path='flat')
    def flat(self, request):
        """Returns flat list of all categories with breadcrumb paths."""
        qs = Category.objects.select_related('parent__parent__parent__parent').order_by(
            'level', 'sort_order', 'name_ar'
        )
        return Response(CategoryFlatSerializer(qs, many=True).data)

    # ── Attributes ────────────────────────────────────────────────
    @action(detail=True, methods=['get', 'post'])
    def attributes(self, request, pk=None):
        """
        GET: return root-ancestor's attribute schemas (inherited by all children).
        POST: add new schema to the root ancestor.
        Attributes always belong to the L1 root category; children inherit them.
        """
        category = self.get_object()

        # Walk up to find the root ancestor (level=1)
        root = category
        while root.parent_id is not None:
            root = root.parent

        if request.method == 'POST':
            if not request.user.is_authenticated or request.user.role != 'super_admin':
                return Response({'detail': 'غير مسموح.'}, status=status.HTTP_403_FORBIDDEN)
            serializer = CategoryAttributeSchemaSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(category=root)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        schemas = CategoryAttributeSchema.objects.filter(category=root).order_by('order')
        return Response({
            'root_id': root.id,
            'root_name_ar': root.name_ar,
            'is_inherited': root.id != category.id,
            'schemas': CategoryAttributeSchemaSerializer(schemas, many=True).data,
        })

    # ── Children ──────────────────────────────────────────────────
    @action(detail=True, methods=['get', 'post'], url_path='children')
    def children(self, request, pk=None):
        """GET: list direct children. POST: add child category."""
        parent = self.get_object()
        if request.method == 'POST':
            if not request.user.is_authenticated or request.user.role != 'super_admin':
                return Response({'detail': 'غير مسموح.'}, status=status.HTTP_403_FORBIDDEN)
            if parent.level >= 5:
                return Response(
                    {'detail': 'الحد الأقصى لعمق التصنيف هو 5 مستويات.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            data = request.data.copy()
            data['parent'] = parent.pk
            serializer = CategoryWriteSerializer(data=data)
            serializer.is_valid(raise_exception=True)
            child = serializer.save()
            return Response(CategoryFlatSerializer(child).data, status=status.HTTP_201_CREATED)

        children = parent.children.all().order_by('sort_order', 'name_ar')
        return Response(CategoryFlatSerializer(children, many=True).data)

    # ── Excel Template Download ───────────────────────────────────
    @action(detail=False, methods=['get'], url_path='import-excel/template', permission_classes=[permissions.IsAuthenticated])
    def import_excel_template(self, request):
        """Download an Excel template for bulk category import."""
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'التصنيفات'

        gold = 'FFC8A84B'
        dark = 'FF1A1A2E'
        light_bg = 'FFFFF8E7'

        # Header row
        headers = ['code', 'name_ar', 'name_en', 'parent_code', 'sort_order']
        labels  = ['كود التصنيف *', 'الاسم بالعربية *', 'الاسم بالإنجليزية', 'كود التصنيف الأب', 'ترتيب العرض']
        req     = [True, True, False, False, False]

        header_font = Font(bold=True, color=dark, size=11, name='Arial')
        header_fill = PatternFill(fill_type='solid', fgColor=gold)
        center_align = Alignment(horizontal='center', vertical='center', wrap_text=True)

        # Row 1 — Arabic labels
        for col, (label, required) in enumerate(zip(labels, req), 1):
            cell = ws.cell(row=1, column=col, value=f'{label}{"" if not required else ""}')
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = center_align

        # Row 2 — English keys (field names)
        for col, key in enumerate(headers, 1):
            cell = ws.cell(row=2, column=col, value=key)
            cell.font = Font(bold=True, color='FF555555', size=10, name='Courier New')
            cell.fill = PatternFill(fill_type='solid', fgColor='FFF5F5F5')
            cell.alignment = Alignment(horizontal='center')

        # Row 3 — Instructions
        instructions = [
            'فريد، حروف وأرقام وشرطة فقط (CERAMICS، CAT-001)',
            'الاسم الكامل بالعربية',
            'الاسم بالإنجليزية (اختياري)',
            'اتركه فارغاً للتصنيفات الرئيسية',
            '0 = الأول، 1 = الثاني...',
        ]
        for col, instruction in enumerate(instructions, 1):
            cell = ws.cell(row=3, column=col, value=instruction)
            cell.font = Font(italic=True, color='FF888888', size=9)
            cell.fill = PatternFill(fill_type='solid', fgColor=light_bg)
            cell.alignment = Alignment(wrap_text=True, horizontal='right')

        # Sample rows
        samples = [
            ('CERAMICS',         'السيراميك والبورسلان', 'Ceramics & Porcelain', '',         1),
            ('CERAMICS-FLOOR',   'سيراميك الأرضيات',    'Floor Ceramics',       'CERAMICS',  1),
            ('CERAMICS-WALL',    'سيراميك الجدران',     'Wall Ceramics',        'CERAMICS',  2),
            ('CERAMICS-FL-MATT', 'أرضيات مات',          'Matte Floors',         'CERAMICS-FLOOR', 1),
            ('MARBLE',           'الرخام',              'Marble',               '',          2),
            ('MARBLE-ITALIAN',   'رخام إيطالي',         'Italian Marble',       'MARBLE',    1),
        ]
        sample_fill = PatternFill(fill_type='solid', fgColor='FFFAFAFA')
        alt_fill    = PatternFill(fill_type='solid', fgColor='FFFFFFFF')
        for r, row in enumerate(samples, 4):
            fill = sample_fill if r % 2 == 0 else alt_fill
            for col, val in enumerate(row, 1):
                cell = ws.cell(row=r, column=col, value=val)
                cell.fill = fill
                cell.alignment = Alignment(horizontal='right' if col in (2, 3) else 'left')
                if col == 1 or col == 4:
                    cell.font = Font(name='Courier New', size=10)

        # Column widths
        for col, width in zip(['A', 'B', 'C', 'D', 'E'], [22, 28, 28, 22, 12]):
            ws.column_dimensions[col].width = width

        ws.row_dimensions[1].height = 30
        ws.row_dimensions[3].height = 40

        # Freeze header rows
        ws.freeze_panes = 'A4'

        # Instructions sheet
        ws2 = wb.create_sheet('تعليمات')
        ws2.sheet_view.rightToLeft = True
        rules = [
            ('📌 قواعد الاستيراد', None, True),
            ('', None, False),
            ('1. حقل code مطلوب وفريد — لا يُقبل تكرار الكود في الملف أو النظام.', None, False),
            ('2. parent_code يجب أن يكون موجوداً في النظام أو في الملف نفسه.', None, False),
            ('3. الحد الأقصى لعمق الشجرة هو 5 مستويات.', None, False),
            ('4. الكود يدعم: حروف إنجليزية، أرقام، وشرطة (-) فقط.', None, False),
            ('5. sort_order رقم اختياري — يحدد ترتيب العرض (0 = الأول).', None, False),
            ('6. التصنيفات الموجودة مسبقاً (بنفس الكود) تُحدَّث تلقائياً.', None, False),
            ('', None, False),
            ('💡 نصيحة: ضع التصنيفات الأبوية قبل الفرعية في الملف.', None, False),
            ('   (النظام يُرتّب تلقائياً بناءً على parent_code قبل الإنشاء)', None, False),
        ]
        for r, (text, _, bold) in enumerate(rules, 1):
            cell = ws2.cell(row=r, column=1, value=text)
            cell.font = Font(bold=bold, size=11 if bold else 10)
            if bold:
                cell.fill = PatternFill(fill_type='solid', fgColor=gold)
                cell.font = Font(bold=True, color=dark, size=13)
        ws2.column_dimensions['A'].width = 70

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        response = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = 'attachment; filename="categories_import_template.xlsx"'
        return response

    # ── Excel Import ──────────────────────────────────────────────
    @action(
        detail=False, methods=['post'], url_path='import-excel',
        permission_classes=[permissions.IsAuthenticated],
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_excel(self, request):
        """
        Bulk import/update categories from an Excel file.
        Columns: code, name_ar, name_en (opt), parent_code (opt), sort_order (opt)
        Validates: no duplicate codes, parent_code exists, max 5 levels.
        Updates existing categories; creates new ones.
        """
        if not request.user.is_authenticated or request.user.role != 'super_admin':
            return Response({'detail': 'هذه العملية للمديرين العامين فقط.'}, status=status.HTTP_403_FORBIDDEN)

        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'يرجى رفع ملف Excel.'}, status=status.HTTP_400_BAD_REQUEST)

        # ── Parse workbook ────────────────────────────────────────
        try:
            wb = openpyxl.load_workbook(file, read_only=True, data_only=True)
            ws = wb.active
        except Exception:
            return Response({'detail': 'ملف Excel غير صالح أو تالف.'}, status=status.HTTP_400_BAD_REQUEST)

        # Find header row (look for 'code' in first 5 rows)
        header_row_idx = None
        headers_map = {}
        for row_idx, row in enumerate(ws.iter_rows(max_row=5, values_only=True), 1):
            for col_idx, val in enumerate(row):
                if str(val or '').strip().lower() == 'code':
                    header_row_idx = row_idx
                    break
            if header_row_idx:
                for col_idx, val in enumerate(row):
                    key = str(val or '').strip().lower()
                    if key:
                        headers_map[key] = col_idx
                break

        if header_row_idx is None:
            return Response({'detail': 'لم يُعثر على صف الترويسة. تأكد أن العمود الأول اسمه "code".'}, status=status.HTTP_400_BAD_REQUEST)

        required_cols = {'code', 'name_ar'}
        missing = required_cols - set(headers_map.keys())
        if missing:
            return Response({'detail': f'الأعمدة المطلوبة غير موجودة: {", ".join(missing)}'}, status=status.HTTP_400_BAD_REQUEST)

        # ── Read rows ─────────────────────────────────────────────
        rows_data = []
        errors = []
        seen_codes = {}

        for row_num, row in enumerate(ws.iter_rows(min_row=header_row_idx + 1, values_only=True), header_row_idx + 1):
            def cell(key):
                idx = headers_map.get(key)
                return str(row[idx] or '').strip() if idx is not None and row[idx] is not None else ''

            code        = cell('code').upper().replace(' ', '-')
            name_ar     = cell('name_ar')
            name_en     = cell('name_en')
            parent_code = cell('parent_code').upper().replace(' ', '-')
            try:
                sort_order = int(float(cell('sort_order'))) if cell('sort_order') else 0
            except ValueError:
                sort_order = 0

            # Skip fully empty rows
            if not code and not name_ar:
                continue

            # Validate code
            if not code:
                errors.append({'row': row_num, 'error': 'حقل code فارغ'})
                continue
            if not name_ar:
                errors.append({'row': row_num, 'code': code, 'error': 'name_ar فارغ'})
                continue

            # Check duplicate in file
            if code in seen_codes:
                errors.append({'row': row_num, 'code': code, 'error': f'الكود "{code}" مكرر في السطر {seen_codes[code]}'})
                continue

            seen_codes[code] = row_num
            rows_data.append({
                'code': code, 'name_ar': name_ar, 'name_en': name_en,
                'parent_code': parent_code, 'sort_order': sort_order,
                'row': row_num,
            })

        if not rows_data and errors:
            return Response({'detail': 'الملف يحتوي على أخطاء فقط.', 'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        # ── Topological sort (parents before children) ────────────
        def topo_sort(rows):
            code_to_row = {r['code']: r for r in rows}
            result = []
            visited = set()

            def visit(code):
                if code in visited:
                    return
                visited.add(code)
                row = code_to_row.get(code)
                if row and row['parent_code'] and row['parent_code'] in code_to_row:
                    visit(row['parent_code'])
                if row:
                    result.append(row)

            for row in rows:
                visit(row['code'])
            return result

        ordered = topo_sort(rows_data)

        # ── Process rows in transaction ───────────────────────────
        created, updated, skipped = 0, 0, 0
        row_errors = list(errors)

        with transaction.atomic():
            # Build in-transaction lookup of all existing codes
            existing_codes = {c.code: c for c in Category.objects.all()}

            for row in ordered:
                code        = row['code']
                name_ar     = row['name_ar']
                name_en     = row['name_en']
                parent_code = row['parent_code']
                sort_order  = row['sort_order']
                row_num     = row['row']

                # Resolve parent
                parent = None
                if parent_code:
                    parent = existing_codes.get(parent_code)
                    if parent is None:
                        row_errors.append({'row': row_num, 'code': code, 'error': f'parent_code "{parent_code}" غير موجود في النظام أو في الملف'})
                        skipped += 1
                        continue

                # Compute level
                level = (parent.level + 1) if parent else 1
                if level > 5:
                    row_errors.append({'row': row_num, 'code': code, 'error': 'تجاوز الحد الأقصى للعمق (5 مستويات)'})
                    skipped += 1
                    continue

                if code in existing_codes:
                    # Update
                    cat = existing_codes[code]
                    cat.name_ar = name_ar
                    if name_en:
                        cat.name_en = name_en
                    if parent:
                        cat.parent = parent
                    cat.level = level
                    cat.sort_order = sort_order
                    cat.save(update_fields=['name_ar', 'name_en', 'parent', 'level', 'sort_order', 'updated_at'])
                    existing_codes[code] = cat
                    updated += 1
                else:
                    # Create
                    cat = Category.objects.create(
                        code=code, name_ar=name_ar, name_en=name_en,
                        parent=parent, level=level, sort_order=sort_order,
                        is_active=True,
                    )
                    existing_codes[code] = cat
                    created += 1

        return Response({
            'detail': f'اكتمل الاستيراد: {created} جديد، {updated} محدَّث، {skipped} متخطَّى',
            'created': created,
            'updated': updated,
            'skipped': skipped,
            'errors': row_errors,
        }, status=status.HTTP_200_OK)

    # ── Legacy: subcategories (backward compat) ───────────────────
    @action(detail=True, methods=['get', 'post'], url_path='subcategories')
    def subcategories(self, request, pk=None):
        """Legacy endpoint — returns direct children as subcategory format."""
        category = self.get_object()
        if request.method == 'POST':
            if not request.user.is_authenticated or request.user.role != 'super_admin':
                return Response({'detail': 'غير مسموح.'}, status=status.HTTP_403_FORBIDDEN)
            serializer = SubCategoryWriteSerializer(
                data=request.data, context={'category': category}
            )
            serializer.is_valid(raise_exception=True)
            sub = serializer.save(category=category)
            return Response(SubCategorySerializer(sub).data, status=status.HTTP_201_CREATED)
        subs = SubCategory.objects.filter(category=category).order_by('name_ar')
        return Response(SubCategorySerializer(subs, many=True).data)

    # ── Bulk translate untranslated categories ────────────────────
    @action(
        detail=False, methods=['get'], url_path='untranslated-count',
        permission_classes=[permissions.IsAuthenticated],
    )
    def untranslated_count(self, request):
        """Returns how many categories are missing one of (name_ar, name_en)."""
        return Response({'count': _untranslated_qs().count()})

    @action(
        detail=False, methods=['post'], url_path='bulk-translate',
        permission_classes=[permissions.IsAuthenticated],
    )
    def bulk_translate(self, request):
        """
        Translate up to `limit` categories that are missing one of name_ar/name_en.
        Sequential processing to respect external translator rate limits.

        Inputs:
          limit:       int, default 20, hard-capped at 50.
          exclude_ids: list[int] (optional) — IDs the client knows already
                       failed in this session. Skipped for selection AND for
                       the returned `remaining` count, so a few persistently
                       failing items can never starve the rest of the queue.

        Writes go through `Category.objects.filter(pk=...).update(...)` so the
        hierarchy logic in `Category.save()` (level recomputation, descendant
        cascade) is intentionally NOT triggered — translation is a name-only
        write and must not touch tree shape.

        Response: {processed, succeeded, failed, remaining, errors, succeeded_ids}
        """
        if not request.user.is_authenticated or request.user.role != 'super_admin':
            return Response({'detail': 'غير مسموح.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            limit = int(request.data.get('limit', 20))
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 50))

        raw_excludes = request.data.get('exclude_ids') or []
        if not isinstance(raw_excludes, list):
            raw_excludes = []
        exclude_ids = [int(x) for x in raw_excludes if isinstance(x, (int, str)) and str(x).isdigit()]

        qs = _untranslated_qs().exclude(id__in=exclude_ids).order_by('id')[:limit]
        succeeded = 0
        succeeded_ids: list[int] = []
        failed = 0
        errors: list[dict] = []
        now = timezone.now()

        # Same heuristic as `_untranslated_qs()`, applied per-row so a
        # category whose name_ar contains only an SAP code (no Arabic
        # letters) is treated as needing translation, not skipped.
        ar_re = re.compile(_ARABIC_RX)
        la_re = re.compile(_LATIN_RX)

        for cat in qs:
            try:
                ar = cat.name_ar or ''
                en = cat.name_en or ''
                ar_ok = bool(ar_re.search(ar))
                en_ok = bool(la_re.search(en))

                if not ar_ok and en_ok:
                    translated, _ = translate_text_core(en, 'en', 'ar')
                    Category.objects.filter(pk=cat.pk).update(
                        name_ar=translated.strip(), updated_at=now,
                    )
                elif not en_ok and ar_ok:
                    translated, _ = translate_text_core(ar, 'ar', 'en')
                    Category.objects.filter(pk=cat.pk).update(
                        name_en=translated.strip(), updated_at=now,
                    )
                else:
                    continue  # both sides valid (race with another writer)
                succeeded += 1
                succeeded_ids.append(cat.id)
            except TranslateError as exc:
                failed += 1
                if len(errors) < 10:
                    errors.append({
                        'id': cat.id, 'code': cat.code,
                        'name': cat.name_ar or cat.name_en,
                        'error': exc.friendly,
                    })
            except Exception as exc:  # pragma: no cover — defensive
                failed += 1
                logger.exception('Unexpected bulk-translate error for cat %s', cat.id)
                if len(errors) < 10:
                    errors.append({
                        'id': cat.id, 'code': cat.code,
                        'name': cat.name_ar or cat.name_en,
                        'error': str(exc)[:200],
                    })

        # `remaining` excludes the IDs the client has marked as known-failed,
        # so the loop's stop condition is honest about real progress.
        remaining = _untranslated_qs().exclude(id__in=exclude_ids).count()
        return Response({
            'processed': succeeded + failed,
            'succeeded': succeeded,
            'succeeded_ids': succeeded_ids,
            'failed': failed,
            'remaining': remaining,
            'errors': errors,
        })


class CategoryAttributeSchemaViewSet(viewsets.ModelViewSet):
    """CRUD for individual attribute schema records — super_admin only."""
    serializer_class = CategoryAttributeSchemaSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = CategoryAttributeSchema.objects.select_related('category').order_by(
        'category__sort_order', 'category__order', 'order'
    )

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticatedOrReadOnly()]
        return [permissions.IsAuthenticated()]

    def _check_admin(self, request):
        if request.user.role != 'super_admin':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('هذه العملية للمديرين العامين فقط.')

    def create(self, request, *args, **kwargs):
        self._check_admin(request)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._check_admin(request)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._check_admin(request)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._check_admin(request)
        return super().destroy(request, *args, **kwargs)


class SubCategoryViewSet(viewsets.ModelViewSet):
    """Legacy: Update/delete individual subcategory records."""
    queryset = SubCategory.objects.select_related('category').order_by('name_ar')
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return SubCategoryWriteSerializer
        return SubCategorySerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        try:
            ctx['category'] = self.get_object().category
        except Exception:
            pass
        return ctx

    def _check_admin(self, request):
        if not request.user.is_authenticated or request.user.role != 'super_admin':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('هذه العملية للمديرين العامين فقط.')

    def update(self, request, *args, **kwargs):
        self._check_admin(request)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._check_admin(request)
        instance = self.get_object()
        serializer = SubCategoryWriteSerializer(
            instance, data=request.data, partial=True,
            context={'category': instance.category}
        )
        serializer.is_valid(raise_exception=True)
        sub = serializer.save()
        return Response(SubCategorySerializer(sub).data)

    def destroy(self, request, *args, **kwargs):
        self._check_admin(request)
        return super().destroy(request, *args, **kwargs)
