from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='scheduledtask',
            name='sap_env',
            field=models.CharField(
                choices=[('DEV', 'تجريبي (DEV)'), ('PRD', 'إنتاج (PRD)')],
                default='PRD',
                max_length=10,
            ),
        ),
    ]
