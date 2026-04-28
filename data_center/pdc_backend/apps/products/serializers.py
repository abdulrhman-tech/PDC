"""
Serializers for the products app.
"""
from rest_framework import serializers
from apps.products.models import Product, Brand, ProductSubmission, SubmissionImage
from apps.categories.models import Category, CategoryAttributeSchema
from apps.images.models import ProductImage


class ProductImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = ProductImage
        fields = ['id', 'image_type', 'url', 'order', 'status', 'is_ai_generated', 'created_at']

    def get_url(self, obj):
        return obj.get_display_url()


class ProductListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for product listing."""
    category_name = serializers.CharField(source='category.name_ar', read_only=True)
    brand_name = serializers.CharField(source='brand.name_ar', read_only=True)
    main_image_url = serializers.SerializerMethodField()
    completeness = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'sku', 'product_name_ar', 'product_name_en',
            'category', 'category_name', 'brand_name', 'status', 'inventory_type',
            'color', 'price_sar', 'stock_status', 'main_image_url',
            'completeness', 'created_at', 'updated_at',
            'attributes', 'description_ar', 'description_en',
            'ecommerce_url',
        ]

    def get_main_image_url(self, obj):
        # Prefer the canonical approved 'main' image; if it's missing, fall
        # back to ANY approved image (lifestyle/gallery/etc.) so catalog
        # cards never render empty when other images exist. Ordered by the
        # image's `order` field as a deterministic tie-breaker.
        approved = [i for i in obj.images.all() if i.status == 'approved']
        if not approved:
            return None
        img = next((i for i in approved if i.image_type == 'main'), None)
        if img is None:
            img = sorted(approved, key=lambda i: (i.order, i.id))[0]
        return img.get_display_url()

    def get_completeness(self, obj):
        return obj.completeness_score()


class ProductDetailSerializer(serializers.ModelSerializer):
    """Full serializer for product detail."""
    category_name = serializers.CharField(source='category.name_ar', read_only=True)
    category_name_en = serializers.CharField(source='category.name_en', read_only=True)
    category_slug = serializers.CharField(source='category.slug', read_only=True)
    subcategory_name = serializers.CharField(source='subcategory.name_ar', read_only=True)
    brand_name = serializers.CharField(source='brand.name_ar', read_only=True)
    brand_name_en = serializers.CharField(source='brand.name', read_only=True)
    origin_country_en = serializers.SerializerMethodField()
    color_en = serializers.SerializerMethodField()
    images = ProductImageSerializer(many=True, read_only=True)
    completeness = serializers.SerializerMethodField()
    attribute_schema = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = '__all__'

    def get_origin_country_en(self, obj):
        if not obj.origin_country:
            return None
        from apps.settings_app.models import LookupValue
        lv = LookupValue.objects.filter(
            lookup_type='country', name_ar=obj.origin_country
        ).first()
        return lv.name_en if lv and lv.name_en else obj.origin_country

    def get_color_en(self, obj):
        if not obj.color:
            return None
        from apps.settings_app.models import LookupValue
        lv = LookupValue.objects.filter(
            lookup_type='color', name_ar=obj.color
        ).first()
        return lv.name_en if lv and lv.name_en else obj.color

    def get_completeness(self, obj):
        return obj.completeness_score()

    def get_attribute_schema(self, obj):
        # Schemas are conventionally defined on the L1 root category and
        # inherited by all descendants (see CategoryViewSet.attributes), but
        # nothing prevents intermediate-level categories from also having their
        # own schema rows. To handle both cases correctly we walk the FULL
        # ancestor chain (from leaf to root), collect every schema, and dedupe
        # by field_key so the most specific (deepest) definition wins for any
        # key shared between levels. This fixes the bug where stopping at the
        # first ancestor with any schemas hides the root's full schema set when
        # a sub-category happens to have a small set of unrelated extras.
        category = obj.category
        visited: set[int] = set()
        chain = []  # leaf → root
        while category is not None and category.id not in visited:
            visited.add(category.id)
            chain.append(category)
            category = category.parent
        if not chain:
            return []

        # Iterate root → leaf so deeper definitions overwrite root entries
        # for shared keys, while preserving root's ordering for keys that
        # are not redefined deeper.
        by_key: dict[str, CategoryAttributeSchema] = {}
        for cat in reversed(chain):
            for s in CategoryAttributeSchema.objects.filter(category=cat).order_by('order'):
                by_key[s.field_key] = s

        return [
            {
                'key': s.field_key,
                'label_ar': s.field_label_ar,
                'label_en': s.field_label_en,
                'type': s.field_type,
                'options': s.options,
                'options_en': s.options_en,
                'required': s.is_required,
                'unit': s.unit,
                'unit_en': s.unit_en,
                'help_text': s.help_text_ar,
            }
            for s in by_key.values()
        ]


class ProductCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        exclude = ['created_by', 'updated_by', 'published_at', 'sap_last_sync']

    def validate_attributes(self, value):
        """
        Validate dynamic attributes against category schema.
        On partial updates (PATCH) we only validate if at least one
        required field uses the new English key convention — otherwise
        we let the existing data pass through untouched.
        """
        # Skip validation on partial updates to avoid breaking products
        # that were created before the schema key naming convention was set.
        if self.partial:
            return value

        category_id = self.initial_data.get('category') or (
            self.instance.category_id if self.instance else None
        )
        if not category_id:
            return value

        required_fields = list(CategoryAttributeSchema.objects.filter(
            category_id=category_id, is_required=True
        ).values_list('field_key', flat=True))

        if not required_fields:
            return value

        # Only enforce when the incoming dict uses English keys (new convention)
        has_english_keys = any(k == k.lower() and '_' in k for k in value.keys())
        if not has_english_keys:
            return value

        missing = [f for f in required_fields if not value.get(f)]
        if missing:
            raise serializers.ValidationError(
                f'الحقول التالية مطلوبة لهذه الفئة: {", ".join(missing)}'
            )
        return value

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            validated_data['created_by'] = request.user
            validated_data['updated_by'] = request.user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            validated_data['updated_by'] = request.user
        return super().update(instance, validated_data)


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = '__all__'


class SubmissionImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubmissionImage
        fields = ['id', 'r2_url', 'uploaded_at']


class ProductSubmissionSerializer(serializers.ModelSerializer):
    images           = SubmissionImageSerializer(many=True, read_only=True)
    category_name    = serializers.CharField(source='category.name_ar', read_only=True)
    status_display   = serializers.CharField(source='get_status_display', read_only=True)
    manager_name     = serializers.CharField(source='assigned_manager.name_ar', read_only=True)

    class Meta:
        model = ProductSubmission
        fields = [
            'id', 'sku', 'category', 'category_name', 'product_name_ar',
            'submitter_name', 'submitter_email',
            'status', 'status_display',
            'assigned_manager', 'manager_name',
            'manager_notes', 'admin_notes',
            'extra_data',
            'product', 'images',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['status', 'assigned_manager', 'product', 'created_at', 'updated_at']
