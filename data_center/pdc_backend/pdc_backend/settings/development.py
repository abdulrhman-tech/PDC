from .base import *

DEBUG = True
ALLOWED_HOSTS = ['*']

EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

CORS_ALLOW_ALL_ORIGINS = True

# Use in-process memory cache in development — Upstash Redis is production-only
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'pdc-dev',
    }
}
