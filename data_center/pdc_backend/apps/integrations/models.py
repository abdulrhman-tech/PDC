"""Scheduled tasks for SAP synchronization."""
from django.db import models
from django.utils import timezone
from datetime import timedelta
import calendar


class TaskType(models.TextChoices):
    SYNC_HIERARCHY = 'sync_hierarchy', 'مزامنة التصنيفات والسمات'
    SYNC_PRODUCTS = 'sync_products', 'تحديث الأصناف المتغيرة'


class RepeatChoice(models.TextChoices):
    DAILY = 'daily', 'يومي'
    WEEKLY = 'weekly', 'أسبوعي'
    MONTHLY = 'monthly', 'شهري'
    QUARTERLY = 'quarterly', 'كل 3 أشهر'
    CUSTOM = 'custom', 'مخصص'


class TaskRunStatus(models.TextChoices):
    NEVER = 'never', 'لم ينفذ بعد'
    RUNNING = 'running', 'قيد التنفيذ'
    SUCCESS = 'success', 'نجح'
    FAILED = 'failed', 'فشل'


class SAPEnvChoice(models.TextChoices):
    DEV = 'DEV', 'تجريبي (DEV)'
    PRD = 'PRD', 'إنتاج (PRD)'


class ScheduledTask(models.Model):
    task_type = models.CharField(max_length=50, choices=TaskType.choices, unique=True)
    is_active = models.BooleanField(default=False)
    sap_env = models.CharField(
        max_length=10,
        choices=SAPEnvChoice.choices,
        default=SAPEnvChoice.PRD,
    )
    repeat = models.CharField(max_length=20, choices=RepeatChoice.choices, default=RepeatChoice.MONTHLY)
    day_of_month = models.PositiveIntegerField(default=1, null=True, blank=True)
    day_of_week = models.PositiveIntegerField(default=0, null=True, blank=True)
    hour = models.PositiveIntegerField(default=2)
    minute = models.PositiveIntegerField(default=0)
    custom_interval_days = models.PositiveIntegerField(default=30, null=True, blank=True)

    last_run_at = models.DateTimeField(null=True, blank=True)
    last_run_status = models.CharField(max_length=20, default=TaskRunStatus.NEVER)
    last_run_message = models.TextField(blank=True, default='')
    last_run_duration = models.FloatField(null=True, blank=True)
    next_run_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['task_type']

    def __str__(self):
        return f'{self.get_task_type_display()} ({self.repeat})'

    def calculate_next_run(self, base=None):
        now = base or timezone.now()
        next_run = None

        if self.repeat == RepeatChoice.DAILY:
            candidate = now.replace(hour=self.hour, minute=self.minute, second=0, microsecond=0)
            if candidate <= now:
                candidate += timedelta(days=1)
            next_run = candidate

        elif self.repeat == RepeatChoice.WEEKLY:
            target_dow = (self.day_of_week or 0) % 7
            days_ahead = (target_dow - now.weekday()) % 7
            candidate = (now + timedelta(days=days_ahead)).replace(
                hour=self.hour, minute=self.minute, second=0, microsecond=0
            )
            if candidate <= now:
                candidate += timedelta(days=7)
            next_run = candidate

        elif self.repeat == RepeatChoice.MONTHLY:
            day = max(1, min(self.day_of_month or 1, 28))
            year, month = now.year, now.month
            candidate = now.replace(year=year, month=month, day=day,
                                     hour=self.hour, minute=self.minute,
                                     second=0, microsecond=0)
            if candidate <= now:
                month += 1
                if month > 12:
                    month = 1
                    year += 1
                last_day = calendar.monthrange(year, month)[1]
                day = min(day, last_day, 28)
                candidate = candidate.replace(year=year, month=month, day=day)
            next_run = candidate

        elif self.repeat == RepeatChoice.QUARTERLY:
            base_dt = self.last_run_at or now
            candidate = base_dt + timedelta(days=90)
            candidate = candidate.replace(hour=self.hour, minute=self.minute, second=0, microsecond=0)
            if candidate <= now:
                candidate = (now + timedelta(days=90)).replace(
                    hour=self.hour, minute=self.minute, second=0, microsecond=0
                )
            next_run = candidate

        elif self.repeat == RepeatChoice.CUSTOM:
            interval = max(1, self.custom_interval_days or 30)
            base_dt = self.last_run_at or now
            candidate = base_dt + timedelta(days=interval)
            candidate = candidate.replace(hour=self.hour, minute=self.minute, second=0, microsecond=0)
            if candidate <= now:
                candidate = (now + timedelta(days=interval)).replace(
                    hour=self.hour, minute=self.minute, second=0, microsecond=0
                )
            next_run = candidate

        self.next_run_at = next_run
        return next_run


class TaskExecutionLog(models.Model):
    task = models.ForeignKey(ScheduledTask, on_delete=models.CASCADE, related_name='logs')
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, default=TaskRunStatus.RUNNING)
    duration = models.FloatField(null=True, blank=True)
    records_processed = models.IntegerField(default=0)
    records_updated = models.IntegerField(default=0)
    records_created = models.IntegerField(default=0)
    records_failed = models.IntegerField(default=0)
    records_skipped = models.IntegerField(default=0)
    triggered_manually = models.BooleanField(default=False)
    error_message = models.TextField(blank=True, default='')
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f'{self.task.task_type} @ {self.started_at:%Y-%m-%d %H:%M} ({self.status})'
