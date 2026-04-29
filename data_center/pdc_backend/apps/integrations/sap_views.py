import logging

from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.users.views import IsSuperAdmin
from apps.categories.models import Category, CategoryAttributeSchema
from apps.products.models import Product, ProductStatus

logger = logging.getLogger(__name__)


def _resolve_env_from_request(request):
    """Pull the SAP env from query (`?env=`) or body (`env`).

    Returns (env_value_or_None, error_response_or_None). If the supplied value
    is invalid, returns a DRF Response with HTTP 400 in Arabic.
    """
    from apps.integrations.sap_service import VALID_ENVS

    raw = (
        request.query_params.get('env')
        if hasattr(request, 'query_params') else None
    )
    if not raw and getattr(request, 'data', None) and isinstance(request.data, dict):
        raw = request.data.get('env')
    if raw is None or raw == '':
        return None, None
    val = str(raw).strip().upper()
    if val not in VALID_ENVS:
        return None, Response(
            {'error': 'بيئة SAP غير صحيحة. استخدم DEV أو PRD'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return val, None


def _get_sap_service(env=None):
    from apps.integrations.sap_service import SAPService
    return SAPService(env=env)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def test_connection(request):
    env, err = _resolve_env_from_request(request)
    if err:
        return err
    try:
        svc = _get_sap_service(env)
        result = svc.test_connection()
    except Exception as e:
        logger.exception("SAP service init failed")
        return Response(
            {'connected': False, 'error': 'خطأ في إعدادات الربط', 'detail': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    http_status = status.HTTP_200_OK if result.get('connected') else status.HTTP_502_BAD_GATEWAY
    return Response(result, status=http_status)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def diagnose_connection(request):
    env, err = _resolve_env_from_request(request)
    if err:
        return err
    try:
        from apps.integrations.sap_service import SAPService
        result = SAPService.diagnose_connection(env=env)
    except Exception as e:
        logger.exception("SAP diagnose failed")
        return Response(
            {'error': 'فشل التشخيص', 'detail': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def get_hierarchy(request):
    env, err = _resolve_env_from_request(request)
    if err:
        return err
    try:
        svc = _get_sap_service(env)
        items = svc.get_hierarchy()

        level_counts = {}
        for it in items:
            lvl = it.get('level', 0)
            level_counts[lvl] = level_counts.get(lvl, 0) + 1

        return Response({
            'total': len(items),
            'level_counts': level_counts,
            'items': items,
        })
    except Exception as e:
        logger.exception("SAP hierarchy fetch failed")
        return Response(
            {'error': 'فشل جلب شجرة التصنيفات', 'detail': str(e)},
            status=status.HTTP_502_BAD_GATEWAY,
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def sync_hierarchy(request):
    env, err = _resolve_env_from_request(request)
    if err:
        return err
    try:
        svc = _get_sap_service(env)
        items = svc.get_hierarchy()
    except Exception as e:
        logger.exception("SAP hierarchy fetch for sync failed")
        return Response(
            {'error': 'فشل جلب البيانات من SAP', 'detail': str(e)},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    dry_run = request.query_params.get('dry_run', 'false').lower() == 'true'

    existing_codes = set(Category.objects.values_list('code', flat=True))
    sap_codes = {it['code'] for it in items}

    to_create = []
    to_update = []
    unchanged = 0

    existing_map = {}
    if existing_codes & sap_codes:
        for cat in Category.objects.filter(code__in=sap_codes):
            existing_map[cat.code] = cat

    sorted_items = sorted(items, key=lambda x: x.get('level', 0))

    for it in sorted_items:
        code = it['code']
        if code in existing_map:
            cat = existing_map[code]
            changed = False
            if cat.name_ar != (it['name_ar'] or cat.name_ar):
                changed = True
            if cat.name_en != (it['name_en'] or cat.name_en):
                changed = True
            if cat.level != it['level']:
                changed = True
            if changed:
                to_update.append(it)
            else:
                unchanged += 1
        else:
            to_create.append(it)

    summary = {
        'sap_total': len(items),
        'local_total': len(existing_codes),
        'to_create': len(to_create),
        'to_update': len(to_update),
        'unchanged': unchanged,
    }

    if dry_run:
        return Response({
            'dry_run': True,
            'summary': summary,
            'preview_create': [{'code': x['code'], 'name_ar': x['name_ar'], 'level': x['level']} for x in to_create[:20]],
            'preview_update': [{'code': x['code'], 'name_ar': x['name_ar'], 'level': x['level']} for x in to_update[:20]],
        })

    created_count = 0
    updated_count = 0

    try:
        with transaction.atomic():
            code_to_cat = dict(existing_map)

            for it in sorted_items:
                code = it['code']
                parent_code = it.get('parent_code', '')
                parent_obj = code_to_cat.get(parent_code) if parent_code else None

                if code not in existing_map:
                    cat = Category(
                        code=code,
                        name_ar=it['name_ar'] or code,
                        name_en=it['name_en'] or '',
                        level=it['level'],
                        parent=parent_obj,
                    )
                    cat.save()
                    code_to_cat[code] = cat
                    created_count += 1
                else:
                    cat = existing_map[code]
                    needs_save = False
                    if it['name_ar'] and cat.name_ar != it['name_ar']:
                        cat.name_ar = it['name_ar']
                        needs_save = True
                    if it['name_en'] and cat.name_en != it['name_en']:
                        cat.name_en = it['name_en']
                        needs_save = True
                    if cat.level != it['level']:
                        cat.level = it['level']
                        needs_save = True
                    new_parent_id = getattr(parent_obj, 'id', None)
                    if cat.parent_id != new_parent_id:
                        cat.parent = parent_obj
                        needs_save = True
                    if needs_save:
                        cat.save()
                        updated_count += 1
                    code_to_cat[code] = cat
    except Exception as e:
        logger.exception("SAP sync transaction failed")
        return Response(
            {'error': 'فشلت عملية المزامنة', 'detail': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response({
        'dry_run': False,
        'summary': {
            **summary,
            'created': created_count,
            'updated': updated_count,
        },
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def sync_hierarchy_selected(request):
    env, err = _resolve_env_from_request(request)
    if err:
        return err
    selected_codes = request.data.get('codes', [])
    if not isinstance(selected_codes, list) or not selected_codes:
        return Response({'error': 'يجب تحديد التصنيفات (codes)'},
                        status=status.HTTP_400_BAD_REQUEST)

    try:
        svc = _get_sap_service(env)
        items = svc.get_hierarchy()
    except Exception as e:
        logger.exception("SAP fetch for selective sync failed")
        return Response({'error': 'فشل جلب البيانات من SAP', 'detail': str(e)[:300]},
                        status=status.HTTP_502_BAD_GATEWAY)

    code_to_item = {it['code']: it for it in items}
    selected_set = set(selected_codes)

    full_set = set()
    for code in selected_codes:
        node = code_to_item.get(code)
        while node and node['code'] not in full_set:
            full_set.add(node['code'])
            parent_code = node.get('parent_code')
            if not parent_code or parent_code == node['code']:
                break
            node = code_to_item.get(parent_code)

    items_to_save = sorted(
        (code_to_item[c] for c in full_set if c in code_to_item),
        key=lambda x: x.get('level', 0),
    )

    created = 0
    updated = 0
    attrs_saved = 0

    try:
        with transaction.atomic():
            existing_map = {
                cat.code: cat
                for cat in Category.objects.filter(code__in=full_set)
            }
            code_to_cat = dict(existing_map)

            for it in items_to_save:
                code = it['code']
                parent_code = it.get('parent_code', '')
                parent_obj = code_to_cat.get(parent_code) if parent_code and parent_code != code else None

                if code in existing_map:
                    cat = existing_map[code]
                    needs_save = False
                    if it.get('name_ar') and cat.name_ar != it['name_ar']:
                        cat.name_ar = it['name_ar']; needs_save = True
                    if it.get('name_en') and cat.name_en != it['name_en']:
                        cat.name_en = it['name_en']; needs_save = True
                    new_parent_id = getattr(parent_obj, 'id', None)
                    if cat.parent_id != new_parent_id:
                        cat.parent = parent_obj; needs_save = True
                    if needs_save:
                        cat.save()
                        updated += 1
                    code_to_cat[code] = cat
                else:
                    cat = Category(
                        code=code,
                        name_ar=it.get('name_ar') or code,
                        name_en=it.get('name_en') or '',
                        level=it.get('level', 1),
                        parent=parent_obj,
                    )
                    cat.save()
                    code_to_cat[code] = cat
                    created += 1

                if code in selected_set:
                    for attr in it.get('attributes', []):
                        char_name = (attr.get('name') or '').strip()
                        if not char_name:
                            continue
                        field_key = char_name.lower().replace(' ', '_')[:50]
                        char_value = attr.get('value') or ''
                        schema, was_created = CategoryAttributeSchema.objects.update_or_create(
                            category=cat,
                            field_key=field_key,
                            defaults={
                                'field_label_ar': char_name,
                                'field_label_en': char_name,
                                'field_type': 'text',
                                'help_text_ar': char_value[:200] if char_value else '',
                            },
                        )
                        if was_created:
                            attrs_saved += 1
    except Exception as e:
        logger.exception("Selective sync transaction failed")
        return Response({'error': 'فشلت المزامنة', 'detail': str(e)[:300]},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return Response({
        'summary': {
            'selected_count': len(selected_codes),
            'total_synced': len(items_to_save),
            'ancestors_added': len(items_to_save) - len(selected_codes),
            'created': created,
            'updated': updated,
            'attributes_saved': attrs_saved,
        }
    })


def _attrs_to_dict(attributes):
    return {a['name']: a['value'] for a in attributes if a.get('value')}


def _save_or_update_product(product_data, user=None):
    sku = product_data.get('material_number', '').strip()
    if not sku:
        return {'status': 'error', 'sku': sku, 'error': 'رمز الصنف مفقود'}

    group_code = product_data.get('material_group_code', '').strip()
    category = None
    if group_code:
        category = Category.objects.filter(code=group_code).first()
    if not category:
        return {
            'status': 'error',
            'sku': sku,
            'error': f'التصنيف {group_code or "غير محدد"} غير موجود في النظام. قم بمزامنة التصنيفات أولاً.',
        }

    existing = Product.objects.filter(sku=sku).first()
    attrs_dict = _attrs_to_dict(product_data.get('attributes', []))
    name_ar = product_data.get('description_ar') or sku
    name_en = product_data.get('description_en') or ''
    origin = product_data.get('origin_country') or ''

    if existing:
        existing.product_name_ar = name_ar
        existing.product_name_en = name_en
        existing.origin_country = origin
        existing.category = category
        merged = dict(existing.attributes or {})
        merged.update(attrs_dict)
        if product_data.get('unit_of_measure'):
            merged['unit_of_measure'] = product_data['unit_of_measure']
        existing.attributes = merged
        if user and user.is_authenticated:
            existing.updated_by = user
        existing.save()
        return {'status': 'updated', 'sku': sku}

    if attrs_dict and product_data.get('unit_of_measure'):
        attrs_dict['unit_of_measure'] = product_data['unit_of_measure']

    product = Product(
        sku=sku,
        product_name_ar=name_ar,
        product_name_en=name_en,
        category=category,
        origin_country=origin,
        attributes=attrs_dict,
        status=ProductStatus.DRAFT,
    )
    if user and user.is_authenticated:
        product.created_by = user
    product.save()
    return {'status': 'created', 'sku': sku}


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def get_product(request, material_number):
    env, err = _resolve_env_from_request(request)
    if err:
        return err
    try:
        svc = _get_sap_service(env)
        data = svc.get_product(material_number)
        if not data.get('material_number'):
            return Response(
                {'error': 'الصنف غير موجود في SAP. تأكد من الرمز وحاول مرة ثانية.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        existing = Product.objects.filter(sku=data['material_number']).first()
        data['exists_locally'] = existing is not None
        return Response(data)
    except Exception as e:
        msg = str(e)
        http_code = status.HTTP_502_BAD_GATEWAY
        if '404' in msg:
            http_code = status.HTTP_404_NOT_FOUND
            user_msg = 'الصنف غير موجود في SAP. تأكد من الرمز وحاول مرة ثانية.'
        else:
            logger.exception("SAP get_product failed")
            user_msg = 'فشل جلب بيانات الصنف من SAP'
        return Response({'error': user_msg, 'detail': msg[:300]}, status=http_code)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def save_product(request, material_number):
    env, err = _resolve_env_from_request(request)
    if err:
        return err
    try:
        svc = _get_sap_service(env)
        data = svc.get_product(material_number)
        if not data.get('material_number'):
            return Response({'error': 'الصنف غير موجود في SAP'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        logger.exception("SAP fetch for save failed")
        return Response(
            {'error': 'فشل جلب الصنف من SAP', 'detail': str(e)[:300]},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    try:
        with transaction.atomic():
            result = _save_or_update_product(data, request.user)
    except Exception as e:
        logger.exception("Save product failed")
        return Response({'error': 'فشل حفظ الصنف', 'detail': str(e)[:300]},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    if result.get('status') == 'error':
        return Response({'error': result['error']}, status=status.HTTP_400_BAD_REQUEST)

    if result['status'] == 'created':
        return Response({'message': f'تم إضافة الصنف {result["sku"]} بنجاح', 'created': True})
    return Response({'message': f'تم تحديث الصنف {result["sku"]} (موجود مسبقاً)', 'created': False})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def get_products_by_date(request):
    env, err = _resolve_env_from_request(request)
    if err:
        return err
    date_from = request.query_params.get('date_from', '').strip()
    date_to = request.query_params.get('date_to', '').strip()
    if not date_from or not date_to:
        return Response({'error': 'يجب تحديد التاريخين (date_from, date_to)'},
                        status=status.HTTP_400_BAD_REQUEST)
    try:
        svc = _get_sap_service(env)
        items = svc.get_products_by_date(date_from, date_to)
    except Exception as e:
        logger.exception("SAP date range fetch failed")
        return Response(
            {'error': 'فشل جلب الأصناف من SAP', 'detail': str(e)[:300]},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    items.sort(key=lambda x: x.get('changed_date') or '', reverse=True)
    existing_skus = set(Product.objects.filter(
        sku__in=[i['material_number'] for i in items if i.get('material_number')]
    ).values_list('sku', flat=True))
    for it in items:
        it['exists_locally'] = it['material_number'] in existing_skus

    return Response({
        'total': len(items),
        'date_from': date_from,
        'date_to': date_to,
        'items': items,
    })


MAX_SYNC_BATCH = 500


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def sync_products(request):
    # env is accepted for symmetry with other endpoints but is not used here:
    # this endpoint stores already-fetched product data into the local DB.
    _, err = _resolve_env_from_request(request)
    if err:
        return err
    products = request.data.get('products', [])
    if not isinstance(products, list) or not products:
        return Response({'error': 'يجب إرسال قائمة الأصناف (products)'},
                        status=status.HTTP_400_BAD_REQUEST)
    if len(products) > MAX_SYNC_BATCH:
        return Response(
            {'error': f'تجاوز الحد الأقصى للدفعة الواحدة ({MAX_SYNC_BATCH} صنف). قسّم العملية إلى دفعات أصغر.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    created = 0
    updated = 0
    errors = []

    for item in products:
        sku = (item or {}).get('material_number', '')
        try:
            with transaction.atomic():
                result = _save_or_update_product(item, request.user)
            if result['status'] == 'created':
                created += 1
            elif result['status'] == 'updated':
                updated += 1
            else:
                errors.append({'sku': sku, 'error': result.get('error', 'فشل')})
        except Exception as e:
            logger.exception("Sync product failed for %s", sku)
            errors.append({'sku': sku, 'error': str(e)[:200]})

    return Response({
        'total': len(products),
        'created': created,
        'updated': updated,
        'failed': len(errors),
        'errors': errors[:20],
    })
