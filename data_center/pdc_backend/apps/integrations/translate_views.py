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


_GEMINI_CIRCUIT = {'failures': 0, 'open_until': 0.0}
_GEMINI_THRESHOLD = 3
_GEMINI_COOLDOWN_S = 600.0


def _gemini_is_open() -> bool:
    import time as _t
    return _t.time() < _GEMINI_CIRCUIT['open_until']


def _gemini_record_failure(exc: Exception) -> None:
    import time as _t
    msg = str(exc).lower()
    if '429' in msg or 'quota' in msg or 'exceeded' in msg or 'rate' in msg:
        _GEMINI_CIRCUIT['failures'] += 1
        if _GEMINI_CIRCUIT['failures'] >= _GEMINI_THRESHOLD:
            _GEMINI_CIRCUIT['open_until'] = _t.time() + _GEMINI_COOLDOWN_S
            logger.warning(
                'Gemini circuit OPEN for %ss after %s consecutive quota errors',
                int(_GEMINI_COOLDOWN_S), _GEMINI_CIRCUIT['failures']
            )


def _gemini_record_success() -> None:
    _GEMINI_CIRCUIT['failures'] = 0
    _GEMINI_CIRCUIT['open_until'] = 0.0


class TranslateError(Exception):
    """Raised when both Gemini and OpenAI translation attempts fail."""
    def __init__(self, message: str, friendly: str):
        super().__init__(message)
        self.friendly = friendly


def translate_text_core(text: str, src: str, dst: str) -> tuple[str, str]:
    """
    Core translation: tries Gemini first, falls back to OpenAI.
    Returns (translated_text, provider_name). Raises TranslateError on failure.
    Reusable from other apps that need bulk translation.
    """
    src = (src or 'ar').lower()
    dst = (dst or 'en').lower()
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
    if not _gemini_is_open():
        try:
            result = call_gemini(prompt, config_key='flash')
            translated = result if isinstance(result, str) else str(result)
            translated = translated.strip().strip('"').strip("'").strip()
            if translated:
                _gemini_record_success()
                return translated, 'gemini'
        except Exception as exc:
            gemini_error = exc
            _gemini_record_failure(exc)
            logger.warning('Gemini translation failed, will try OpenAI: %s',
                           str(exc)[:200])

    try:
        translated = _openai_translate(text, src_name, dst_name)
        if translated:
            return translated, 'openai'
        raise TranslateError('empty translation', 'تعذّر استخراج الترجمة')
    except TranslateError:
        raise
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
        raise TranslateError(msg, friendly) from exc


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

    try:
        translated, provider = translate_text_core(text, src, dst)
        return Response({'translated': translated, 'provider': provider})
    except TranslateError as exc:
        return Response({'error': exc.friendly},
                        status=status.HTTP_502_BAD_GATEWAY)
