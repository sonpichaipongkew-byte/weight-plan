// Cloudflare Worker: one small helper for the app. It keeps secrets on the server and lets the browser reach APIs
// that do not allow calls from web pages (CORS).
//   POST /v1/messages     -> Anthropic Claude (AI), only if ANTHROPIC_API_KEY is set
//   POST /garmin/token    -> Garmin Connect Personal API: swaps your Personal API key for a 24-hour access token
//   GET  /garmin/api/...  -> personal.connectapi.garmin.com (read-only)
//   GET  /strava/client   -> tells the app your Strava Client ID (public)
//   POST /strava/token    -> Strava OAuth code exchange / refresh (the Client Secret stays here)
//   GET  /strava/api/...  -> www.strava.com/api/v3 (read-only)
// Settings (Workers > your worker > Settings > Variables and Secrets):
//   APP_TOKEN             (secret)  any long random text; enter it in the app as "Proxy token"
//   ALLOWED_ORIGIN        (text)    your app address, e.g. https://yourname.github.io
//   ANTHROPIC_API_KEY     (secret)  only for AI through this Worker
//   STRAVA_CLIENT_ID      (text)    only for Strava, from strava.com/settings/api
//   STRAVA_CLIENT_SECRET  (secret)  only for Strava
// Garmin needs no setting here: each person's Garmin key is sent by their own app and never stored.
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-app-token, authorization, x-garmin-key',
      'Access-Control-Expose-Headers': 'x-helper-error',
      'Vary': 'Origin'
    };
    const own = (msg, status) => new Response(msg, { status, headers: { ...cors, 'x-helper-error': '1', 'content-type': 'text/plain; charset=utf-8' } });
    const pass = (res, type) => new Response(res.body, { status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || type || 'application/json' } });
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) return own('Forbidden origin', 403);
    if (env.APP_TOKEN && request.headers.get('x-app-token') !== env.APP_TOKEN) return own('Bad token', 401);
    const url = new URL(request.url), p = url.pathname;

    if (request.method === 'POST' && p === '/v1/messages') {
      if (!env.ANTHROPIC_API_KEY) return own('ANTHROPIC_API_KEY is not set in the Worker', 501);
      const body = await request.text();
      if (body.length > 8_000_000) return own('Too large', 413);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body
      });
      return pass(res);
    }

    if (request.method === 'POST' && p === '/garmin/token') {
      const key = request.headers.get('x-garmin-key') || '';
      if (!key) return own('Missing Garmin key', 400);
      const res = await fetch('https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token', {
        method: 'POST', headers: { Authorization: 'ApiKey ' + key }
      });
      return pass(res, 'text/plain');
    }
    if (request.method === 'GET' && p.startsWith('/garmin/api/')) {
      const res = await fetch('https://personal.connectapi.garmin.com/' + p.slice('/garmin/api/'.length) + url.search, {
        headers: { Authorization: request.headers.get('authorization') || '', Accept: 'application/json' }
      });
      return pass(res);
    }

    if (request.method === 'GET' && p === '/strava/client') {
      return new Response(JSON.stringify({ client_id: env.STRAVA_CLIENT_ID || '' }), { headers: { ...cors, 'content-type': 'application/json' } });
    }
    if (request.method === 'POST' && p === '/strava/token') {
      if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) return own('STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET are not set in the Worker', 501);
      const b = await request.json().catch(() => ({}));
      const form = new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET });
      if (b.code) { form.set('code', b.code); form.set('grant_type', 'authorization_code'); }
      else if (b.refresh_token) { form.set('refresh_token', b.refresh_token); form.set('grant_type', 'refresh_token'); }
      else return own('Missing code or refresh_token', 400);
      const res = await fetch('https://www.strava.com/oauth/token', { method: 'POST', body: form });
      return pass(res);
    }
    if (request.method === 'GET' && p.startsWith('/strava/api/')) {
      const res = await fetch('https://www.strava.com/api/v3/' + p.slice('/strava/api/'.length) + url.search, {
        headers: { Authorization: request.headers.get('authorization') || '' }
      });
      return pass(res);
    }
    return own('Not found', 404);
  }
};
