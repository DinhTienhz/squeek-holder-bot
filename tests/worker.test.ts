import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const html = '<!doctype html><title>page</title>';
const env = {
  ASSETS: {
    fetch: async (req) => {
      const p = new URL(req.url).pathname;
      if (p === '/otc' || p === '/otc.html' || p === '/' || p === '/index.html' ||
          p === '/preview/home' || p === '/preview/market') {
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      if (p.endsWith('.png') || p.endsWith('.svg')) {
        return new Response('img', { headers: { 'content-type': 'image/png' } });
      }
      return new Response('missing', { status: 404 });
    },
  },
};

const get = (url) => worker.fetch(new Request(url), env);

test('otc host: the market is served at the root', async () => {
  const seen: string[] = [];
  const env2 = { ASSETS: { fetch: async (req: Request) => {
    seen.push(new URL(req.url).pathname);
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  } } };
  const r = await worker.fetch(new Request('https://squeeksotc.bid/'), env2);
  assert.equal(r.status, 200);
  assert.deepEqual(seen, ['/otc']);
  assert.match(r.headers.get('content-security-policy') || '', /default-src 'self'/);
});

test('otc host: /otc redirects to /market and keeps the query', async () => {
  const r = await get('https://squeeksotc.bid/otc?c=0xabc');
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://squeeksotc.bid/market?c=0xabc');
});

test('otc host: /market serves the same app', async () => {
  const seen: string[] = [];
  const env2 = { ASSETS: { fetch: async (req: Request) => {
    seen.push(new URL(req.url).pathname);
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  } } };
  const r = await worker.fetch(new Request('https://squeeksotc.bid/market'), env2);
  assert.equal(r.status, 200);
  assert.deepEqual(seen, ['/otc']);
});

test('otc host: the landing page does not exist there', async () => {
  const r = await get('https://squeeksotc.bid/index.html');
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://squeeksotc.bid/');
});

test('otc host: the static previews are served', async () => {
  const r = await get('https://squeeksotc.bid/preview');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'https://squeeksotc.bid/preview/home');
  assert.equal((await get('https://squeeksotc.bid/preview/home')).status, 200);
  assert.equal((await get('https://squeeksotc.bid/preview/market')).status, 200);
  assert.equal((await get('https://squeeksotc.bid/preview/market.html')).status, 200);
});

test('otc host: unknown pages return the market 404', async () => {
  const r = await get('https://squeeksotc.bid/claim');
  assert.equal(r.status, 404);
  assert.match(await r.text(), /market/);
});

test('otc host: static images still load', async () => {
  const r = await get('https://squeeksotc.bid/logo-mark.png');
  assert.equal(r.status, 200);
});

test('otc host: the staking API is not exposed', async () => {
  const r = await get('https://squeeksotc.bid/api/staking-totals');
  assert.equal(r.status, 404);
});

test('bot host: landing works and /otc redirects to the market domain', async () => {
  assert.equal((await get('https://squeek-holder-bot.chainn.workers.dev/')).status, 200);
  const r = await get('https://squeek-holder-bot.chainn.workers.dev/otc');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'https://squeeksotc.bid/market');
});

test('bot host: 404 page is the landing one', async () => {
  const r = await get('https://squeek-holder-bot.chainn.workers.dev/nope');
  assert.equal(r.status, 404);
  assert.match(await r.text(), /landing page/);
});

test('security headers include HSTS on html and assets', async () => {
  for (const u of ['https://squeeksotc.bid/', 'https://squeeksotc.bid/logo-mark.png']) {
    const r = await get(u);
    assert.match(r.headers.get('strict-transport-security') || '', /max-age=31536000/);
  }
});

test('a missing image is never cached as immutable', async () => {
  const env2 = { ASSETS: { fetch: async () => new Response('nope', { status: 404, headers: { 'content-type': 'image/png' } }) } };
  const r = await worker.fetch(new Request('https://squeeksotc.bid/nope.png'), env2);
  assert.equal(r.status, 404);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('preview pages are marked noindex', async () => {
  const r = await get('https://squeeksotc.bid/preview/market');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
});

test('write methods are rejected', async () => {
  for (const u of ['https://squeeksotc.bid/market', 'https://squeek-holder-bot.chainn.workers.dev/api/staking-totals']) {
    const r = await worker.fetch(new Request(u, { method: 'POST' }), env);
    assert.equal(r.status, 405);
    assert.equal(r.headers.get('allow'), 'GET, HEAD');
  }
});

test('the synthetic asset origin never leaks to the client', async () => {
  const env2 = { ASSETS: { fetch: async () => new Response(null, {
    status: 307, headers: { location: 'https://assets.local/other', 'x-secret': 'leak' } }) } };
  const r = await worker.fetch(new Request('https://squeeksotc.bid/redirect-me'), env2);
  assert.equal(r.headers.get('location'), null);
  assert.equal(r.headers.get('x-secret'), null);
});

test('asset failures become a generic 502', async () => {
  const env2 = { ASSETS: { fetch: async () => { throw new Error('boom'); } } };
  const r = await worker.fetch(new Request('https://squeeksotc.bid/market'), env2);
  assert.equal(r.status, 502);
  assert.doesNotMatch(await r.text(), /boom/);
});

test('redirects carry the security header set', async () => {
  const r = await get('https://squeeksotc.bid/otc');
  assert.equal(r.status, 301);
  assert.match(r.headers.get('strict-transport-security') || '', /max-age/);
  assert.equal(r.headers.get('cross-origin-opener-policy'), 'same-origin');
});

test('the RPC proxy only accepts POST and read-only methods', async () => {
  const g = await worker.fetch(new Request('https://squeeksotc.bid/api/rpc'), env);
  assert.equal(g.status, 405);
  assert.equal(g.headers.get('allow'), 'POST');

  const bad = await worker.fetch(new Request('https://squeeksotc.bid/api/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendTransaction', params: [] }),
  }), env);
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /method not allowed/);
});
