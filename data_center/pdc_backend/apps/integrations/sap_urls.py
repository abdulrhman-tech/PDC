from django.urls import path
from apps.integrations import sap_views, translate_views, scheduler_views

urlpatterns = [
    path('translate/', translate_views.translate_text, name='translate-text'),
    path('scheduled-tasks/', scheduler_views.list_scheduled_tasks, name='sap-scheduled-tasks'),
    path('scheduled-tasks/<int:pk>/', scheduler_views.update_scheduled_task, name='sap-scheduled-task-update'),
    path('scheduled-tasks/<int:pk>/run-now/', scheduler_views.run_scheduled_task_now, name='sap-scheduled-task-run'),
    path('scheduled-tasks/<int:pk>/logs/', scheduler_views.task_execution_logs, name='sap-scheduled-task-logs'),
    path('test-connection/', sap_views.test_connection, name='sap-test-connection'),
    path('diagnose/', sap_views.diagnose_connection, name='sap-diagnose'),
    path('hierarchy/', sap_views.get_hierarchy, name='sap-hierarchy'),
    path('hierarchy/sync/', sap_views.sync_hierarchy, name='sap-hierarchy-sync'),
    path('hierarchy/sync-selected/', sap_views.sync_hierarchy_selected, name='sap-hierarchy-sync-selected'),
    path('product/<str:material_number>/', sap_views.get_product, name='sap-product'),
    path('product/<str:material_number>/save/', sap_views.save_product, name='sap-product-save'),
    path('products/', sap_views.get_products_by_date, name='sap-products-by-date'),
    path('products/sync/', sap_views.sync_products, name='sap-products-sync'),
]
