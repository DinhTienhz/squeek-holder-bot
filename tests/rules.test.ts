import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAccount, evaluateHamster, formatSqk, progressPct, snapshot } from '../src/rules.ts';
import type { Account, Status } from '../src/api.ts';

const acct = (claimable: bigint, tokens: { id: string; state: string; next?: number }[] = []): Account => ({
  address: '0xabc0000000000000000000000000000000000001',
  claimable,
  tokenCount: tokens.length,
  tokens: tokens.map((t) => ({
    tokenId: t.id, level: 1, basePower: '1000',
    nextMergeHeight: t.next ?? 0, mergeState: t.state, custody: 'wallet',
  })),
});

const T = 10n ** 18n; // 1 SQK

test('claim: vượt ngưỡng lần đầu → 1 alert', () => {
  const prev = snapshot(acct(0n));
  const alerts = evaluateAccount(prev, acct(5n * T), 5n * T);
  assert.equal(alerts.filter((a) => a.kind === 'claim').length, 1);
});

test('claim: dưới ngưỡng → không alert', () => {
  const alerts = evaluateAccount(snapshot(acct(0n)), acct(4n * T), 5n * T);
  assert.equal(alerts.length, 0);
});

test('claim: cùng bucket không báo lại, vượt bucket mới báo', () => {
  const threshold = 5n * T;
  const first = evaluateAccount(snapshot(acct(0n)), acct(6n * T), threshold);
  const second = evaluateAccount(snapshot(acct(6n * T)), acct(9n * T), threshold);
  const third = evaluateAccount(snapshot(acct(9n * T)), acct(11n * T), threshold);
  assert.equal(first.length, 1);
  assert.equal(second.length, 0);
  assert.equal(third.length, 1);
});

test('cooldown: cooldown → ready → alert', () => {
  const prev = snapshot(acct(0n, [{ id: '42', state: 'cooldown', next: 900 }]));
  const alerts = evaluateAccount(prev, acct(0n, [{ id: '42', state: 'ready', next: 900 }]), T);
  assert.deepEqual(alerts.map((a) => a.kind), ['cooldown']);
  assert.equal(alerts[0].tokenId, '42');
});

test('cooldown: ready sẵn từ đầu không báo (tránh spam khi thêm ví)', () => {
  const alerts = evaluateAccount(null, acct(0n, [{ id: '42', state: 'ready' }]), T);
  assert.equal(alerts.length, 0);
});

test('hamster: đổi trạng thái → alert, giữ nguyên → null', () => {
  const s = { coreStatus: 'SPINNING' } as Status;
  assert.ok(evaluateHamster('IDLE', s, 1_700_000_000_000));
  assert.equal(evaluateHamster('SPINNING', s, 1_700_000_000_000), null);
  assert.equal(evaluateHamster(null, s), null);
});

test('formatSqk', () => {
  assert.equal(formatSqk(0n), '0 SQK');
  assert.equal(formatSqk(1_234_567_890_000_000_000_000n), '1.234,56 SQK');
  assert.equal(formatSqk(5n * 10n ** 17n), '0,5 SQK');
  assert.equal(formatSqk(1n * T), '1 SQK');
});

test('progressPct kẹp 0..100', () => {
  assert.equal(progressPct(0), 0);
  assert.equal(progressPct(500_000_000), 50);
  assert.equal(progressPct(2e9), 100);
});
