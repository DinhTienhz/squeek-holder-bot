import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatQueue, inQuietHours, parseClock, parseQuietRange } from '../src/queue.ts';

test('ChatQueue giãn nhịp theo chat', async () => {
  let now = 1000;
  const sleeps: number[] = [];
  const q = new ChatQueue(1100, () => now, async (ms) => { sleeps.push(ms); now += ms; });
  await q.run('a', async () => { now += 10; });
  await q.run('a', async () => { now += 10; });
  await q.run('a', async () => { now += 10; });
  assert.equal(sleeps.length, 2);
  assert.ok(sleeps.every((ms) => ms > 0 && ms <= 1100));
});

test('ChatQueue độc lập giữa các chat', async () => {
  let now = 1000;
  const sleeps: number[] = [];
  const q = new ChatQueue(1100, () => now, async (ms) => { sleeps.push(ms); now += ms; });
  await q.run('a', async () => {});
  await q.run('b', async () => {});
  assert.equal(sleeps.length, 0);
});

test('parseClock / parseQuietRange', () => {
  assert.equal(parseClock('22:30'), 22 * 60 + 30);
  assert.equal(parseClock('7:05'), 7 * 60 + 5);
  assert.equal(parseClock('25:00'), null);
  assert.deepEqual(parseQuietRange('22:00-07:00'), { start: 1320, end: 420 });
  assert.equal(parseQuietRange('bad'), null);
});

test('inQuietHours hỗ trợ khoảng qua nửa đêm', () => {
  const at = (h: number, m = 0) => new Date(2026, 0, 1, h, m);
  assert.equal(inQuietHours(at(23), 1320, 420), true);
  assert.equal(inQuietHours(at(6), 1320, 420), true);
  assert.equal(inQuietHours(at(6, 59), 1320, 420), true);
  assert.equal(inQuietHours(at(7), 1320, 420), false);
  assert.equal(inQuietHours(at(12), 1320, 420), false);
  assert.equal(inQuietHours(at(12), null, null), false);
});
