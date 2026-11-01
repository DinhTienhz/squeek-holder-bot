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
export function evaluateAccount(prev: AccountState | null, next: Account, threshold: bigint): Alert[] {
  const out: Alert[] = [];
  if (threshold > 0n) {
    const before = prev?.claimable ?? 0n;
    if (next.claimable >= threshold) {
      const bucket = next.claimable / threshold;
      const prevBucket = before / threshold;
      if (bucket > prevBucket) {
        out.push({ kind: 'claim', key: `claim:${next.address.toLowerCase()}:${bucket}`, value: next.claimable });
      }
    }
  }
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

/** Alert khi trạng thái bánh xe đổi (SPINNING ↔ IDLE). */
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
