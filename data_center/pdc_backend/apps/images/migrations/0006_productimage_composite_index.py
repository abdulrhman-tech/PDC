from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('images', '0005_add_multi_product_fields'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='productimage',
            index=models.Index(
                fields=['product', 'image_type', 'status'],
                name='img_product_type_status_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='productimage',
            index=models.Index(
                fields=['product', 'status'],
                name='img_product_status_idx',
            ),
        ),
    ]
