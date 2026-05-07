"""
Django settings — Production
Bayt Alebaa Product Data Center
Serves both the Django API and the compiled React SPA.
"""
from .base import *
from pathlib import Path

DEBUG = False

ALLOWED_HOSTS = ['*']

# React build output sits next to the backend directory
REACT_BUILD_DIR = BASE_DIR.parent / 'pdc_frontend' / 'dist'

# WhiteNoise: serve the React dist folder at the root URL
# (e.g. /assets/*, /favicon.ico, etc.)
WHITENOISE_ROOT = str(REACT_BUILD_DIR)
WHITENOISE_MAX_AGE = 31536000

# CORS — frontend is served from the same Django/WhiteNoise origin in production,
# so same-origin API calls don't need CORS at all. Only list known external origins.
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    'https://bayt-alebaa-pdc.onrender.com',
    'https://datacenterebaa.replit.app',
]
CORS_ALLOW_CREDENTIALS = True

# Trust Render's reverse proxy for HTTPS
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
SECURE_SSL_REDIRECT = False  # Render terminates TLS upstream

# Security hardening
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = 'Lax'
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {'class': 'logging.StreamHandler'},
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',
    },
}
