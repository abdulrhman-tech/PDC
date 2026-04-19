"""REST endpoints for managing SAP scheduled tasks."""
import logging
import threading

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.users.views import IsSuperAdmin
from apps.integrations.models import (
    ScheduledTask, TaskExecutionLog, TaskType, RepeatChoice, TaskRunStatus,
)
from apps.integrations.scheduler import execute_task

logger = logging.getLogger(__name__)


def _serialize_task(t: ScheduledTask) -> dict:
    return {
        'id': t.id,
        'task_type': t.task_type,
        'task_type_display': t.get_task_type_display(),
        'is_active': t.is_active,
        'repeat': t.repeat,
        'repeat_display': t.get_repeat_display(),
        'day_of_month': t.day_of_month,
        'day_of_week': t.day_of_week,
        'hour': t.hour,
        'minute': t.minute,
        'custom_interval_days': t.custom_interval_days,
        'last_run_at': t.last_run_at.isoformat() if t.last_run_at else None,
        'last_run_status': t.last_run_status,
        'last_run_message': t.last_run_message,
        'last_run_duration': t.last_run_duration,
        'next_run_at': t.next_run_at.isoformat() if t.next_run_at else None,
    }


def _serialize_log(log: TaskExecutionLog) -> dict:
    return {
        'id': log.id,
        'started_at': log.started_at.isoformat() if log.started_at else None,
        'finished_at': log.finished_at.isoformat() if log.finished_at else None,
        'status': log.status,
        'duration': log.duration,
        'records_processed': log.records_processed,
        'records_updated': log.records_updated,
        'records_created': log.records_created,
        'records_failed': log.records_failed,
        'records_skipped': log.records_skipped,
        'triggered_manually': log.triggered_manually,
        'error_message': log.error_message,
        'details': log.details or {},
    }


def _ensure_seeded():
    """Make sure both default tasks exist (in case post_migrate hasn't fired yet)."""
    for ttype in (TaskType.SYNC_HIERARCHY, TaskType.SYNC_PRODUCTS):
        ScheduledTask.objects.get_or_create(
            task_type=ttype,
            defaults={'is_active': False, 'repeat': RepeatChoice.MONTHLY,
                      'day_of_month': 1, 'hour': 2, 'minute': 0},
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def list_scheduled_tasks(request):
    _ensure_seeded()
    tasks = ScheduledTask.objects.all()
    return Response({'tasks': [_serialize_task(t) for t in tasks]})


_VALID_REPEATS = {c.value for c in RepeatChoice}


@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def update_scheduled_task(request, pk: int):
    try:
        task = ScheduledTask.objects.get(pk=pk)
    except ScheduledTask.DoesNotExist:
        return Response({'error': 'المهمة غير موجودة'}, status=status.HTTP_404_NOT_FOUND)

    data = request.data or {}

    if 'is_active' in data:
        task.is_active = bool(data['is_active'])
    if 'repeat' in data:
        if data['repeat'] not in _VALID_REPEATS:
            return Response({'error': 'قيمة التكرار غير صحيحة'}, status=status.HTTP_400_BAD_REQUEST)
        task.repeat = data['repeat']
    if 'hour' in data:
        try:
            h = int(data['hour'])
            if not 0 <= h <= 23:
                raise ValueError
            task.hour = h
        except (TypeError, ValueError):
            return Response({'error': 'الساعة يجب أن تكون بين 0 و 23'}, status=status.HTTP_400_BAD_REQUEST)
    if 'minute' in data:
        try:
            m = int(data['minute'])
            if not 0 <= m <= 59:
                raise ValueError
            task.minute = m
        except (TypeError, ValueError):
            return Response({'error': 'الدقيقة يجب أن تكون بين 0 و 59'}, status=status.HTTP_400_BAD_REQUEST)
    if 'day_of_month' in data and data['day_of_month'] is not None:
        try:
            d = int(data['day_of_month'])
            if not 1 <= d <= 28:
                raise ValueError
            task.day_of_month = d
        except (TypeError, ValueError):
            return Response({'error': 'اليوم من الشهر يجب أن يكون بين 1 و 28'}, status=status.HTTP_400_BAD_REQUEST)
    if 'day_of_week' in data and data['day_of_week'] is not None:
        try:
            d = int(data['day_of_week'])
            if not 0 <= d <= 6:
                raise ValueError
            task.day_of_week = d
        except (TypeError, ValueError):
            return Response({'error': 'يوم الأسبوع يجب أن يكون بين 0 و 6'}, status=status.HTTP_400_BAD_REQUEST)
    if 'custom_interval_days' in data and data['custom_interval_days'] is not None:
        try:
            n = int(data['custom_interval_days'])
            if not 1 <= n <= 365:
                raise ValueError
            task.custom_interval_days = n
        except (TypeError, ValueError):
            return Response({'error': 'الفاصل المخصص يجب أن يكون بين 1 و 365 يوم'}, status=status.HTTP_400_BAD_REQUEST)

    if task.is_active:
        task.calculate_next_run()
    else:
        task.next_run_at = None
    task.save()

    return Response(_serialize_task(task))


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def run_scheduled_task_now(request, pk: int):
    try:
        task = ScheduledTask.objects.get(pk=pk)
    except ScheduledTask.DoesNotExist:
        return Response({'error': 'المهمة غير موجودة'}, status=status.HTTP_404_NOT_FOUND)

    if task.last_run_status == TaskRunStatus.RUNNING:
        return Response({'error': 'هذه المهمة قيد التنفيذ بالفعل'}, status=status.HTTP_409_CONFLICT)

    background = str(request.query_params.get('background', '')).lower() in ('1', 'true', 'yes')

    if background:
        thread = threading.Thread(target=execute_task, args=(task, True), daemon=True)
        thread.start()
        return Response({'message': 'بدأ التنفيذ في الخلفية', 'task': _serialize_task(task)}, status=status.HTTP_202_ACCEPTED)

    log = execute_task(task, manual=True)
    task.refresh_from_db()
    return Response({'task': _serialize_task(task), 'log': _serialize_log(log)})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def task_execution_logs(request, pk: int):
    try:
        task = ScheduledTask.objects.get(pk=pk)
    except ScheduledTask.DoesNotExist:
        return Response({'error': 'المهمة غير موجودة'}, status=status.HTTP_404_NOT_FOUND)

    try:
        limit = max(1, min(100, int(request.query_params.get('limit', 20))))
    except (TypeError, ValueError):
        limit = 20

    logs = task.logs.all()[:limit]
    return Response({
        'task_id': task.id,
        'task_type': task.task_type,
        'logs': [_serialize_log(l) for l in logs],
    })
