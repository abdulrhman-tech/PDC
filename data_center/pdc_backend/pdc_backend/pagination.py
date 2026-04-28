"""Project-wide DRF pagination class.

Subclasses PageNumberPagination to honor a `page_size` query parameter
(DRF's default ignores it). A `max_page_size` cap protects against
abuse / accidental enormous requests.

Use cases:
- Catalog generator needs all products (~1.6k) in one go to populate
  the selection list. Without this class the API silently returns the
  default PAGE_SIZE (24) regardless of `?page_size=2000`.
- Dropdowns / pickers across the admin app want larger pages on demand
  without forcing every consumer to paginate.
"""
from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 24                    # Default page size (matches old behavior)
    page_size_query_param = 'page_size'
    max_page_size = 5000              # Hard cap; 5k covers full product catalog
