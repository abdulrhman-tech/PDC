"""
URL configuration for pdc_backend project.
In production, any URL that is not an API/admin/static route
returns the React SPA index.html so client-side routing works.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.http import FileResponse, HttpResponseNotFound, HttpResponse
from django.conf import settings
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
import os
import requests as http_requests


def serve_react_spa(request, *args, **kwargs):
    """Return the compiled React index.html for any non-API route."""
    index_path = getattr(settings, 'REACT_BUILD_DIR', None)
    if index_path:
        index_file = os.path.join(str(index_path), 'index.html')
        if os.path.exists(index_file):
            return FileResponse(open(index_file, 'rb'), content_type='text/html')
    return HttpResponseNotFound('React build not found. Run the build step first.')


# Trusted R2 bucket hostname (only proxy images from our own bucket)
_ALLOWED_PROXY_HOST = 'pub-aafb229d4aed463c8d2160dc56eb9da7.r2.dev'


def proxy_r2_image(request):
    """
    Server-side proxy for Cloudflare R2 images.
    Browsers cannot read cross-origin canvas pixels (needed for html2canvas PDF
    export) even though the images display fine in <img> tags.  This endpoint
    fetches the image on the server side and returns it with permissive CORS
    headers so the browser can convert it to a data-URL.

    Usage:  GET /api/proxy-image/?url=<encoded-r2-url>
    """
    from urllib.parse import urlparse

    url = request.GET.get('url', '').strip()
    if not url:
        return HttpResponse('Missing url parameter', status=400)

    parsed = urlparse(url)
    if parsed.hostname != _ALLOWED_PROXY_HOST:
        return HttpResponse('URL not allowed', status=403)

    try:
        resp = http_requests.get(url, timeout=15, stream=True)
        resp.raise_for_status()
        content_type = resp.headers.get('Content-Type', 'image/jpeg').split(';')[0].strip()
        if not content_type.startswith('image/'):
            return HttpResponse('Not an image', status=400)
        response = HttpResponse(resp.content, content_type=content_type)
        response['Access-Control-Allow-Origin'] = '*'
        response['Cache-Control'] = 'public, max-age=3600'
        return response
    except Exception as e:
        return HttpResponse(f'Proxy error: {e}', status=502)


urlpatterns = [
    path('admin/', admin.site.urls),

    # Image proxy (needed by html2canvas PDF export to bypass R2 CORS)
    path('api/proxy-image/', proxy_r2_image, name='proxy-r2-image'),

    # API v1
    path('api/v1/', include([
        path('auth/', include('apps.users.urls.auth')),
        path('users/', include('apps.users.urls.users')),
        path('products/', include('apps.products.urls')),
        path('categories/', include('apps.categories.urls')),
        path('analytics/', include('apps.analytics.urls')),
        path('approvals/', include('apps.approvals.urls')),
        path('logs/', include('apps.logs.urls')),
        path('settings/', include('apps.settings_app.urls')),
        path('decorative/', include('apps.images.urls')),
        path('sap/', include('apps.integrations.sap_urls')),
    ])),

    # API Docs
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # React SPA catch-all — must be LAST
    # Matches every path that is NOT under api/ or admin/
    re_path(r'^(?!api/|admin/).*$', serve_react_spa, name='react-spa'),
]
