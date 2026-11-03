import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../src/api.ts';

const body = {
  generatedAt: '2026-11-03T03:31:59.000Z',
  measurement: { freshness: 'online', coreStatus: 'IDLE', rpmMilli: 0, speedMmPerSecond: 0, cumulativeWorkUnits: '83683' },
  builder: {
    anchor: { blockHeight: '7520', blockProgress: '258812397', settledThroughRound: '1081' },
    projected: { blockHeight: '7560', blockProgress: '517213889' },
  },
};

const fakeFetch = async () => ({
  status: 200,
  ok: true,
  headers: { get: () => null },
  json: async () => body,
});

test('status: dùng blockHeight/progress của projected, giữ settledHeight của anchor', async () => {
  const api = new ApiClient('https://example.test/v1', fakeFetch as any);
  const s = await api.status();
  assert.equal(s.blockHeight, 7560);
  assert.equal(s.blockProgress, 517213889);
  assert.equal(s.settledHeight, 7520);
});

test('status: thiếu projected thì fallback về anchor', async () => {
  const onlyAnchor = { ...body, builder: { anchor: body.builder.anchor } };
  const api = new ApiClient('https://example.test/v1', (async () => ({
    status: 200, ok: true, headers: { get: () => null }, json: async () => onlyAnchor,
  })) as any);
  const s = await api.status();
  assert.equal(s.blockHeight, 7520);
  assert.equal(s.settledHeight, 7520);
});
