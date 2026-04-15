/**
 * Cloudflare Worker — SAP OData Reverse Proxy
 *
 * Deploy on Cloudflare Workers (free tier: 100k req/day).
 *
 * SETUP:
 * 1. Create a Worker at https://workers.cloudflare.com
 * 2. Paste this code
 * 3. Add environment variable SAP_PROXY_SECRET in Worker settings
 * 4. Set the same value as SAP_PROXY_SECRET env var on your backend
 * 5. Set SAP_PROXY_URL=https://your-worker.workers.dev on your backend
 *
 * ALLOWED_ORIGINS: Restrict to your backend domains below.
 */

const ALLOWED_ORIGINS = [
  'https://baytalebaa-pdc.onrender.com',
  'https://pdc.baytalebaa.com',
];

const ALLOWED_SAP_PATHS = [
  '/sap/opu/odata/sap/Z_PDC_GET_HIERARCHY_SRV/',
  '/sap/opu/odata/sap/Z_PDC_INTEGRATION_SRV_SRV/',
];

function isOriginAllowed(origin) {
  if (!origin) return true;
  return ALLOWED_ORIGINS.some(o => origin.startsWith(o));
}

function isPathAllowed(pathname) {
  return ALLOWED_SAP_PATHS.some(p => pathname.startsWith(p));
}

function corsHeaders(origin) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Proxy-Secret',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const proxySecret = env.SAP_PROXY_SECRET || '';
    if (proxySecret) {
      const clientSecret = request.headers.get('X-Proxy-Secret') || '';
      if (clientSecret !== proxySecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
      }
    }

    if (!url.pathname.startsWith('/sap/')) {
      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!isPathAllowed(url.pathname)) {
      return new Response(JSON.stringify({ error: 'Forbidden path' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    if (!['GET', 'POST', 'HEAD'].includes(request.method)) {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const sapEnv = url.searchParams.get('env') || 'dev';
    const targetPort = sapEnv === 'prd' ? '8325' : '8323';

    url.searchParams.delete('env');

    const queryString = url.searchParams.toString();
    const targetUrl = `https://fiori01.baytalebaa.com:${targetPort}${url.pathname}${queryString ? '?' + queryString : ''}`;

    const modifiedHeaders = new Headers(request.headers);
    modifiedHeaders.set('Host', `fiori01.baytalebaa.com:${targetPort}`);
    modifiedHeaders.delete('X-Proxy-Secret');
    modifiedHeaders.delete('cf-connecting-ip');
    modifiedHeaders.delete('cf-ray');
    modifiedHeaders.delete('cf-visitor');
    modifiedHeaders.delete('cf-ipcountry');

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: modifiedHeaders,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      });

      const modifiedResponse = new Response(response.body, response);
      for (const [k, v] of Object.entries(corsHeaders(origin))) {
        modifiedResponse.headers.set(k, v);
      }

      return modifiedResponse;
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Proxy Error', message: error.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }
  },
};
