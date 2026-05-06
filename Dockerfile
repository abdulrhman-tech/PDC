# ============================================================
# Bayt Alebaa PDC — Production Dockerfile (multi-stage)
# Stage 1: Build React frontend
# Stage 2: Python runtime with Django backend + built frontend
# ============================================================

# ---------- Stage 1: Frontend build ----------
FROM node:20-slim AS frontend-builder

WORKDIR /frontend
COPY data_center/pdc_frontend/package.json data_center/pdc_frontend/package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY data_center/pdc_frontend/ ./
RUN npm run build

# ---------- Stage 2: Python runtime ----------
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=pdc_backend.settings.production

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev gcc libffi-dev libssl-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY data_center/pdc_backend/requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

# Backend source
COPY data_center/pdc_backend/ /app/

# Built frontend → expected location for Django to serve
COPY --from=frontend-builder /frontend/dist /app/staticfiles_frontend

# Collect Django static
RUN python manage.py collectstatic --noinput || true

EXPOSE 8000

CMD sh -c "python manage.py migrate --noinput && gunicorn pdc_backend.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 2 --timeout 120 --access-logfile - --error-logfile -"
