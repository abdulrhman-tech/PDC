from django.urls import path
from . import views

urlpatterns = [
    path('upload/', views.upload_source_image, name='decorative-upload'),
    path('analyze/', views.analyze_image, name='decorative-analyze'),
    path('generate/', views.generate_decorative, name='decorative-generate'),
    path('<int:generation_id>/status/', views.check_generation_status, name='decorative-status'),
    path('<int:generation_id>/attach-to-product/', views.attach_to_product, name='decorative-attach'),
    path('<int:generation_id>/', views.generation_detail, name='decorative-detail'),
    path('history/', views.generation_history, name='decorative-history'),
    path('credits/', views.kie_credits, name='decorative-credits'),
    path('bulk-images-upload/', views.bulk_images_upload, name='bulk-images-upload'),
    path('analyze-multi/', views.analyze_multi, name='decorative-analyze-multi'),
    path('generate-multi/', views.generate_multi, name='decorative-generate-multi'),
    path('analyze-dual/', views.analyze_dual, name='decorative-analyze-dual'),
    path('generate-dual/', views.generate_dual, name='decorative-generate-dual'),
    path('enhance/', views.enhance_image, name='decorative-enhance'),
]
