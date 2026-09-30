/**
 * API proxy — runs on Netlify, forwards to the backend on the VPS.
 *
 * WHY THIS EXISTS
 * ---------------
 * Netlify's built-in redirect proxy only forwards to standard ports. The API
 * runs on port 8081 (ports 80 and 443 on that server belong to another
 * service), so a `/api/* -> http://IP:8081/...` rule in _redirects returned
 * 502 and never reached the server — the server's access log showed no
 * requests from Netlify at all.
 *
 * A function has no such limit. It runs on Netlify's servers and can call any
 * host and port, so it solves two problems at once:
 *
 *   1. the port restriction, and
 *   2. mixed content — a browser refuses to let an HTTPS page call a plain
 *      HTTP API, but here the browser only ever talks HTTPS to Netlify, and
 *      the HTTP call happens server-side where that rule does not apply.
 *
 * Nothing on the VPS changes because of this file.
 *
 * CONFIGURING
 * -----------
 * Set API_ORIGIN in Netlify (Site configuration -> Environment variables).
 * Keep the real server address out of source control.
 */

// Hop-by-hop headers describe a single network hop and must not be forwarded.
// Passing them on can break the response, for example by promising an encoding
// that the body no longer uses after Netlify has decoded it.
const SKIP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'accept-encoding',
  // Netlify's own routing headers, meaningless to the backend.
  'x-nf-request-id',
  'x-nf-account-id',
  'x-nf-client-connection-ip',
]);

const SKIP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
]);

export default async (request) => {
  const configuredOrigin = process.env.API_ORIGIN?.trim();
  if (!configuredOrigin) {
    console.error('[api-proxy] Missing API_ORIGIN environment variable.');
    return new Response(
      JSON.stringify({ success: false, message: 'API proxy is not configured.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const apiOrigin = configuredOrigin.replace(/\/+$/, '');

  const incoming = new URL(request.url);
  const target = `${apiOrigin}${incoming.pathname}${incoming.search}`;

  // Copy the caller's headers, minus the ones that must not travel onward.
  // The Authorization header is deliberately kept — it carries the JWT.
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (!SKIP_REQUEST_HEADERS.has(name.toLowerCase())) headers.set(name, value);
  }
  // Tell the backend who really made the request, since it now sees Netlify.
  const clientIp = request.headers.get('x-nf-client-connection-ip');
  if (clientIp) headers.set('x-forwarded-for', clientIp);
  headers.set('x-forwarded-proto', 'https');

  const init = { method: request.method, headers, redirect: 'manual' };

  // GET and HEAD must not carry a body; anything else forwards it unchanged.
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch (error) {
    // The backend is unreachable. Answer in the same shape the API uses, so
    // the React error handling shows a sensible message instead of crashing
    // on an unexpected response.
    console.error(`[api-proxy] ${request.method} ${target} failed:`, error?.message);
    return new Response(
      JSON.stringify({
        success: false,
        message:
          'Cannot reach the API server. It may be restarting — please try again in a moment.',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const responseHeaders = new Headers();
  for (const [name, value] of upstream.headers) {
    if (!SKIP_RESPONSE_HEADERS.has(name.toLowerCase())) responseHeaders.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
};

// Netlify routes these paths straight to this function, so no _redirects rule
// is needed for the API.
export const config = {
  path: '/api/*',
};
