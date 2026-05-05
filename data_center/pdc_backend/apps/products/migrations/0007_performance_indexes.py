"""
Performance migration: pg_trgm extension + GIN trigram indexes for fast ILIKE search
on product_name_ar, product_name_en, and sku with 100k+ rows.
"""
from django.db import migrations
from django.contrib.postgres.operations import TrigramExtension
from django.contrib.postgres.indexes import GinIndex


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0006_add_description_en'),
    ]

    operations = [
        TrigramExtension(),
        migrations.AddIndex(
            model_name='product',
            index=GinIndex(
                fields=['product_name_ar'],
                name='product_name_ar_trgm_idx',
                opclasses=['gin_trgm_ops'],
            ),
        ),
        migrations.AddIndex(
            model_name='product',
            index=GinIndex(
                fields=['product_name_en'],
                name='product_name_en_trgm_idx',
                opclasses=['gin_trgm_ops'],
            ),
        ),
        migrations.AddIndex(
            model_name='product',
            index=GinIndex(
                fields=['sku'],
                name='product_sku_trgm_idx',
                opclasses=['gin_trgm_ops'],
            ),
        ),
    ]
