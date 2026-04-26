import django.db.models.deletion
from django.db import migrations, models


def copy_department_to_departments(apps, schema_editor):
    """Backfill: copy each user's legacy single ``department`` FK into the new
    ``departments`` M2M so existing dept_managers don't lose access."""
    User = apps.get_model('users', 'User')
    for user in User.objects.exclude(department__isnull=True).only('id', 'department_id'):
        user.departments.add(user.department_id)


def reverse_noop(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('categories', '0003_hierarchical_categories'),
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='departments',
            field=models.ManyToManyField(blank=True, related_name='managers_m2m', to='categories.category', verbose_name='الأقسام المسؤول عنها'),
        ),
        migrations.AlterField(
            model_name='user',
            name='department',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='managers', to='categories.category', verbose_name='القسم المسؤول عنه (قديم)'),
        ),
        migrations.RunPython(copy_department_to_departments, reverse_noop),
    ]
