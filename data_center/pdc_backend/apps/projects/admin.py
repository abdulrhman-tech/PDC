from django.contrib import admin
from .models import Project, ProjectImage


class ProjectImageInline(admin.TabularInline):
    model = ProjectImage
    extra = 0
    fields = ('image_url', 'sort_order', 'is_cover', 'alt_text')
    readonly_fields = ('image_url',)


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('id', 'name_ar', 'is_active', 'sort_order', 'created_by', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name_ar', 'name_en')
    filter_horizontal = ('products',)
    inlines = [ProjectImageInline]


@admin.register(ProjectImage)
class ProjectImageAdmin(admin.ModelAdmin):
    list_display = ('id', 'project', 'sort_order', 'is_cover', 'created_at')
    list_filter = ('is_cover',)
    search_fields = ('project__name_ar', 'image_key')
