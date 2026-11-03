import type { Account, Status } from './api.ts';

export type Alert = { kind: 'claim' | 'cooldown' | 'hamster'; key: string; tokenId?: string; value?: bigint };

export type AccountState = {
  claimable: bigint;
  mergeState: Map<string, { state: string; nextMergeHeight: number }>;
};

export function snapshot(a: Account): AccountState {
  const mergeState = new Map<string, { state: string; nextMergeHeight: number }>();
  for (const t of a.tokens) mergeState.set(t.tokenId, { state: t.mergeState, nextMergeHeight: t.nextMergeHeight });
  return { claimable: a.claimable, mergeState };
}

/**
 * So sánh hai lần đọc của cùng một ví.
 * - claim: vượt ngưỡng lần đầu, hoặc vượt thêm mỗi bội số ngưỡng
 * - cooldown: token chuyển cooldown → ready
 */
export function evaluateAccount(prev: AccountState | null, next: Account, _threshold: bigint): Alert[] {
  const out: Alert[] = [];
  if (prev) {
    for (const t of next.tokens) {
      const old = prev.mergeState.get(t.tokenId);
      if (t.mergeState === 'ready' && old?.state === 'cooldown') {
        out.push({ kind: 'cooldown', key: `cd:${t.tokenId}:${t.nextMergeHeight}`, tokenId: t.tokenId });
      }
    }
  }
  return out;
}

export type ClaimMemo = { amount: bigint; at: number } | null;

/**
 * Claim alerts are rate-limited: the first time the balance crosses the
 * threshold, then only when it doubles or after `minHours`, and only if it grew
 * by at least one threshold since the last alert.
 */
export function claimAlertDue(
  amount: bigint,
  threshold: bigint,
  memo: ClaimMemo,
  nowMs: number,
  minHours = 6,
): boolean {
  if (threshold <= 0n || amount < threshold) return false;
  if (!memo) return true;
  if (amount - memo.amount < threshold) return false;
  const hours = (nowMs - memo.at) / 3_600_000;
  const doubled = memo.amount > 0n && amount >= memo.amount * 2n;
  return doubled || hours >= minHours;
}

/**
 * Squeekchain reports the running state as ACTIVE (older docs said SPINNING).
 * Treat any unknown non-idle state as running only when the wheel is turning.
 */
export function isHamsterRunning(coreStatus: string, rpmMilli = 0): boolean {
  const s = String(coreStatus || '').toUpperCase();
  if (['SPINNING', 'ACTIVE', 'RUNNING', 'SPIN'].includes(s)) return true;
  if (['IDLE', 'RESTING', 'STOPPED', 'PAUSED', 'OFFLINE'].includes(s)) return false;
  return rpmMilli > 0;
}

/** Alert khi trạng thái bánh xe đổi (ACTIVE ↔ IDLE). */
export function evaluateHamster(prev: string | null, next: Status, nowMs = Date.now()): Alert | null {
  if (!prev || prev === next.coreStatus) return null;
  const hour = Math.floor(nowMs / 3_600_000);
  return { kind: 'hamster', key: `ham:${next.coreStatus}:${hour}` };
}

/** base units (18 decimals) → chuỗi SQK gọn. */
export function formatSqk(baseUnits: bigint, decimals = 2): string {
  const neg = baseUnits < 0n;
  const v = neg ? -baseUnits : baseUnits;
  const whole = v / 10n ** 18n;
  const frac = v % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, '0').slice(0, decimals).replace(/0+$/, '');
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const s = fracStr ? `${wholeStr},${fracStr}` : wholeStr;
  return (neg ? '-' : '') + s + ' SQK';
}

export function progressPct(blockProgress: number): number {
  return Math.max(0, Math.min(100, (blockProgress / 1e9) * 100));
}

/** Một token với số SQK claim được (base units). */
export type TokenAmount = { tokenId: string; amount: bigint };

export type ClaimPlan = {
  tokens: string[];
  total: bigint;      // tổng của batch được chọn
  dust: bigint;       // phần lẻ không trả được (< 1e18)
  batches: number;    // số tx cần nếu muốn claim hết
  skipped: number;    // token bị bỏ khỏi batch đầu
};

/**
 * Chọn tối đa `maxBatch` token có claimable lớn nhất.
 * Không có dữ liệu từng token thì caller truyền ước lượng đều nhau.
 */
export function optimizeClaim(perToken: TokenAmount[], maxBatch = 32): ClaimPlan {
  const sorted = [...perToken].sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
  const chosen = sorted.slice(0, maxBatch);
  const total = chosen.reduce((s, t) => s + t.amount, 0n);
  return {
    tokens: chosen.map((t) => t.tokenId),
    total,
    dust: total % 10n ** 18n,
    batches: Math.max(1, Math.ceil(sorted.length / maxBatch)),
    skipped: Math.max(0, sorted.length - chosen.length),
  };
}

export type LadderStep = { level: number; merges: number; produced: number; cooldownBlocks: number };

/**
 * Lập kế hoạch merge từ số lượng token mỗi level.
 * Mỗi cặp cùng level → 1 token level+1; lặp đến khi không còn cặp.
 */
export function planLadder(counts: Record<number, number>, cooldownBlocks: number[], maxLevel = 10): LadderStep[] {
  const c: Record<number, number> = {};
  for (const [k, v] of Object.entries(counts)) c[Number(k)] = v;
  const steps: LadderStep[] = [];
  for (let level = 1; level < maxLevel; level++) {
    const have = c[level] ?? 0;
    const merges = Math.floor(have / 2);
    if (merges <= 0) continue;
    c[level] = have - merges * 2;
    c[level + 1] = (c[level + 1] ?? 0) + merges;
    steps.push({ level, merges, produced: merges, cooldownBlocks: cooldownBlocks[level] ?? 0 });
  }
  return steps;
}

/** Tổng power lý thuyết nếu merge hết theo ladder (dùng basePower theo level). */
export function ladderPowerGain(counts: Record<number, number>, basePower: number[]): { before: bigint; after: bigint } {
  const before = Object.entries(counts).reduce((s, [lvl, n]) => s + BigInt(basePower[Number(lvl) - 1] ?? 0) * BigInt(n), 0n);
  const c: Record<number, number> = {};
  for (const [k, v] of Object.entries(counts)) c[Number(k)] = v;
  for (let level = 1; level < basePower.length; level++) {
    const merges = Math.floor((c[level] ?? 0) / 2);
    if (merges > 0) {
      c[level] = (c[level] ?? 0) - merges * 2;
      c[level + 1] = (c[level + 1] ?? 0) + merges;
    }
  }
  const after = Object.entries(c).reduce((s, [lvl, n]) => s + BigInt(basePower[Number(lvl) - 1] ?? 0) * BigInt(n), 0n);
  return { before, after };
}


/**
 * Track how long the wheel has been running across polls (and restarts, via meta).
 * Returns the run length when it stops and the marker to persist for next time.
 */
export function hamsterRunMs(
  running: boolean,
  sinceMs: number | null,
  nowMs: number,
): { runMs: number | null; nextSince: number | null } {
  if (running) return { runMs: null, nextSince: sinceMs && sinceMs > 0 ? sinceMs : nowMs };
  if (sinceMs && sinceMs > 0) return { runMs: nowMs - sinceMs, nextSince: null };
  return { runMs: null, nextSince: null };
}
