from django.urls import path
from apps.integrations import sap_views

urlpatterns = [
    path('test-connection/', sap_views.test_connection, name='sap-test-connection'),
    path('diagnose/', sap_views.diagnose_connection, name='sap-diagnose'),
    path('hierarchy/', sap_views.get_hierarchy, name='sap-hierarchy'),
    path('hierarchy/sync/', sap_views.sync_hierarchy, name='sap-hierarchy-sync'),
    path('product/<str:material_number>/', sap_views.get_product, name='sap-product'),
    path('product/<str:material_number>/save/', sap_views.save_product, name='sap-product-save'),
    path('products/', sap_views.get_products_by_date, name='sap-products-by-date'),
    path('products/sync/', sap_views.sync_products, name='sap-products-sync'),
]
