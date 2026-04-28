"""Project-wide DRF exception handler.

Adds friendly Arabic JSON responses for low-level Django exceptions that
otherwise would surface as bare 400/500 responses with no useful body.
"""
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    """Wrap DRF's default handler with friendly Arabic messages for a few
    Django-level exceptions that the default handler doesn't translate.

    Currently handled in addition to DRF defaults:
    - django.core.exceptions.TooManyFilesSent → 413 with Arabic message
      explaining the per-request file cap. This is raised during multipart
      parsing (before any view runs) when a POST contains more files than
      DATA_UPLOAD_MAX_NUMBER_FILES.
    """
    # Lazy import: TooManyFilesSent only exists in Django 4.1+
    try:
        from django.core.exceptions import TooManyFilesSent
    except ImportError:  # pragma: no cover - older Django
        TooManyFilesSent = None

    if TooManyFilesSent is not None and isinstance(exc, TooManyFilesSent):
        return Response(
            {
                'error': (
                    'عدد الملفات في الطلب الواحد تجاوز الحد المسموح. '
                    'يُرجى رفع الصور على دفعات أصغر.'
                ),
                'code': 'too_many_files',
            },
            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )

    # Fall through to DRF's default for everything else
    return drf_exception_handler(exc, context)
