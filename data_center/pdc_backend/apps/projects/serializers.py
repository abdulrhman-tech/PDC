"""Serializers for the projects app."""
from rest_framework import serializers
from apps.products.models import Product
from .models import Project, ProjectImage


class ProjectImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectImage
        fields = ['id', 'image_url', 'image_key', 'alt_text', 'sort_order',
                  'is_cover', 'created_at']
        read_only_fields = fields


class ProductMinimalSerializer(serializers.ModelSerializer):
    """Minimal product info for project autocomplete + project detail."""
    category_name_ar = serializers.CharField(source='category.name_ar', read_only=True)
    category_name_en = serializers.CharField(source='category.name_en', read_only=True)
    thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'sku', 'product_name_ar', 'product_name_en',
            'category', 'category_name_ar', 'category_name_en',
            'thumbnail_url',
        ]

    def get_thumbnail_url(self, obj):
        approved = [i for i in obj.images.all() if i.status == 'approved']
        if not approved:
            return None
        img = next((i for i in approved if i.image_type == 'main'), None)
        if img is None:
            img = sorted(approved, key=lambda i: (i.order, i.id))[0]
        return img.get_display_url()


class ProjectListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for the projects grid."""
    cover_image_url = serializers.SerializerMethodField()
    products_count = serializers.IntegerField(source='products.count', read_only=True)
    images_count = serializers.IntegerField(source='images.count', read_only=True)

    class Meta:
        model = Project
        fields = [
            'id', 'name_ar', 'name_en',
            'location_ar', 'location_en',
            'is_active', 'sort_order',
            'cover_image_url', 'products_count', 'images_count',
            'created_at', 'updated_at',
        ]

    def get_cover_image_url(self, obj):
        cover = next((i for i in obj.images.all() if i.is_cover), None)
        if cover is None:
            cover = next(iter(obj.images.all()), None)
        return cover.image_url if cover else None


class ProjectDetailSerializer(serializers.ModelSerializer):
    """Full serializer used for create / update / retrieve."""
    images = ProjectImageSerializer(many=True, read_only=True)
    products = ProductMinimalSerializer(many=True, read_only=True)
    product_ids = serializers.PrimaryKeyRelatedField(
        many=True, write_only=True, required=False,
        queryset=Product.objects.all(),
        source='products',
    )
    # Read-only mirror so the frontend can repopulate the picker on edit.
    product_id_list = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.name_ar', read_only=True)

    class Meta:
        model = Project
        fields = [
            'id', 'name_ar', 'name_en', 'description_ar', 'description_en',
            'location_ar', 'location_en', 'project_year',
            'is_active', 'sort_order',
            'images', 'products', 'product_ids', 'product_id_list',
            'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def get_product_id_list(self, obj):
        return list(obj.products.values_list('id', flat=True))

    def validate_name_ar(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('اسم المشروع بالعربية مطلوب')
        return value

    def validate_product_ids(self, products):
        """
        Dept managers may only attach products inside their managed
        category subtree. Super-admins are unrestricted.
        """
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return products
        if user.is_super_admin:
            return products
        if user.is_dept_manager:
            managed = user.get_managed_category_ids()
            bad = [p for p in (products or []) if p.category_id not in managed]
            if bad:
                names = ', '.join(p.product_name_ar or p.sku for p in bad[:5])
                raise serializers.ValidationError(
                    f'لا تملك صلاحية ربط هذه المنتجات بالمشروع: {names}'
                )
        return products

    def validate(self, attrs):
        # Require at least one product on create AND on update.
        # On partial update without product_ids in payload, keep existing.
        if self.instance is None:
            products = attrs.get('products') or []
            if not products:
                raise serializers.ValidationError({
                    'product_ids': 'اختر منتجاً واحداً على الأقل لربطه بالمشروع'
                })
        elif 'products' in attrs and not attrs['products']:
            raise serializers.ValidationError({
                'product_ids': 'يجب أن يبقى منتج واحد على الأقل مرتبطاً بالمشروع'
            })
        return attrs


class ProjectPublicImageSerializer(serializers.ModelSerializer):
    """Tiny serializer for public images — drops internal fields."""
    class Meta:
        model = ProjectImage
        fields = ['id', 'image_url', 'alt_text', 'is_cover']
        read_only_fields = fields


class ProjectPublicSerializer(serializers.ModelSerializer):
    """
    Lighter serializer used by the public product page section.
    Only exposes safe, public-facing fields.
    """
    images = ProjectPublicImageSerializer(many=True, read_only=True)

    class Meta:
        model = Project
        fields = [
            'id', 'name_ar', 'name_en', 'description_ar', 'description_en',
            'location_ar', 'location_en', 'project_year',
            'images',
        ]
