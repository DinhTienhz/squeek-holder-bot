/**
 * Cloudflare Worker: serve ./public as a static site, with safe defaults.
 *
 * - HTML: revalidate on every request (content changes on deploy)
 * - images/icons: cache for a year, immutable (names are versioned with ?v=)
 * - security headers + CSP that only allows the public Squeekchain API
 * - tiny 404 page instead of a bare asset error
 */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://api.squeekchain.com",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
};

const NOT_FOUND = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>404 — Squeek Holder Bot</title>
<style>
 body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b10;color:#e9e9f2;
      font:16px/1.6 ui-sans-serif,system-ui,sans-serif}
 .box{text-align:center;padding:32px}
 h1{font-size:54px;margin:0 0 8px;color:#c9f24d}
 a{color:#7de2d1;text-decoration:none}
</style></head>
<body><div class="box"><h1>404</h1><p>Nothing here. Back to the <a href="/">landing page</a>.</p></div></body></html>`;

function isImage(path) {
  return /\.(png|ico|svg|webp|jpg|jpeg|gif|avif)$/i.test(path);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const res = await env.ASSETS.fetch(request);

    if (res.status === 404 && !isImage(url.pathname)) {
      return new Response(NOT_FOUND, {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS },
      });
    }

    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);

    if (isImage(url.pathname)) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (res.headers.get('content-type')?.includes('text/html')) {
      headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }

    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
