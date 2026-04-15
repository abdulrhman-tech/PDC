from django.urls import path
from apps.integrations import sap_views

urlpatterns = [
    path('test-connection/', sap_views.test_connection, name='sap-test-connection'),
    path('hierarchy/', sap_views.get_hierarchy, name='sap-hierarchy'),
    path('hierarchy/sync/', sap_views.sync_hierarchy, name='sap-hierarchy-sync'),
]
