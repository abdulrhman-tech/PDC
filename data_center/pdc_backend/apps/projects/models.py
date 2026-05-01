"""
Project models — مشاريعنا.

A Project represents a real-world job (villa, hotel, restaurant, ...) executed
using Bayt Alebaa products. Each project has many photos and many products.
"""
from django.db import models


class Project(models.Model):
    name_ar = models.CharField(max_length=255, verbose_name='اسم المشروع بالعربية')
    name_en = models.CharField(max_length=255, blank=True, default='', verbose_name='اسم المشروع بالإنجليزية')
    description_ar = models.TextField(blank=True, default='', verbose_name='وصف المشروع بالعربية')
    description_en = models.TextField(blank=True, default='', verbose_name='وصف المشروع بالإنجليزية')

    location_ar = models.CharField(max_length=255, blank=True, default='', verbose_name='الموقع بالعربية')
    location_en = models.CharField(max_length=255, blank=True, default='', verbose_name='الموقع بالإنجليزية')
    project_year = models.PositiveSmallIntegerField(null=True, blank=True, verbose_name='سنة المشروع')

    products = models.ManyToManyField(
        'products.Product',
        related_name='projects',
        blank=True,
        verbose_name='المنتجات المستخدمة',
    )

    is_active = models.BooleanField(default=True, verbose_name='مفعّل')
    sort_order = models.PositiveIntegerField(default=0, verbose_name='ترتيب العرض')

    created_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_projects',
        verbose_name='أنشأه',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order', '-created_at']
        verbose_name = 'مشروع'
        verbose_name_plural = 'مشاريع'
        indexes = [
            models.Index(fields=['is_active']),
            models.Index(fields=['sort_order']),
        ]

    def __str__(self):
        return self.name_ar


class ProjectImage(models.Model):
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='images',
        verbose_name='المشروع',
    )
    # R2 storage: projects/{project_id}/{uuid}.{ext}
    image_url = models.URLField(max_length=1000, verbose_name='رابط الصورة في R2')
    image_key = models.CharField(max_length=500, verbose_name='مفتاح الصورة في R2')
    alt_text = models.CharField(max_length=255, blank=True, default='', verbose_name='نص بديل')
    sort_order = models.PositiveIntegerField(default=0, verbose_name='الترتيب')
    # The first (lowest sort_order) image is the cover; we store an explicit
    # flag too so callers can quickly fetch it without sorting the whole set.
    is_cover = models.BooleanField(default=False, verbose_name='صورة الغلاف')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'created_at']
        verbose_name = 'صورة مشروع'
        verbose_name_plural = 'صور المشاريع'
        indexes = [
            models.Index(fields=['project', 'sort_order']),
        ]

    def __str__(self):
        return f'صورة {self.project.name_ar} (#{self.sort_order})'
