from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='ScheduledTask',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('task_type', models.CharField(choices=[('sync_hierarchy', 'مزامنة التصنيفات والسمات'), ('sync_products', 'تحديث الأصناف المتغيرة')], max_length=50, unique=True)),
                ('is_active', models.BooleanField(default=False)),
                ('repeat', models.CharField(choices=[('daily', 'يومي'), ('weekly', 'أسبوعي'), ('monthly', 'شهري'), ('quarterly', 'كل 3 أشهر'), ('custom', 'مخصص')], default='monthly', max_length=20)),
                ('day_of_month', models.PositiveIntegerField(blank=True, default=1, null=True)),
                ('day_of_week', models.PositiveIntegerField(blank=True, default=0, null=True)),
                ('hour', models.PositiveIntegerField(default=2)),
                ('minute', models.PositiveIntegerField(default=0)),
                ('custom_interval_days', models.PositiveIntegerField(blank=True, default=30, null=True)),
                ('last_run_at', models.DateTimeField(blank=True, null=True)),
                ('last_run_status', models.CharField(default='never', max_length=20)),
                ('last_run_message', models.TextField(blank=True, default='')),
                ('last_run_duration', models.FloatField(blank=True, null=True)),
                ('next_run_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'ordering': ['task_type']},
        ),
        migrations.CreateModel(
            name='TaskExecutionLog',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('started_at', models.DateTimeField(auto_now_add=True)),
                ('finished_at', models.DateTimeField(blank=True, null=True)),
                ('status', models.CharField(default='running', max_length=20)),
                ('duration', models.FloatField(blank=True, null=True)),
                ('records_processed', models.IntegerField(default=0)),
                ('records_updated', models.IntegerField(default=0)),
                ('records_created', models.IntegerField(default=0)),
                ('records_failed', models.IntegerField(default=0)),
                ('records_skipped', models.IntegerField(default=0)),
                ('triggered_manually', models.BooleanField(default=False)),
                ('error_message', models.TextField(blank=True, default='')),
                ('details', models.JSONField(blank=True, default=dict)),
                ('task', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='logs', to='integrations.scheduledtask')),
            ],
            options={'ordering': ['-started_at']},
        ),
    ]
