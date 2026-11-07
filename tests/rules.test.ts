import test from 'node:test';
import assert from 'node:assert/strict';
import { claimAlertDue, evaluateAccount, evaluateHamster, formatSqk, isHamsterRunning, ladderPowerGain, optimizeClaim, planLadder, progressPct, snapshot } from '../src/rules.ts';
import type { Account, Status } from '../src/api.ts';

const acct = (claimable: bigint, tokens: { id: string; state: string; next?: number }[] = []): Account => ({
  address: '0xabc0000000000000000000000000000000000001',
  claimable,
  tokenCount: tokens.length,
  stakedSqk: 0n,
  tokens: tokens.map((t) => ({
    tokenId: t.id, level: 1, basePower: '1000',
    nextMergeHeight: t.next ?? 0, mergeState: t.state, custody: 'wallet',
  })),
});

const T = 10n ** 18n; // 1 SQK

test('claimAlertDue: lần đầu vượt ngưỡng → báo', () => {
  assert.equal(claimAlertDue(6n * T, 5n * T, null, 0), true);
});

test('claimAlertDue: dưới ngưỡng → không báo', () => {
  assert.equal(claimAlertDue(4n * T, 5n * T, null, 0), false);
});

test('claimAlertDue: chưa lớn thêm 1 ngưỡng → không báo', () => {
  const memo = { amount: 100n * T, at: 0 };
  assert.equal(claimAlertDue(102n * T, 5n * T, memo, 60 * 60_000), false);
});

test('claimAlertDue: gấp đôi → báo ngay', () => {
  const memo = { amount: 100n * T, at: 0 };
  assert.equal(claimAlertDue(205n * T, 5n * T, memo, 60_000), true);
});

test('claimAlertDue: sau 6 giờ và tăng ≥ ngưỡng → báo', () => {
  const memo = { amount: 100n * T, at: 0 };
  assert.equal(claimAlertDue(110n * T, 5n * T, memo, 7 * 3600_000), true);
  assert.equal(claimAlertDue(110n * T, 5n * T, memo, 2 * 3600_000), false);
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
  // running -> resting must alert too (both directions)
  const idle = { ...s, coreStatus: 'IDLE' } as Status;
  assert.ok(evaluateHamster('SPINNING', idle, 1_700_000_000_000));
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


test('isHamsterRunning: motion comes from rpm or a real work delta, not coreStatus', () => {
  assert.equal(isHamsterRunning('ACTIVE', 0), false);     // parked sensor still reports ACTIVE
  assert.equal(isHamsterRunning('SPINNING', 0), true);
  assert.equal(isHamsterRunning('IDLE', 0), false);
  assert.equal(isHamsterRunning('IDLE', 4200), true);     // sensor lags: rpm wins
  assert.equal(isHamsterRunning('MAINTENANCE', 1200), true);
  assert.equal(isHamsterRunning('IDLE', 0, 9), true);     // work counter moved
  assert.equal(isHamsterRunning('IDLE', 0, 1), false);    // single unit is noise
  assert.equal(isHamsterRunning('ACTIVE', 0, 2), false);
  assert.equal(isHamsterRunning('IDLE', 0, 0), false);
  assert.equal(isHamsterRunning('MAINTENANCE', 0), false);
});

test('hamsterRunMs: bắt đầu, chạy tiếp, dừng', async () => {
  const { hamsterRunMs } = await import('../src/rules.ts');
  const t0 = 1_000_000;
  assert.deepEqual(hamsterRunMs(true, null, t0), { runMs: null, nextSince: t0 });
  assert.deepEqual(hamsterRunMs(true, t0, t0 + 5_000), { runMs: null, nextSince: t0 });
  assert.deepEqual(hamsterRunMs(false, t0, t0 + 15_000), { runMs: 15_000, nextSince: null });
  assert.deepEqual(hamsterRunMs(false, null, t0), { runMs: null, nextSince: null });
});

test('stepHamster: cần 2 mẫu liên tiếp mới đổi trạng thái', async () => {
  const { stepHamster } = await import('../src/rules.ts');
  let st = { confirmed: null as boolean | null, pending: null as boolean | null, count: 0 };
  let r = stepHamster(st, true); st = r.state;
  assert.equal(r.transition, null);            // first sample confirms quietly
  assert.equal(st.confirmed, true);

  r = stepHamster(st, false); st = r.state;    // one stray sample
  assert.equal(r.transition, null);
  r = stepHamster(st, true); st = r.state;     // back to running: no event
  assert.equal(r.transition, null);
  assert.equal(st.confirmed, true);

  r = stepHamster(st, false); st = r.state;    // two consecutive stops
  assert.equal(r.transition, null);
  r = stepHamster(st, false); st = r.state;
  assert.equal(r.transition, false);
  assert.equal(st.confirmed, false);
});

test('stepHamster: ngưỡng 1 mẫu báo ngay, ngưỡng 2 mẫu cần 2 lần', async () => {
  const { stepHamster } = await import('../src/rules.ts');
  const base = { confirmed: false as boolean | null, pending: null as boolean | null, count: 0 };
  const immediate = stepHamster(base, true, 1);
  assert.equal(immediate.transition, true);
  const slow = stepHamster(base, true, 2);
  assert.equal(slow.transition, null);
});

test('stepHamster: một mẫu rpm dương lẻ không tạo alert chạy', async () => {
  const { stepHamster } = await import('../src/rules.ts');
  let st = { confirmed: false as boolean | null, pending: null as boolean | null, count: 0 };
  let r = stepHamster(st, true, 2);   // blip thứ nhất
  st = r.state;
  assert.equal(r.transition, null);
  r = stepHamster(st, false, 2);      // quay lại yên tĩnh
  st = r.state;
  assert.equal(r.transition, null);
  assert.equal(st.confirmed, false);

  r = stepHamster(st, true, 2); st = r.state;   // 2 mẫu liên tiếp
  r = stepHamster(st, true, 2); st = r.state;
  assert.equal(r.transition, true);
});

test('stepHamster: cần 3 mẫu yên tĩnh mới báo dừng', async () => {
  const { stepHamster } = await import('../src/rules.ts');
  let st = { confirmed: true as boolean | null, pending: null as boolean | null, count: 0 };
  let r = stepHamster(st, false, 3); st = r.state;
  assert.equal(r.transition, null);
  r = stepHamster(st, false, 3); st = r.state;
  assert.equal(r.transition, null);
  r = stepHamster(st, false, 3); st = r.state;
  assert.equal(r.transition, false);
});
