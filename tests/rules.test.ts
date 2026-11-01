import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAccount, evaluateHamster, formatSqk, ladderPowerGain, optimizeClaim, planLadder, progressPct, snapshot } from '../src/rules.ts';
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

test('optimizeClaim: chọn 32 token lớn nhất, tính dust + batches', () => {
  const per = Array.from({ length: 40 }, (_, i) => ({ tokenId: String(i), amount: BigInt(i + 1) * 10n ** 17n }));
  const plan = optimizeClaim(per, 32);
  assert.equal(plan.tokens.length, 32);
  assert.equal(plan.skipped, 8);
  assert.equal(plan.batches, 2);
  // 40 token: chọn 40..9 → tổng = (9+40)*32/2 * 1e17
  assert.equal(plan.total, (BigInt((9 + 40) * 32 / 2) * 10n ** 17n));
  assert.equal(plan.dust, plan.total % 10n ** 18n);
});

test('optimizeClaim: ít hơn 32 token → 1 batch, không bỏ', () => {
  const plan = optimizeClaim([{ tokenId: '1', amount: 5n }, { tokenId: '2', amount: 10n }]);
  assert.deepEqual(plan.tokens, ['2', '1']);
  assert.equal(plan.total, 15n);
  assert.equal(plan.skipped, 0);
  assert.equal(plan.batches, 1);
});

test('planLadder: 4 token L1 → 2 L2 → 1 L3', () => {
  const steps = planLadder({ 1: 4 }, [0, 3000, 7000]);
  assert.deepEqual(steps, [
    { level: 1, merges: 2, produced: 2, cooldownBlocks: 3000 },
    { level: 2, merges: 1, produced: 1, cooldownBlocks: 7000 },
  ]);
});

test('planLadder: 8 token L1 → 4 L2 → 2 L3 → 1 L4', () => {
  const steps = planLadder({ 1: 8 }, [0, 3000, 7000, 14000]);
  assert.deepEqual(steps, [
    { level: 1, merges: 4, produced: 4, cooldownBlocks: 3000 },
    { level: 2, merges: 2, produced: 2, cooldownBlocks: 7000 },
    { level: 3, merges: 1, produced: 1, cooldownBlocks: 14000 },
  ]);
});

test('planLadder: lẻ 1 token không merge', () => {
  assert.deepEqual(planLadder({ 1: 3 }, [0, 3000]), [{ level: 1, merges: 1, produced: 1, cooldownBlocks: 3000 }]);
});

test('ladderPowerGain: 2×L1 (1000) → 1×L2 (2200)', () => {
  const g = ladderPowerGain({ 1: 2 }, [1000, 2200, 4840]);
  assert.equal(g.before, 2000n);
  assert.equal(g.after, 2200n);
});
