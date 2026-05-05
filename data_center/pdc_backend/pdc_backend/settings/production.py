"""
Django settings — Production
Bayt Alebaa Product Data Center
Serves both the Django API and the compiled React SPA.
"""
from .base import *
from pathlib import Path
import dj_database_url as _dj_db_url

DEBUG = False

ALLOWED_HOSTS = ['*']

# ─── Force Neon production database (overrides any env var) ──────────────
# This guarantees production always connects to the correct Neon instance,
# regardless of what NEON_DATABASE_URL/DATABASE_URL might be set to in the
# hosting environment (Render, Replit, etc.).
_NEON_PROD_URL = (
    "postgresql://neondb_owner:npg_8XpNFuyj7AdM"
    "@ep-dry-breeze-a1buqqso-pooler.ap-southeast-1.aws.neon.tech"
    "/neondb?sslmode=require&channel_binding=require"
)
DATABASES = {
    'default': _dj_db_url.parse(
        _NEON_PROD_URL,
        conn_max_age=60,
        ssl_require=True,
        conn_health_checks=True,
    )
}

# React build output sits next to the backend directory
REACT_BUILD_DIR = BASE_DIR.parent / 'pdc_frontend' / 'dist'

# WhiteNoise: serve the React dist folder at the root URL
# (e.g. /assets/*, /favicon.ico, etc.)
WHITENOISE_ROOT = str(REACT_BUILD_DIR)
WHITENOISE_MAX_AGE = 31536000

# CORS — frontend is served from the same origin in production
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# Trust Replit's reverse proxy for HTTPS
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
SECURE_SSL_REDIRECT = False  # Replit terminates TLS upstream

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
