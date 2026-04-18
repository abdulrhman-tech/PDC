import re
import time
import socket
import logging
from datetime import datetime

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)


class SAPService:

    def __init__(self):
        env = settings.SAP_CONFIG['ACTIVE_ENV']
        self.base_url = settings.SAP_CONFIG[env]['BASE_URL']
        self.client = settings.SAP_CONFIG[env]['CLIENT']
        self.username = settings.SAP_CONFIG['USERNAME']
        self.password = settings.SAP_CONFIG['PASSWORD']
        self.timeout = settings.SAP_CONFIG['TIMEOUT']
        self.verify_ssl = settings.SAP_CONFIG['VERIFY_SSL']
        proxy_url = settings.SAP_CONFIG.get('PROXY_URL', '')
        self.proxy_base = proxy_url.rstrip('/') if proxy_url else ''
        self.proxy_secret = settings.SAP_CONFIG.get('PROXY_SECRET', '')
        self.env_param = 'dev' if env == 'DEV' else 'prd'

    def _build_url(self, path):
        if self.proxy_base:
            return f"{self.proxy_base}{path}"
        return f"{self.base_url}{path}"

    def _build_params(self, params):
        if self.proxy_base:
            params['env'] = self.env_param
        return params

    def _get_client(self):
        headers = {}
        if self.proxy_base and self.proxy_secret:
            headers['X-Proxy-Secret'] = self.proxy_secret
        return httpx.Client(
            auth=(self.username, self.password),
            verify=self.verify_ssl,
            timeout=self.timeout,
            follow_redirects=True,
            headers=headers,
        )

    def _request_with_retry(self, client, url, params, max_retries=3):
        last_error = None
        for attempt in range(max_retries):
            try:
                resp = client.get(url, params=params)
                if resp.status_code in (520, 521, 522, 523, 524, 525, 526, 527):
                    last_error = f'Cloudflare error {resp.status_code} (attempt {attempt + 1}/{max_retries})'
                    logger.warning(last_error)
                    if attempt < max_retries - 1:
                        time.sleep(2 ** attempt)
                        continue
                return resp
            except (httpx.TimeoutException, httpx.ConnectError) as e:
                last_error = f'{type(e).__name__}: {e} (attempt {attempt + 1}/{max_retries})'
                logger.warning(last_error)
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise
        return resp

    def test_connection(self):
        url = self._build_url('/sap/opu/odata/sap/Z_PDC_GET_HIERARCHY_SRV/EtHierarchySet')
        params = self._build_params({
            'sap-client': self.client,
            '$top': 1,
            '$format': 'json',
        })
        start = time.time()
        try:
            with self._get_client() as client:
                resp = self._request_with_retry(client, url, params)
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
                'base_url': self.proxy_base or self.base_url,
                'mode': 'proxy' if self.proxy_base else 'direct',
            }
        except httpx.ConnectError as e:
            elapsed = round(time.time() - start, 2)
            logger.error("SAP connection error: %s", e)
            return {
                'connected': False,
                'error': 'فشل الاتصال بالسيرفر',
                'detail': str(e),
                'response_time': elapsed,
                'environment': settings.SAP_CONFIG['ACTIVE_ENV'],
                'base_url': self.proxy_base or self.base_url,
                'mode': 'proxy' if self.proxy_base else 'direct',
            }
        except httpx.TimeoutException:
            elapsed = round(time.time() - start, 2)
            return {
                'connected': False,
                'error': 'انتهت مهلة الاتصال',
                'response_time': elapsed,
                'environment': settings.SAP_CONFIG['ACTIVE_ENV'],
                'base_url': self.proxy_base or self.base_url,
                'mode': 'proxy' if self.proxy_base else 'direct',
            }
        except httpx.HTTPStatusError as e:
            elapsed = round(time.time() - start, 2)
            return {
                'connected': False,
                'error': f'خطأ HTTP: {e.response.status_code}',
                'detail': e.response.text[:500],
                'response_time': elapsed,
                'environment': settings.SAP_CONFIG['ACTIVE_ENV'],
                'base_url': self.proxy_base or self.base_url,
                'mode': 'proxy' if self.proxy_base else 'direct',
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
                'base_url': self.proxy_base or self.base_url,
                'mode': 'proxy' if self.proxy_base else 'direct',
            }

    def get_hierarchy(self):
        url = self._build_url('/sap/opu/odata/sap/Z_PDC_GET_HIERARCHY_SRV/EtHierarchySet')
        params = self._build_params({
            'sap-client': self.client,
            '$expand': 'ToAttributes',
            '$format': 'json',
        })
        with self._get_client() as client:
            resp = self._request_with_retry(client, url, params)
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

    def _clean_product(self, item):
        attrs_raw = item.get('ToAttributes', {}).get('results', []) if isinstance(item.get('ToAttributes'), dict) else []
        attributes = [
            {'name': a.get('CharName', ''), 'value': a.get('CharValue', '')}
            for a in attrs_raw
        ]

        hierarchy_raw = item.get('ToHierarcy', {}).get('results', []) if isinstance(item.get('ToHierarcy'), dict) else []
        hierarchy = [
            {
                'code': h.get('MaterialGroupCode', ''),
                'parent_code': h.get('ParentCode', ''),
                'name_ar': h.get('MaterialGroupNameAr', ''),
                'name_en': h.get('MaterialGroupNameEn', ''),
                'level': h.get('Level', 0),
            }
            for h in hierarchy_raw
        ]

        return {
            'material_number': item.get('MaterialNumber', ''),
            'description_ar': item.get('DescriptionAr', ''),
            'description_en': item.get('DescriptionEn', ''),
            'material_group_code': item.get('MaterialGroupCode', ''),
            'origin_country': item.get('OriginCountry', ''),
            'unit_of_measure': item.get('UnitOfMeasure', ''),
            'is_active': bool(item.get('IsActive', False)),
            'created_date': self._parse_sap_date(item.get('CreatedDate')),
            'changed_date': self._parse_sap_date(item.get('ChangedDate')),
            'attributes': attributes,
            'hierarchy': hierarchy,
        }

    def get_product(self, material_number):
        url = self._build_url(f"/sap/opu/odata/sap/Z_PDC_INTEGRATION_SRV_SRV/ProductSet('{material_number}')")
        params = self._build_params({
            'sap-client': self.client,
            '$expand': 'ToAttributes,ToHierarcy/AttrHierarcy',
            '$format': 'json',
        })
        with self._get_client() as client:
            resp = self._request_with_retry(client, url, params)
        resp.raise_for_status()
        data = resp.json().get('d', {}) or {}
        return self._clean_product(data)

    def get_products_by_date(self, date_from, date_to):
        url = self._build_url('/sap/opu/odata/sap/Z_PDC_INTEGRATION_SRV_SRV/ProductSet')
        params = self._build_params({
            'sap-client': self.client,
            '$filter': f"CreatedDate ge datetime'{date_from}T00:00:00' and CreatedDate le datetime'{date_to}T23:59:59'",
            '$expand': 'ToAttributes,ToHierarcy/AttrHierarcy',
            '$format': 'json',
        })
        long_timeout_client = httpx.Client(
            auth=(self.username, self.password),
            verify=self.verify_ssl,
            timeout=120,
            follow_redirects=True,
            headers={'X-Proxy-Secret': self.proxy_secret} if (self.proxy_base and self.proxy_secret) else {},
        )
        try:
            resp = self._request_with_retry(long_timeout_client, url, params)
        finally:
            long_timeout_client.close()
        resp.raise_for_status()
        results = resp.json().get('d', {}).get('results', []) or []
        return [self._clean_product(item) for item in results]

    @staticmethod
    def diagnose_connection():
        cfg = settings.SAP_CONFIG
        env = cfg['ACTIVE_ENV']
        from urllib.parse import urlparse
        parsed = urlparse(cfg[env]['BASE_URL'])
        host = parsed.hostname
        port = parsed.port or 443
        proxy_url = cfg.get('PROXY_URL', '')
        using_proxy = bool(proxy_url)

        results = {
            'environment': env,
            'host': host,
            'port': port,
            'has_credentials': bool(cfg['USERNAME'] and cfg['PASSWORD']),
            'has_proxy': using_proxy,
            'mode': 'proxy' if using_proxy else 'direct',
        }

        if using_proxy:
            proxy_parsed = urlparse(proxy_url)
            proxy_host = proxy_parsed.hostname
            proxy_port = proxy_parsed.port or 443
            results['proxy_url'] = proxy_url
            results['proxy_host'] = proxy_host
            results['proxy_port'] = proxy_port

            start = time.time()
            try:
                sock = socket.create_connection((proxy_host, proxy_port), timeout=10)
                sock.close()
                results['proxy_tcp'] = {'status': 'ok', 'time': round(time.time() - start, 3)}
            except (socket.timeout, ConnectionRefusedError, OSError) as e:
                results['proxy_tcp'] = {'status': 'fail', 'error': str(e), 'time': round(time.time() - start, 3)}

            env_param = 'dev' if env == 'DEV' else 'prd'
            test_url = f"{proxy_url.rstrip('/')}/sap/opu/odata/sap/Z_PDC_GET_HIERARCHY_SRV/$metadata"
            proxy_secret = cfg.get('PROXY_SECRET', '')
            proxy_headers = {}
            if proxy_secret:
                proxy_headers['X-Proxy-Secret'] = proxy_secret
            start = time.time()
            try:
                with httpx.Client(
                    auth=(cfg['USERNAME'], cfg['PASSWORD']),
                    verify=cfg['VERIFY_SSL'],
                    timeout=15,
                    headers=proxy_headers,
                ) as client:
                    resp = client.get(test_url, params={'sap-client': cfg[env]['CLIENT'], 'env': env_param})
                results['proxy_sap'] = {
                    'status': 'ok',
                    'http_status': resp.status_code,
                    'time': round(time.time() - start, 3),
                }
            except Exception as e:
                results['proxy_sap'] = {
                    'status': 'fail',
                    'error': str(e)[:300],
                    'time': round(time.time() - start, 3),
                }
        else:
            start = time.time()
            try:
                ip = socket.gethostbyname(host)
                results['dns'] = {'status': 'ok', 'ip': ip, 'time': round(time.time() - start, 3)}
            except socket.gaierror as e:
                results['dns'] = {'status': 'fail', 'error': str(e), 'time': round(time.time() - start, 3)}
                return results

            start = time.time()
            try:
                sock = socket.create_connection((host, port), timeout=10)
                sock.close()
                results['tcp'] = {'status': 'ok', 'time': round(time.time() - start, 3)}
            except (socket.timeout, ConnectionRefusedError, OSError) as e:
                results['tcp'] = {'status': 'fail', 'error': str(e), 'time': round(time.time() - start, 3)}

            start = time.time()
            test_url = f"https://{host}:{port}/sap/opu/odata/sap/Z_PDC_GET_HIERARCHY_SRV/$metadata"
            try:
                with httpx.Client(
                    auth=(cfg['USERNAME'], cfg['PASSWORD']),
                    verify=cfg['VERIFY_SSL'],
                    timeout=15,
                ) as client:
                    resp = client.get(test_url, params={'sap-client': cfg[env]['CLIENT']})
                results['https'] = {
                    'status': 'ok',
                    'http_status': resp.status_code,
                    'time': round(time.time() - start, 3),
                }
            except Exception as e:
                results['https'] = {
                    'status': 'fail',
                    'error': str(e)[:300],
                    'time': round(time.time() - start, 3),
                }

        return results

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
