import re
import logging
from datetime import datetime

import requests
from requests.auth import HTTPBasicAuth
from django.conf import settings

logger = logging.getLogger(__name__)


class SAPService:

    def __init__(self):
        env = settings.SAP_CONFIG['ACTIVE_ENV']
        self.base_url = settings.SAP_CONFIG[env]['BASE_URL']
        self.client = settings.SAP_CONFIG[env]['CLIENT']
        self.auth = HTTPBasicAuth(
            settings.SAP_CONFIG['USERNAME'],
            settings.SAP_CONFIG['PASSWORD'],
        )
        self.timeout = settings.SAP_CONFIG['TIMEOUT']
        self.verify_ssl = settings.SAP_CONFIG['VERIFY_SSL']

    def test_connection(self):
        url = f"{self.base_url}/sap/opu/odata/sap/Z_PDC_GET_HIERARCHY_SRV/EtHierarchySet"
        params = {
            'sap-client': self.client,
            '$top': 1,
            '$format': 'json',
        }
        import time
        start = time.time()
        try:
            resp = requests.get(
                url,
                params=params,
                auth=self.auth,
                timeout=self.timeout,
                verify=self.verify_ssl,
            )
            elapsed = round(time.time() - start, 2)
            resp.raise_for_status()
            data = resp.json()
            count = len(data.get('d', {}).get('results', []))
            return {
                'connected': True,
                'status_code': resp.status_code,
                'response_time': elapsed,
                'sample_count': count,
                'environment': settings.SAP_CONFIG['ACTIVE_ENV'],
                'base_url': self.base_url,
            }
        except requests.exceptions.ConnectionError as e:
            elapsed = round(time.time() - start, 2)
            logger.error("SAP connection error: %s", e)
            return {
                'connected': False,
                'error': 'فشل الاتصال بالسيرفر',
                'detail': str(e),
                'response_time': elapsed,
                'environment': settings.SAP_CONFIG['ACTIVE_ENV'],
                'base_url': self.base_url,
            }
        except requests.exceptions.Timeout:
            elapsed = round(time.time() - start, 2)
            return {
                'connected': False,
                'error': 'انتهت مهلة الاتصال',
                'response_time': elapsed,
                'environment': settings.SAP_CONFIG['ACTIVE_ENV'],
                'base_url': self.base_url,
            }
        except requests.exceptions.HTTPError as e:
            elapsed = round(time.time() - start, 2)
            return {
                'connected': False,
                'error': f'خطأ HTTP: {e.response.status_code}',
                'detail': e.response.text[:500] if e.response else str(e),
                'response_time': elapsed,
                'environment': settings.SAP_CONFIG['ACTIVE_ENV'],
                'base_url': self.base_url,
            }
        except Exception as e:
            elapsed = round(time.time() - start, 2)
            logger.exception("SAP unexpected error")
            return {
                'connected': False,
                'error': 'خطأ غير متوقع',
                'detail': str(e),
                'response_time': elapsed,
                'environment': settings.SAP_CONFIG['ACTIVE_ENV'],
                'base_url': self.base_url,
            }

    def get_hierarchy(self):
        url = f"{self.base_url}/sap/opu/odata/sap/Z_PDC_GET_HIERARCHY_SRV/EtHierarchySet"
        params = {
            'sap-client': self.client,
            '$expand': 'ToAttributes',
            '$format': 'json',
        }
        resp = requests.get(
            url,
            params=params,
            auth=self.auth,
            timeout=self.timeout,
            verify=self.verify_ssl,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get('d', {}).get('results', [])

        cleaned = []
        for item in results:
            attrs_raw = item.get('ToAttributes', {}).get('results', [])
            attrs = [
                {'name': a.get('CharName', ''), 'value': a.get('CharValue', '')}
                for a in attrs_raw if a.get('CharValue')
            ]
            cleaned.append({
                'parent_code': item.get('ParentCode', ''),
                'code': item.get('MaterialGroupCode', ''),
                'name_ar': item.get('MaterialGroupNameAr', ''),
                'name_en': item.get('MaterialGroupNameEn', ''),
                'level': item.get('Level', 0),
                'created_date': self._parse_sap_date(item.get('CreatedDate')),
                'attributes': attrs,
            })

        return cleaned

    @staticmethod
    def _parse_sap_date(sap_date):
        if not sap_date:
            return None
        try:
            match = re.search(r'/Date\((\d+)\)/', str(sap_date))
            if match:
                ts = int(match.group(1)) / 1000
                return datetime.fromtimestamp(ts).isoformat()
        except Exception:
            pass
        return None
