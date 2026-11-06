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
    "connect-src 'self' https://api.squeekchain.com https://ethereum-sepolia-rpc.publicnode.com",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
};

// OTC runs on its own domain; everything else (landing + bot pages) stays on the
// workers.dev host until a second domain is attached.
const OTC_HOSTS = new Set(['squeeksotc.bid', 'www.squeeksotc.bid']);
// Set to 'https://squeekotc.bid' once that domain resolves, to send /otc on the
// old host to the market. Empty keeps both hosts working during the move.
const OTC_ORIGIN = 'https://squeeksotc.bid';

const OTC_NOT_FOUND = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>404 — Squeek OTC</title>
<style>
 body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b10;color:#e9e9f2;
      font:16px/1.6 ui-sans-serif,system-ui,sans-serif}
 .box{text-align:center;padding:32px}
 h1{font-size:54px;margin:0 0 8px;color:#c9f24d}
 a{color:#7de2d1;text-decoration:none}
</style></head>
<body><div class="box"><h1>404</h1><p>Nothing here. Go to the <a href="/otc">OTC market</a>.</p></div></body></html>`;

function isAssetPath(path) {
  return isImage(path) || /\.(css|js|map|woff2?|txt)$/i.test(path);
}

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

const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const selector = { totalStaked: '0x817b1cd2', balanceOf: '0x70a08231' };
let stakeCache = { at: 0, body: null };

async function readStakingTotals() {
  if (stakeCache.body && Date.now() - stakeCache.at < 60_000) return stakeCache.body;
  const eco = await fetch('https://api.squeekchain.com/v1/economy/state', {
    headers: { 'user-agent': 'squeek-holder-bot/0.1' },
  }).then((r) => r.json());
  const staking = eco?.deployment?.components?.staking?.address;
  const nft = eco?.deployment?.components?.collection?.address;
  if (!staking || !nft) throw new Error('deployment missing');
  const call = async (to, data) => {
    const r = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
    });
    const j = await r.json();
    if (j.error || typeof j.result !== 'string') throw new Error('rpc failed');
    return BigInt(j.result);
  };
  const pad = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const [sqkStaked, nftsStaked] = await Promise.all([
    call(staking, selector.totalStaked),
    call(nft, selector.balanceOf + pad(staking)),
  ]);
  const body = JSON.stringify({
    nftsStaked: nftsStaked.toString(),
    sqkStaked: sqkStaked.toString(),
    nftLive: String(eco?.nft?.live ?? '0'),
    liveSupply: String(eco?.supply?.liveSupplyBaseUnits ?? '0'),
    miningMinted: String(eco?.supply?.miningMintedBaseUnits ?? '0'),
  });
  stakeCache = { at: Date.now(), body };
  return body;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const onOtcHost = OTC_HOSTS.has(url.hostname);

    if (onOtcHost) {
      // The market host only serves the market: / redirects there, other pages 404.
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return Response.redirect(url.origin + '/otc', 302);
      }
      if (url.pathname === '/api/staking-totals') {
        return new Response('Not found', { status: 404, headers: SECURITY_HEADERS });
      }
      if (!/^\/otc(\.html)?$/.test(url.pathname) && !isAssetPath(url.pathname)) {
        return new Response(OTC_NOT_FOUND, {
          status: 404,
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS },
        });
      }
    } else if (OTC_ORIGIN && /^\/otc(\.html)?$/.test(url.pathname)) {
      return Response.redirect(OTC_ORIGIN + '/otc', 302);
    }

    if (url.pathname === '/api/staking-totals') {
      try {
        const body = await readStakingTotals();
        return new Response(body, {
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS },
        });
      } catch {
        return new Response(JSON.stringify({ error: 'unavailable' }), {
          status: 503,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS },
        });
      }
    }

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
