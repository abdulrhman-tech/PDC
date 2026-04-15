"""
Django settings — Base
Bayt Alebaa Product Data Center
"""
from pathlib import Path
from datetime import timedelta
from decouple import config, Csv

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = config('SECRET_KEY', default='dev-secret-key-change-in-production-must-be-50chars')
DEBUG = config('DEBUG', default=True, cast=bool)
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=Csv())

# Application definition
DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',
    'drf_spectacular',
    'django_celery_beat',
    'django_celery_results',
    'django_extensions',
]

LOCAL_APPS = [
    'apps.users',
    'apps.products',
    'apps.categories',
    'apps.images',
    'apps.analytics',
    'apps.integrations',
    'apps.approvals',
    'apps.logs',
    'apps.settings_app',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'pdc_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'pdc_backend.wsgi.application'

# Database
import dj_database_url as _dj_db_url

_DATABASE_URL = config(
    'NEON_DATABASE_URL',
    default=config('DATABASE_URL', default=None),
)

if _DATABASE_URL:
    DATABASES = {
        'default': _dj_db_url.parse(
            _DATABASE_URL,
            conn_max_age=600,
            ssl_require=True,
        )
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': config('DB_NAME', default='pdc_db'),
            'USER': config('DB_USER', default='pdc_user'),
            'PASSWORD': config('DB_PASSWORD', default='pdc_password'),
            'HOST': config('DB_HOST', default='localhost'),
            'PORT': config('DB_PORT', default='5432'),
        }
    }

# Cache & Celery
REDIS_URL = config('REDIS_URL', default='redis://localhost:6379/0')

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': REDIS_URL,
    }
}

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = 'django-db'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'Asia/Riyadh'
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'

# Auth
AUTH_USER_MODEL = 'users.User'

# JWT
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=config('JWT_ACCESS_TOKEN_LIFETIME_MINUTES', default=60, cast=int)),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=config('JWT_REFRESH_TOKEN_LIFETIME_DAYS', default=7, cast=int)),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# DRF
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 24,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

# Spectacular (Swagger)
SPECTACULAR_SETTINGS = {
    'TITLE': 'Bayt Alebaa — Product Data Center API',
    'DESCRIPTION': 'مركز بيانات المنتجات والصور | بيت الإباء',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
}

# CORS
CORS_ALLOWED_ORIGINS = config('CORS_ALLOWED_ORIGINS', default='http://localhost:5173,http://localhost:3000', cast=Csv())
CORS_ALLOW_CREDENTIALS = True

# Cloudflare R2 Storage
R2_ACCESS_KEY_ID = config('R2_ACCESS_KEY_ID', default='')
R2_SECRET_ACCESS_KEY = config('R2_SECRET_ACCESS_KEY', default='')
R2_BUCKET_NAME = config('R2_BUCKET_NAME', default='bayt-alebaa-pdc')
R2_ENDPOINT_URL = config('R2_ENDPOINT_URL', default='')
R2_PUBLIC_URL = config('R2_PUBLIC_URL', default='')

DEFAULT_FILE_STORAGE = 'apps.integrations.storage.R2Storage'

# OpenAI — use OPENAI_API_KEY_PDC to avoid conflict with Replit-injected env var
OPENAI_API_KEY = config('OPENAI_API_KEY_PDC', default='') or config('OPENAI_API_KEY', default='')
OPENAI_MODEL = 'gpt-4o-mini'

# Gemini AI
GEMINI_API_KEY = config('GEMINI_API_KEY', default='')
GEMINI_RATE_LIMIT = 10
GEMINI_CONCURRENT_AI_JOBS = 5

GEMINI_CONFIG = {
    'flash': {
        'model': 'gemini-2.0-flash',
        'fallback_model': 'gemini-2.0-flash-lite',
        'temperature': 0.3,
        'max_output_tokens': 1024,
    },
    'creative': {
        'model': 'gemini-2.0-flash',
        'fallback_model': 'gemini-2.0-flash-lite',
        'temperature': 0.8,
        'max_output_tokens': 512,
    },
    'vision': {
        'model': 'gemini-2.0-flash',
        'fallback_model': 'gemini-2.0-flash-lite',
        'temperature': 0.2,
        'max_output_tokens': 512,
    },
}

# Kie.ai — Image generation (Nano Banana Pro)
KIE_AI_API_KEY = config('KIE_AI_API_KEY', default='')
KIE_AI_BASE_URL = 'https://api.kie.ai'

# Remove.bg
REMOVEBG_API_KEY = config('REMOVEBG_API_KEY', default='')

# Static & Media
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Internationalization
LANGUAGE_CODE = 'ar'
TIME_ZONE = 'Asia/Riyadh'
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# SAP OData Integration
SAP_CONFIG = {
    'DEV': {
        'BASE_URL': 'https://fiori01.baytalebaa.com:8323',
        'CLIENT': '300',
    },
    'PRD': {
        'BASE_URL': 'https://fiori01.baytalebaa.com:8325',
        'CLIENT': '300',
    },
    'ACTIVE_ENV': config('SAP_ACTIVE_ENV', default='DEV'),
    'USERNAME': config('SAP_USERNAME', default=''),
    'PASSWORD': config('SAP_PASSWORD', default=''),
    'TIMEOUT': 60,
    'VERIFY_SSL': config('SAP_VERIFY_SSL', default=False, cast=bool),
    'PROXY_URL': config('SAP_PROXY_URL', default=''),
    'PROXY_SECRET': config('SAP_PROXY_SECRET', default=''),
}

# Image upload settings
MAX_IMAGE_SIZE_MB = 10
ALLOWED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp']
IMAGE_REQUIRED_SIZE = (2000, 2000)
