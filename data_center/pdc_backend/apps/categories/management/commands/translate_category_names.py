"""
Translate Arabic category names to English in batches.

Usage:
    python manage.py translate_category_names [--limit N] [--sleep SECONDS] [--dry-run]
"""
import re
import time
import logging
from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.categories.models import Category
from apps.integrations.translate_views import (
    translate_text_core, TranslateError, _GEMINI_CIRCUIT,
)

logger = logging.getLogger(__name__)

_ARABIC_RX = re.compile(r'[\u0600-\u06FF]')
_LATIN_RX = re.compile(r'[A-Za-z]')


def needs_english(cat: Category) -> bool:
    ar = (cat.name_ar or '').strip()
    en = (cat.name_en or '').strip()
    if not _ARABIC_RX.search(ar):
        return False
    if _LATIN_RX.search(en):
        return False
    return True


class Command(BaseCommand):
    help = 'Translate Arabic category names (name_ar) into English (name_en) using Gemini/OpenAI.'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=0,
                            help='Max number of categories to translate (0 = all).')
        parser.add_argument('--sleep', type=float, default=0.6,
                            help='Sleep seconds between calls to avoid rate limits.')
        parser.add_argument('--dry-run', action='store_true',
                            help='Show what would be translated without saving.')
        parser.add_argument('--verbose-progress', action='store_true',
                            help='Print every translation result.')
        parser.add_argument('--skip-gemini', action='store_true',
                            help='Skip Gemini entirely and use OpenAI only.')

    def handle(self, *args, **opts):
        limit = opts['limit']
        sleep_s = opts['sleep']
        dry = opts['dry_run']
        verbose = opts['verbose_progress']
        if opts['skip_gemini']:
            import time as _t
            _GEMINI_CIRCUIT['open_until'] = _t.time() + 24 * 3600
            self.stdout.write(self.style.WARNING(
                'Gemini disabled for this run; using OpenAI only.'
            ))

        qs = Category.objects.filter(
            Q(name_ar__regex=r'[\u0600-\u06FF]')
        ).exclude(
            name_en__regex=r'[A-Za-z]'
        ).order_by('id')

        total = qs.count()
        self.stdout.write(self.style.NOTICE(
            f'Found {total} categories needing English translation.'
        ))
        if dry:
            self.stdout.write(self.style.WARNING('DRY-RUN: no DB writes will occur.'))
        if limit:
            qs = qs[:limit]
            self.stdout.write(f'Processing first {limit} only.')

        ok = 0
        skipped = 0
        failed = 0
        consecutive_failures = 0

        for i, cat in enumerate(qs.iterator(), start=1):
            ar = (cat.name_ar or '').strip()
            if not needs_english(cat):
                skipped += 1
                continue

            try:
                translated, provider = translate_text_core(ar, 'ar', 'en')
            except TranslateError as exc:
                failed += 1
                consecutive_failures += 1
                self.stdout.write(self.style.ERROR(
                    f'[{i}/{total}] FAIL id={cat.id} "{ar}": {exc}'
                ))
                if consecutive_failures >= 5:
                    self.stdout.write(self.style.WARNING(
                        '5 consecutive failures — backing off 30s.'
                    ))
                    time.sleep(30)
                    consecutive_failures = 0
                else:
                    time.sleep(sleep_s * 2)
                continue
            except Exception as exc:
                failed += 1
                consecutive_failures += 1
                self.stdout.write(self.style.ERROR(
                    f'[{i}/{total}] EXCEPTION id={cat.id} "{ar}": {exc}'
                ))
                time.sleep(sleep_s * 2)
                continue

            consecutive_failures = 0
            translated = (translated or '').strip()
            if not translated:
                failed += 1
                self.stdout.write(self.style.WARNING(
                    f'[{i}/{total}] EMPTY id={cat.id} "{ar}"'
                ))
                time.sleep(sleep_s)
                continue

            if not dry:
                Category.objects.filter(pk=cat.pk).update(name_en=translated)

            ok += 1
            if verbose or ok % 25 == 0:
                self.stdout.write(
                    f'[{i}/{total}] OK id={cat.id} ({provider}) '
                    f'"{ar}" -> "{translated}"'
                )
            time.sleep(sleep_s)

        self.stdout.write(self.style.SUCCESS(
            f'Done. translated={ok}, skipped={skipped}, failed={failed}'
        ))
