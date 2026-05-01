"""
Permissions for the projects app.

Mirrors the products permission matrix:
- GET (list/detail): any authenticated user.
- POST / PUT / PATCH / DELETE: super_admin OR dept_manager.

Per-object: a dept_manager may modify (or delete) a project only if at
least one of the project's products lies inside one of the categories
the manager owns (via ``User.get_managed_category_ids``). A project
with no products is editable only by its creator (catches the draft
case where the manager hasn't attached products yet).
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS
from apps.users.models import UserRole


class ProjectPermissions(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)

        if not (request.user and request.user.is_authenticated):
            return False

        # POST / PUT / PATCH / DELETE — same role gate; per-object scope
        # is enforced in has_object_permission for dept managers.
        return request.user.role in (
            UserRole.SUPER_ADMIN,
            UserRole.DEPT_MANAGER,
        )

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True

        user = request.user
        if user.is_super_admin:
            return True

        if user.is_dept_manager:
            managed = user.get_managed_category_ids()
            if not managed:
                return False
            # Manager may touch the project if ANY of its products' categories
            # falls inside the managed subtree(s). A project with no products
            # is editable only by its creator (catches the "draft" case where
            # the manager hasn't attached products yet).
            project_categories = set(
                obj.products.values_list('category_id', flat=True)
            )
            if not project_categories:
                return obj.created_by_id == user.id
            return bool(project_categories & managed)

        return False
