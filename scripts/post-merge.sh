#!/bin/bash
# Post-merge setup for the PDC monorepo (Django backend + Vite/React frontend).
#
# Runs automatically after a task is merged into the main branch. Stdin is
# closed by the runner, so every command must be non-interactive.
#
# Idempotent: safe to run multiple times — pip / npm install / migrate are
# all no-ops when nothing changed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/data_center/pdc_backend"
FRONTEND_DIR="$REPO_ROOT/data_center/pdc_frontend"

echo "── post-merge: backend Python deps ──"
if [ -f "$BACKEND_DIR/requirements.txt" ]; then
    # Replit's Nix Python is externally managed, so we install into the
    # workspace-local .pythonlibs directory that the workflows already
    # have on PYTHONPATH. uv is preinstalled in the Nix env and is much
    # faster than pip.
    PY_TARGET="$REPO_ROOT/.pythonlibs/lib/python3.11/site-packages"
    mkdir -p "$PY_TARGET"
    uv pip install --quiet --target "$PY_TARGET" -r "$BACKEND_DIR/requirements.txt"
fi

echo "── post-merge: backend Django migrations ──"
if [ -f "$BACKEND_DIR/manage.py" ]; then
    cd "$BACKEND_DIR"
    DJANGO_SETTINGS_MODULE=pdc_backend.settings.development \
        python manage.py migrate --noinput
    cd "$REPO_ROOT"
fi

echo "── post-merge: frontend npm deps ──"
if [ -f "$FRONTEND_DIR/package.json" ]; then
    cd "$FRONTEND_DIR"
    # Use ci when a lockfile is present for a fast, deterministic install;
    # fall back to install otherwise.
    if [ -f "package-lock.json" ]; then
        npm ci --no-audit --no-fund --prefer-offline
    else
        npm install --no-audit --no-fund
    fi
    cd "$REPO_ROOT"
fi

echo "── post-merge: done ──"
