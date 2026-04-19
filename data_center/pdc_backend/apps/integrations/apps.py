from django.apps import AppConfig


class IntegrationsConfig(AppConfig):
    default_auto_field = 'django.db.models.AutoField'
    name = 'apps.integrations'

    def ready(self):
        from django.db.models.signals import post_migrate

        def _seed_and_start(sender, **kwargs):
            if sender.name != self.name:
                return
            try:
                from apps.integrations.models import ScheduledTask, TaskType, RepeatChoice
                defaults_map = {
                    TaskType.SYNC_HIERARCHY: {
                        'is_active': False,
                        'repeat': RepeatChoice.MONTHLY,
                        'day_of_month': 1,
                        'hour': 2,
                        'minute': 0,
                    },
                    TaskType.SYNC_PRODUCTS: {
                        'is_active': False,
                        'repeat': RepeatChoice.MONTHLY,
                        'day_of_month': 1,
                        'hour': 2,
                        'minute': 0,
                    },
                }
                for ttype, defaults in defaults_map.items():
                    obj, created = ScheduledTask.objects.get_or_create(
                        task_type=ttype, defaults=defaults,
                    )
                    if created and obj.is_active:
                        obj.calculate_next_run()
                        obj.save(update_fields=['next_run_at'])
            except Exception:
                import logging
                logging.getLogger(__name__).exception('Failed to seed scheduled tasks')

            try:
                from apps.integrations.scheduler import start_scheduler
                start_scheduler()
            except Exception:
                import logging
                logging.getLogger(__name__).exception('Failed to start SAP scheduler')

        post_migrate.connect(_seed_and_start, dispatch_uid='integrations.seed_and_start')
