import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const html = '<!doctype html><title>page</title>';
const env = {
  ASSETS: {
    fetch: async (req) => {
      const p = new URL(req.url).pathname;
      if (p === '/otc' || p === '/otc.html' || p === '/' || p === '/index.html') {
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
