"""
Custom permissions for the products app.
Implements the role-based permission matrix from brand-guidelines.md section 10.
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS
from apps.users.models import UserRole


class ProductPermissions(BasePermission):
    """
    Permission matrix:
    - GET (list/detail): All authenticated users
    - POST (create): مدير قسم + super_admin
    - PUT/PATCH (update): مدير قسم (own category) + super_admin
    - DELETE: super_admin only
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True

        if not request.user.is_authenticated:
            return False

        if request.method == 'POST':
            if view.action == 'create':
                return request.user.can_add_product()
            return True  # Other POST actions checked per-object

        if request.method in ['PUT', 'PATCH']:
            return request.user.role in [
                UserRole.DEPT_MANAGER,
                UserRole.SUPER_ADMIN,
            ]

        if request.method == 'DELETE':
            return request.user.is_super_admin

        return False

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True

        # Super admin: full access
        if request.user.is_super_admin:
            return True

        # Dept manager: only categories within their assigned subtree(s)
        if request.user.is_dept_manager:
            managed = request.user.get_managed_category_ids()
            return bool(managed) and obj.category_id in managed

        # publish action: super admin only
        if view.action == 'publish':
            return False

        return False


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_super_admin


class CanManageUsers(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.can_manage_users()


class CanGenerateCatalog(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.can_generate_catalog()
