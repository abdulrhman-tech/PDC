"""
API Key Health Check — Bayt Alebaa PDC
Public endpoint (keys are masked). Tests OpenAI, Kie.ai, Gemini, Remove.bg.
"""
import logging
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

logger = logging.getLogger(__name__)


def _mask(key: str) -> str:
    if not key:
        return '—'
    return key[:8] + '...' + key[-4:]


def _test_openai_text() -> dict:
    try:
        from openai import OpenAI
        key = settings.OPENAI_API_KEY
        if not key:
            return {'status': 'error', 'message': 'المفتاح غير مضبوط (OPENAI_API_KEY فارغ)', 'key_preview': '—'}
        client = OpenAI(api_key=key)
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': 'Say OK'}],
            max_tokens=5,
        )
        return {'status': 'ok', 'message': 'OpenAI نص يعمل ✓', 'key_preview': _mask(key)}
    except Exception as e:
        msg = str(e)
        if '401' in msg or 'Incorrect API key' in msg or 'invalid_api_key' in msg:
            reason = 'المفتاح غير صالح أو منتهي'
        elif '429' in msg or 'quota' in msg.lower() or 'exceeded' in msg.lower():
            reason = 'تجاوز الحصة (Quota exceeded)'
        elif 'insufficient_quota' in msg:
            reason = 'الرصيد منتهي في OpenAI'
        else:
            reason = msg[:150]
        return {'status': 'error', 'message': reason, 'key_preview': _mask(getattr(settings, 'OPENAI_API_KEY', ''))}


_TINY_PNG_B64 = (
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'
    'YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
)


def _test_openai_vision() -> dict:
    try:
        from openai import OpenAI
        key = settings.OPENAI_API_KEY
        if not key:
            return {'status': 'error', 'message': 'المفتاح غير مضبوط', 'key_preview': '—'}
        client = OpenAI(api_key=key)
        resp = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[{
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': 'Reply with one word: OK'},
                    {'type': 'image_url', 'image_url': {
                        'url': f'data:image/png;base64,{_TINY_PNG_B64}',
                        'detail': 'low',
                    }},
                ],
            }],
            max_tokens=5,
        )
        return {'status': 'ok', 'message': 'OpenAI Vision يعمل ✓', 'key_preview': _mask(key)}
    except Exception as e:
        msg = str(e)
        if '401' in msg or 'Incorrect API key' in msg or 'invalid_api_key' in msg:
            reason = 'المفتاح غير صالح أو منتهي'
        elif '429' in msg or 'quota' in msg.lower() or 'exceeded' in msg.lower():
            reason = 'تجاوز الحصة (Quota exceeded)'
        elif 'insufficient_quota' in msg:
            reason = 'الرصيد منتهي في OpenAI'
        else:
            reason = msg[:150]
        return {'status': 'error', 'message': reason, 'key_preview': _mask(getattr(settings, 'OPENAI_API_KEY', ''))}


def _test_kie_ai() -> dict:
    try:
        import requests
        key = getattr(settings, 'KIE_AI_API_KEY', '')
        if not key:
            return {'status': 'error', 'message': 'KIE_AI_API_KEY غير مضبوط', 'key_preview': '—'}
        resp = requests.post(
            f'{settings.KIE_AI_BASE_URL}/api/v1/jobs/createTask',
            headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
            json={'model': 'nano-banana-pro', 'input': {'prompt': '__health_check__', 'image_input': [], 'aspect_ratio': '1:1', 'resolution': '1K', 'output_format': 'png'}},
            timeout=10,
        )
        if resp.status_code in (401, 403):
            return {'status': 'error', 'message': 'مفتاح Kie.ai غير صالح أو منتهي', 'key_preview': _mask(key)}
        if resp.status_code == 200:
            data = resp.json()
            if data.get('code') == 200:
                return {'status': 'ok', 'message': 'Kie.ai يعمل ✓ (مفتاح صالح)', 'key_preview': _mask(key)}
        return {'status': 'ok', 'message': f'Kie.ai مفتاح صالح (رد: {resp.status_code})', 'key_preview': _mask(key)}
    except Exception as e:
        return {'status': 'error', 'message': str(e)[:150], 'key_preview': _mask(getattr(settings, 'KIE_AI_API_KEY', ''))}


def _test_gemini() -> dict:
    key = getattr(settings, 'GEMINI_API_KEY', '')
    if not key:
        return {'status': 'not_configured', 'message': 'GEMINI_API_KEY غير مضبوط (اختياري — الترجمة تستخدم OpenAI بدله)', 'key_preview': '—'}
    try:
        import google.generativeai as genai
        genai.configure(api_key=key)
        model = genai.GenerativeModel('gemini-2.0-flash-lite')
        resp = model.generate_content('Say OK', generation_config={'max_output_tokens': 5})
        return {'status': 'ok', 'message': 'Gemini يعمل ✓', 'key_preview': _mask(key)}
    except Exception as e:
        msg = str(e)
        if '401' in msg or '403' in msg or 'API_KEY' in msg:
            reason = 'مفتاح Gemini غير صالح'
        elif '429' in msg or 'quota' in msg.lower():
            reason = 'تجاوز حصة Gemini'
        else:
            reason = msg[:150]
        return {'status': 'error', 'message': reason, 'key_preview': _mask(key)}


def _test_removebg() -> dict:
    key = getattr(settings, 'REMOVEBG_API_KEY', '')
    if not key:
        return {'status': 'not_configured', 'message': 'REMOVEBG_API_KEY غير مضبوط (لازم لإزالة الخلفية)', 'key_preview': '—'}
    try:
        import requests
        resp = requests.get(
            'https://api.remove.bg/v1.0/account',
            headers={'X-Api-Key': key},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            credits = data.get('data', {}).get('credits', {}).get('total', '?')
            return {'status': 'ok', 'message': f'Remove.bg يعمل ✓ — الرصيد: {credits}', 'key_preview': _mask(key)}
        elif resp.status_code in (401, 403):
            return {'status': 'error', 'message': 'مفتاح Remove.bg غير صالح', 'key_preview': _mask(key)}
        else:
            return {'status': 'error', 'message': f'Remove.bg رد: {resp.status_code}', 'key_preview': _mask(key)}
    except Exception as e:
        return {'status': 'error', 'message': str(e)[:150], 'key_preview': _mask(key)}


@api_view(['GET'])
@permission_classes([AllowAny])
def api_health_check(request):
    """
    GET /api/v1/sap/health/
    Tests all AI/external API keys and returns their status.
    Public (keys are masked — only first 8 + last 4 chars shown).
    """
    results = {
        'openai_text': _test_openai_text(),
        'openai_vision': _test_openai_vision(),
        'kie_ai': _test_kie_ai(),
        'gemini': _test_gemini(),
        'removebg': _test_removebg(),
    }

    all_critical_ok = all(
        results[k]['status'] == 'ok'
        for k in ('openai_text', 'openai_vision', 'kie_ai')
    )

    return Response({
        'overall': 'ok' if all_critical_ok else 'degraded',
        'services': results,
    })
