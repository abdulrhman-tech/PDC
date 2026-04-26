"""
Serializers for users app.
"""
from rest_framework import serializers
from apps.users.models import User
from apps.categories.models import Category


def _get_category_tree_map(serializer):
    """Return (and memoize per-serialization) a {id: {name_ar, name_en, parent_id}} map
    of every category. Avoids re-querying the full tree once per user when the
    serializer is used to render a list of N users (would otherwise be N queries)."""
    ctx = getattr(serializer, '_context', None)
    cache_key = '_category_tree_map'
    if ctx is not None and cache_key in ctx:
        return ctx[cache_key]
    tree_map = {
        c['id']: c for c in Category.objects.values('id', 'name_ar', 'name_en', 'parent_id')
    }
    if ctx is not None:
        ctx[cache_key] = tree_map
    return tree_map


def _serialize_departments(user, tree_map):
    """Compact info for each assigned category: id, ar/en name, level, breadcrumb."""
    cats = list(user.departments.all().values('id', 'name_ar', 'name_en', 'level', 'parent_id'))
    if not cats:
        return []

    def path_ar(cid):
        names, seen, cur = [], set(), cid
        while cur and cur not in seen:
            seen.add(cur)
            node = tree_map.get(cur)
            if not node:
                break
            names.append(node['name_ar'])
            cur = node['parent_id']
        return ' / '.join(reversed(names))

    return [
        {
            'id': c['id'],
            'name_ar': c['name_ar'],
            'name_en': c['name_en'],
            'level': c['level'],
            'path_ar': path_ar(c['id']),
        }
        for c in cats
    ]


class UserSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    department_name = serializers.CharField(source='department.name_ar', read_only=True)
    departments = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    departments_info = serializers.SerializerMethodField()

    # Permission flags for frontend role-based UI
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'name_ar', 'name_en', 'role', 'role_display',
            'department', 'department_name',
            'departments', 'departments_info',
            'avatar', 'is_active', 'date_joined', 'permissions',
        ]
        read_only_fields = ['id', 'date_joined', 'role', 'department', 'departments']

    def get_permissions(self, obj):
        return {
            'can_add_product': obj.can_add_product(),
            'can_publish_product': obj.can_publish_product(),
            'can_generate_catalog': obj.can_generate_catalog(),
            'can_view_reports': obj.can_view_reports(),
            'can_manage_users': obj.can_manage_users(),
        }

    def get_departments_info(self, obj):
        return _serialize_departments(obj, _get_category_tree_map(self))


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'name_ar', 'name_en', 'avatar']
        read_only_fields = ['id', 'email']


class UserAdminSerializer(serializers.ModelSerializer):
    """Full serializer for Super Admin user management."""
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    department_name = serializers.CharField(source='department.name_ar', read_only=True, default=None)
    departments = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Category.objects.all(),
        required=False,
    )
    departments_info = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'name_ar', 'name_en', 'role', 'role_display',
            'department', 'department_name',
            'departments', 'departments_info',
            'is_active', 'avatar', 'date_joined', 'last_login', 'permissions',
        ]

    def get_permissions(self, obj):
        return {
            'can_add_product': obj.can_add_product(),
            'can_publish_product': obj.can_publish_product(),
            'can_generate_catalog': obj.can_generate_catalog(),
            'can_view_reports': obj.can_view_reports(),
            'can_manage_users': obj.can_manage_users(),
        }

    def get_departments_info(self, obj):
        return _serialize_departments(obj, _get_category_tree_map(self))


class CreateUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    departments = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Category.objects.all(),
        required=False,
    )

    class Meta:
        model = User
        fields = ['email', 'name_ar', 'name_en', 'role', 'department', 'departments', 'password']

    def create(self, validated_data):
        password = validated_data.pop('password')
        departments = validated_data.pop('departments', None)
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        if departments is not None:
            user.departments.set(departments)
            # Mirror the first selection into the legacy single-department FK
            # so legacy code paths keep working until we fully retire it.
            user.department = departments[0] if departments else None
            user.save(update_fields=['department'])
        return user
