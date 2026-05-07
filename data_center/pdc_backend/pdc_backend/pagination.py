"""Project-wide DRF pagination class.

Subclasses PageNumberPagination to honor a `page_size` query parameter
(DRF's default ignores it). A `max_page_size` cap protects against
abuse / accidental enormous requests.

Use cases:
- Dropdowns / pickers across the admin app want larger pages on demand
  without forcing every consumer to paginate.
- Catalog generator now uses server-side search + pagination (40/page),
  so the old 5000-cap is no longer needed.
"""
from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 24                    # Default page size
    page_size_query_param = 'page_size'
    max_page_size = 200               # Hard cap — lowered from 5000 (catalog gen now paginated)
