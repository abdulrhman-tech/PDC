import logging

from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.users.views import IsSuperAdmin
from apps.categories.models import Category

logger = logging.getLogger(__name__)


def _get_sap_service():
    from apps.integrations.sap_service import SAPService
    return SAPService()


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def test_connection(request):
    try:
        svc = _get_sap_service()
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
    try:
        from apps.integrations.sap_service import SAPService
        result = SAPService.diagnose_connection()
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
    try:
        svc = _get_sap_service()
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
    try:
        svc = _get_sap_service()
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
