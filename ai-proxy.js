// Cloudflare Worker: AI proxy, so the Anthropic API key stays on the server.
// Use it when you share the app with other people. Settings (Workers > your worker > Settings > Variables):
//   ANTHROPIC_API_KEY  (secret)  your key from console.anthropic.com
//   APP_TOKEN          (secret)  any long random text; people enter it in the app as "Proxy token"
//   ALLOWED_ORIGIN     (text)    your app address, e.g. https://yourname.github.io
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-app-token',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/v1/messages') return new Response('Not found', { status: 404, headers: cors });
    if (env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) return new Response('Forbidden origin', { status: 403, headers: cors });
    if (env.APP_TOKEN && request.headers.get('x-app-token') !== env.APP_TOKEN) return new Response('Bad token', { status: 401, headers: cors });
    const body = await request.text();
    if (body.length > 8_000_000) return new Response('Too large', { status: 413, headers: cors });
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body
    });
    return new Response(res.body, { status: res.status, headers: { ...cors, 'content-type': 'application/json' } });
  }
};
