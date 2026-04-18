"""
Translate API — Bayt Alebaa PDC
Simple text translation endpoint backed by Gemini.
"""
import logging
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .gemini_service import call_gemini

logger = logging.getLogger(__name__)


_LANG_NAMES = {
    'ar': 'Arabic',
    'en': 'English',
    'fr': 'French',
}


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def translate_text(request):
    text = (request.data.get('text') or '').strip()
    src = (request.data.get('from') or 'ar').lower()
    dst = (request.data.get('to') or 'en').lower()

    if not text:
        return Response({'error': 'text is required'}, status=status.HTTP_400_BAD_REQUEST)
    if len(text) > 2000:
        return Response({'error': 'text too long (max 2000 chars)'},
                        status=status.HTTP_400_BAD_REQUEST)

    src_name = _LANG_NAMES.get(src, src)
    dst_name = _LANG_NAMES.get(dst, dst)

    prompt = (
        f"Translate the following building materials product name "
        f"from {src_name} to {dst_name}.\n"
        "Return ONLY the translated text, with no explanation, no quotes, "
        "no prefix, and no trailing punctuation that was not in the source.\n"
        "Keep technical terms, brand names, model numbers, sizes, and codes as-is.\n\n"
        f"Source text: {text}"
    )

    try:
        result = call_gemini(prompt, config_key='flash')
        translated = result if isinstance(result, str) else str(result)
        translated = translated.strip().strip('"').strip("'").strip()
        if not translated:
            return Response({'error': 'empty translation'},
                            status=status.HTTP_502_BAD_GATEWAY)
        return Response({'translated': translated})
    except Exception as exc:
        logger.exception('Translation failed: %s', exc)
        return Response({'error': f'Translation failed: {exc}'},
                        status=status.HTTP_502_BAD_GATEWAY)
