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
from .openai_service import call_openai

logger = logging.getLogger(__name__)


def _openai_translate(text: str, src_name: str, dst_name: str) -> str:
    system = (
        "You are a professional translator for building materials product names. "
        "Return ONLY the translated text — no quotes, no explanation, no prefix. "
        "Keep brand names, model numbers, sizes, codes, and technical terms as-is."
    )
    prompt = f"Translate from {src_name} to {dst_name}:\n{text}"
    out = call_openai(prompt, system=system, temperature=0.2, max_tokens=200)
    return (out or '').strip().strip('"').strip("'").strip()


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

    gemini_error = None
    try:
        result = call_gemini(prompt, config_key='flash')
        translated = result if isinstance(result, str) else str(result)
        translated = translated.strip().strip('"').strip("'").strip()
        if translated:
            return Response({'translated': translated, 'provider': 'gemini'})
    except Exception as exc:
        gemini_error = exc
        logger.warning('Gemini translation failed, will try OpenAI: %s',
                       str(exc)[:200])

    try:
        translated = _openai_translate(text, src_name, dst_name)
        if translated:
            return Response({'translated': translated, 'provider': 'openai'})
        return Response({'error': 'تعذّر استخراج الترجمة'},
                        status=status.HTTP_502_BAD_GATEWAY)
    except Exception as exc:
        logger.exception('OpenAI translation also failed')
        msg = str(gemini_error or exc)
        low = msg.lower()
        if '429' in msg or 'quota' in low or 'rate' in low or 'exceeded' in low:
            friendly = 'تجاوز الحد المسموح من خدمتي الترجمة حالياً. حاول بعد دقيقة.'
        elif '401' in msg or '403' in msg or 'permission' in low or 'api key' in low:
            friendly = 'مفاتيح خدمات الترجمة غير صالحة.'
        elif 'timeout' in low or 'timed out' in low:
            friendly = 'انتهت مهلة الاتصال بخدمة الترجمة. حاول مرة ثانية.'
        else:
            friendly = 'فشلت الترجمة. حاول مرة ثانية.'
        return Response({'error': friendly},
                        status=status.HTTP_502_BAD_GATEWAY)
