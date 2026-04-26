"""
Category models for Bayt Alebaa PDC.
Self-referencing hierarchy up to 5 levels with dynamic attribute schemas.
"""
from django.db import models, transaction
from django.core.exceptions import ValidationError

MAX_CATEGORY_LEVEL = 5


class Category(models.Model):
    code = models.CharField(max_length=50, unique=True, verbose_name='كود التصنيف')
    name_ar = models.CharField(max_length=255, verbose_name='الاسم بالعربية')
    name_en = models.CharField(max_length=255, blank=True, verbose_name='Name in English')
    parent = models.ForeignKey(
        'self', on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='children',
        verbose_name='التصنيف الأب',
    )
    level = models.PositiveIntegerField(default=1, verbose_name='المستوى')
    sort_order = models.PositiveIntegerField(default=0, verbose_name='الترتيب')
    is_active = models.BooleanField(default=True)
    # Legacy fields kept for backward compatibility
    slug = models.SlugField(max_length=100, unique=True, null=True, blank=True)
    description_ar = models.TextField(blank=True)
    icon = models.CharField(max_length=50, blank=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'تصنيف'
        verbose_name_plural = 'التصنيفات'
        ordering = ['sort_order', 'order', 'name_ar']

    def clean(self):
        if self.level > MAX_CATEGORY_LEVEL:
            raise ValidationError(f'الحد الأقصى لمستويات التصنيف هو {MAX_CATEGORY_LEVEL}.')

    def _check_no_cycle(self):
        """Reject parent == self or parent in descendants. Walks up via in-memory parent chain."""
        if not self.parent_id or not self.pk:
            return
        if self.parent_id == self.pk:
            raise ValidationError('لا يمكن جعل التصنيف أبًا لنفسه.')
        ancestor = self.parent
        seen = set()
        while ancestor is not None:
            if ancestor.pk in seen:
                raise ValidationError('سلسلة التصنيفات تحتوي على دورة.')
            seen.add(ancestor.pk)
            if ancestor.pk == self.pk:
                raise ValidationError('لا يمكن جعل التصنيف تابعًا لأحد أحفاده.')
            ancestor = ancestor.parent

    def _compute_subtree_depth(self):
        """Returns the depth of the deepest descendant relative to self (0 = no children)."""
        frontier = list(self.children.all())
        depth = 0
        while frontier:
            depth += 1
            next_frontier = []
            for child in frontier:
                next_frontier.extend(child.children.all())
            frontier = next_frontier
        return depth

    def save(self, *args, **kwargs):
        self._check_no_cycle()
        if self.parent_id:
            self.level = self.parent.level + 1
        else:
            self.level = 1
        if self.level > MAX_CATEGORY_LEVEL:
            raise ValidationError(f'الحد الأقصى لمستويات التصنيف هو {MAX_CATEGORY_LEVEL}.')

        old_level = None
        if self.pk:
            old_level = Category.objects.filter(pk=self.pk).values_list('level', flat=True).first()

        # If level is changing, pre-validate full subtree depth and run cascade atomically
        if old_level is not None and old_level != self.level:
            subtree_depth = self._compute_subtree_depth()
            if self.level + subtree_depth > MAX_CATEGORY_LEVEL:
                raise ValidationError(
                    f'نقل هذا التصنيف يجعل عمق الشجرة يتجاوز الحد الأقصى ({MAX_CATEGORY_LEVEL}).'
                )
            with transaction.atomic():
                super().save(*args, **kwargs)
                self._recompute_descendants_level()
            return

        super().save(*args, **kwargs)

    def _recompute_descendants_level(self):
        """Walk descendants breadth-first and reset each child's level to parent.level + 1.
        Uses .update() to avoid re-triggering save() recursion. Caller should hold a transaction."""
        frontier = list(self.children.all())
        while frontier:
            next_frontier = []
            for child in frontier:
                new_level = child.parent.level + 1
                if new_level > MAX_CATEGORY_LEVEL:
                    raise ValidationError(
                        f'الحد الأقصى لمستويات التصنيف هو {MAX_CATEGORY_LEVEL}.'
                    )
                if child.level != new_level:
                    Category.objects.filter(pk=child.pk).update(level=new_level)
                    child.level = new_level
                next_frontier.extend(child.children.all())
            frontier = next_frontier

    def get_ancestors(self):
        """Returns list of ancestors from root to self (inclusive)."""
        ancestors = []
        node = self
        while node:
            ancestors.append(node)
            node = node.parent
        return list(reversed(ancestors))

    def get_path_string(self, lang='ar'):
        name_field = 'name_en' if lang == 'en' else 'name_ar'
        return ' > '.join(getattr(a, name_field) or a.name_ar for a in self.get_ancestors())

    def __str__(self):
        return f'{"— " * (self.level - 1)}{self.name_ar}'


class SubCategory(models.Model):
    """Legacy model — kept for migration safety. Will be removed after data migration."""
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='subcategories')
    name_ar = models.CharField(max_length=100)
    name_en = models.CharField(max_length=100, blank=True)
    slug = models.SlugField()
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'فئة فرعية (قديم)'
        verbose_name_plural = 'الفئات الفرعية (قديم)'
        unique_together = ['category', 'slug']

    def __str__(self):
        return f'{self.category.name_ar} — {self.name_ar}'


class CategoryAttributeSchema(models.Model):
    FIELD_TYPES = [
        ('text', 'نص حر'),
        ('number', 'رقم'),
        ('select', 'قائمة اختيار'),
        ('multi_select', 'اختيار متعدد'),
        ('boolean', 'نعم/لا'),
        ('dimensions', 'أبعاد'),
    ]

    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='attribute_schemas')
    field_key = models.CharField(max_length=50, verbose_name='مفتاح الحقل')
    field_label_ar = models.CharField(max_length=100, verbose_name='اسم الحقل بالعربية')
    field_label_en = models.CharField(max_length=100, blank=True, verbose_name='Field Name in English')
    field_type = models.CharField(max_length=20, choices=FIELD_TYPES, default='text')
    options = models.JSONField(default=list, blank=True, verbose_name='خيارات القائمة (عربي)')
    options_en = models.JSONField(default=list, blank=True, verbose_name='List Options (English)')
    is_required = models.BooleanField(default=False, verbose_name='مطلوب')
    unit = models.CharField(max_length=20, blank=True, verbose_name='الوحدة بالعربية')
    unit_en = models.CharField(max_length=20, blank=True, verbose_name='Unit in English')
    order = models.PositiveIntegerField(default=0, verbose_name='الترتيب')
    help_text_ar = models.CharField(max_length=200, blank=True, verbose_name='نص مساعد')

    class Meta:
        verbose_name = 'حقل ديناميكي للفئة'
        verbose_name_plural = 'الحقول الديناميكية للفئات'
        ordering = ['category', 'order']
        unique_together = ['category', 'field_key']

    def __str__(self):
        return f'{self.category.name_ar} — {self.field_label_ar}'
