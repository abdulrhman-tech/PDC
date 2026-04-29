"""SAP scheduled tasks executor + background loop."""
import logging
import os
import sys
import threading
import time
import traceback
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

_scheduler_thread = None
_scheduler_lock = threading.Lock()


# ───────────────────────── core executors ─────────────────────────

def _execute_sync_hierarchy(log, task):
    """Pull hierarchy from SAP and upsert categories."""
    from apps.categories.models import Category
    from apps.integrations.sap_service import SAPService

    svc = SAPService(env=getattr(task, 'sap_env', None))
    items = svc.get_hierarchy()
    log.records_processed = len(items)

    sap_codes = {it['code'] for it in items}
    existing_map = {c.code: c for c in Category.objects.filter(code__in=sap_codes)}
    sorted_items = sorted(items, key=lambda x: x.get('level', 0))

    created = 0
    updated = 0

    with transaction.atomic():
        code_to_cat = dict(existing_map)
        for it in sorted_items:
            code = it['code']
            parent_code = it.get('parent_code', '')
            parent_obj = code_to_cat.get(parent_code) if parent_code else None

            if code not in existing_map:
                cat = Category(
                    code=code,
                    name_ar=it.get('name_ar') or code,
                    name_en=it.get('name_en') or '',
                    level=it.get('level', 0),
                    parent=parent_obj,
                )
                cat.save()
                code_to_cat[code] = cat
                created += 1
            else:
                cat = existing_map[code]
                changed = False
                if it.get('name_ar') and cat.name_ar != it['name_ar']:
                    cat.name_ar = it['name_ar']; changed = True
                if it.get('name_en') and cat.name_en != it['name_en']:
                    cat.name_en = it['name_en']; changed = True
                if cat.level != it.get('level', cat.level):
                    cat.level = it['level']; changed = True
                new_parent_id = getattr(parent_obj, 'id', None)
                if cat.parent_id != new_parent_id:
                    cat.parent = parent_obj; changed = True
                if changed:
                    cat.save()
                    updated += 1
                code_to_cat[code] = cat

    log.records_created = created
    log.records_updated = updated
    log.details = {'created': created, 'updated': updated, 'sap_total': len(items)}


def _execute_sync_products(log, task):
    """Pull products changed since last successful run; update existing ones only."""
    from apps.products.models import Product
    from apps.integrations.sap_service import SAPService
    from apps.integrations.sap_views import _save_or_update_product
    from apps.integrations.models import TaskExecutionLog, TaskRunStatus

    last_success = (TaskExecutionLog.objects
                    .filter(task=task, status=TaskRunStatus.SUCCESS)
                    .order_by('-started_at').first())
    if last_success:
        date_from_dt = last_success.started_at - timedelta(days=1)
    else:
        date_from_dt = timezone.now() - timedelta(days=365)

    date_from = date_from_dt.strftime('%Y-%m-%d')
    date_to = timezone.now().strftime('%Y-%m-%d')

    svc = SAPService(env=getattr(task, 'sap_env', None))
    items = svc.get_products_by_date(date_from, date_to)
    log.records_processed = len(items)

    if not items:
        log.details = {'date_from': date_from, 'date_to': date_to, 'note': 'no items'}
        return

    skus = [it['material_number'] for it in items if it.get('material_number')]
    existing_skus = set(Product.objects.filter(sku__in=skus).values_list('sku', flat=True))

    updated = 0
    skipped = 0
    failed = 0
    errors = []

    for item in items:
        sku = (item or {}).get('material_number', '')
        if sku not in existing_skus:
            skipped += 1
            continue
        try:
            with transaction.atomic():
                result = _save_or_update_product(item, user=None)
            if result.get('status') == 'updated':
                updated += 1
            elif result.get('status') == 'created':
                # Should not happen since we filter, but count as updated
                updated += 1
            else:
                failed += 1
                errors.append({'sku': sku, 'error': result.get('error', 'فشل')})
        except Exception as e:
            failed += 1
            errors.append({'sku': sku, 'error': str(e)[:200]})
            logger.exception('Scheduled product sync failed for %s', sku)

    log.records_updated = updated
    log.records_skipped = skipped
    log.records_failed = failed
    log.details = {
        'date_from': date_from,
        'date_to': date_to,
        'updated': updated,
        'skipped': skipped,
        'failed': failed,
        'errors': errors[:20],
    }


# ───────────────────────── orchestration ─────────────────────────

EXECUTORS = {
    'sync_hierarchy': _execute_sync_hierarchy,
    'sync_products': _execute_sync_products,
}


def execute_task(task, manual=False):
    """Run a single scheduled task; record outcome on the task and a fresh log row."""
    from apps.integrations.models import TaskExecutionLog, TaskRunStatus

    log = TaskExecutionLog.objects.create(
        task=task, status=TaskRunStatus.RUNNING, triggered_manually=manual,
    )
    task.last_run_status = TaskRunStatus.RUNNING
    task.save(update_fields=['last_run_status'])

    started = time.time()
    try:
        executor = EXECUTORS.get(task.task_type)
        if not executor:
            raise ValueError(f'لا يوجد منفذ لهذه المهمة: {task.task_type}')
        executor(log, task)
        duration = time.time() - started

        log.status = TaskRunStatus.SUCCESS
        log.duration = duration
        log.finished_at = timezone.now()
        log.save()

        task.last_run_status = TaskRunStatus.SUCCESS
        task.last_run_at = timezone.now()
        task.last_run_duration = duration
        task.last_run_message = ''
        task.calculate_next_run()
        task.save()
        logger.info('Scheduled task %s succeeded in %.2fs', task.task_type, duration)
        return log

    except Exception as e:
        duration = time.time() - started
        err = f'{e}\n{traceback.format_exc()[:1500]}'
        log.status = TaskRunStatus.FAILED
        log.duration = duration
        log.finished_at = timezone.now()
        log.error_message = err[:4000]
        log.save()

        task.last_run_status = TaskRunStatus.FAILED
        task.last_run_at = timezone.now()
        task.last_run_duration = duration
        task.last_run_message = str(e)[:1000]
        task.calculate_next_run()
        task.save()
        logger.exception('Scheduled task %s failed', task.task_type)
        return log


def _check_and_run_due():
    """Find active tasks whose next_run_at has passed and execute them."""
    from apps.integrations.models import ScheduledTask, TaskRunStatus
    now = timezone.now()
    qs = ScheduledTask.objects.filter(
        is_active=True,
        next_run_at__isnull=False,
        next_run_at__lte=now,
    ).exclude(last_run_status=TaskRunStatus.RUNNING)

    for task in qs:
        try:
            execute_task(task, manual=False)
        except Exception:
            logger.exception('scheduler tick failed for task %s', task.task_type)


def _scheduler_loop(interval_seconds=60):
    logger.info('SAP scheduler thread started (interval=%ss)', interval_seconds)
    while True:
        try:
            _check_and_run_due()
        except Exception:
            logger.exception('scheduler loop error')
        time.sleep(interval_seconds)


def start_scheduler():
    """Idempotently spawn the scheduler thread (skip in management commands / migrations)."""
    global _scheduler_thread

    if os.environ.get('SAP_SCHEDULER_DISABLED') == '1':
        logger.info('SAP scheduler disabled via env')
        return

    argv = ' '.join(sys.argv).lower()
    skip_markers = ('migrate', 'makemigrations', 'collectstatic', 'shell',
                    'test', 'createsuperuser', 'check', 'dbshell', 'loaddata',
                    'dumpdata', 'showmigrations')
    if any(m in argv for m in skip_markers):
        return

    # In dev autoreload, only run in the actual worker process
    if 'runserver' in argv and os.environ.get('RUN_MAIN') != 'true':
        return

    with _scheduler_lock:
        if _scheduler_thread and _scheduler_thread.is_alive():
            return
        t = threading.Thread(target=_scheduler_loop, name='sap-scheduler', daemon=True)
        t.start()
        _scheduler_thread = t
