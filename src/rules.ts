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
