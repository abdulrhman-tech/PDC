"""
Custom DRF throttle classes — Bayt Alebaa PDC.
All throttle state is stored in Django's cache backend (Redis in production,
LocMemCache in dev). No extra packages needed.
"""
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    """
    Protect the login endpoint: max 10 attempts per minute per IP.
    Applied only to LoginView (AllowAny), so authenticated users are exempt.
    """
    scope = 'login'


class AIGenerationThrottle(UserRateThrottle):
    """
    Kie.ai image generation burns paid credits.
    Limit per-user to 60 requests/hour (single + multi + dual + enhance combined).
    """
    scope = 'ai_generation'


class TranslateThrottle(UserRateThrottle):
    """
    Translation calls OpenAI (paid) or Gemini (quota).
    Limit per-user to 500 requests/hour — generous but prevents runaway bulk loops.
    """
    scope = 'translate'
