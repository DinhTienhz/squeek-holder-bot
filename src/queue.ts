/** Giới hạn 1 tin/giây mỗi chat (Telegram) + kiểm tra quiet hours. */
export class ChatQueue {
  private nextAt = new Map<string, number>();
  private minGapMs: number;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;

  constructor(
    minGapMs = 1100,
    now: () => number = () => Date.now(),
    sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.minGapMs = minGapMs;
    this.now = now;
    this.sleep = sleep;
  }

  async run<T>(chatId: string, fn: () => Promise<T>): Promise<T> {
    const at = this.nextAt.get(chatId) ?? 0;
    const wait = at - this.now();
    if (wait > 0) await this.sleep(wait);
    this.nextAt.set(chatId, this.now() + this.minGapMs);
    return fn();
  }
}

/** 'HH:MM' → phút trong ngày; null nếu sai. */
export function parseClock(s: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Quiet hours hỗ trợ khoảng qua nửa đêm (22:00–07:00). */
export function inQuietHours(now: Date, start: number | null, end: number | null): boolean {
  if (start === null || end === null) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  if (start === end) return false;
  if (start < end) return mins >= start && mins < end;
  return mins >= start || mins < end;
}

export function parseQuietRange(s: string): { start: number; end: number } | null {
  const m = /^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/.exec(s.trim());
  if (!m) return null;
  const start = parseClock(m[1]);
  const end = parseClock(m[2]);
  if (start === null || end === null) return null;
  return { start, end };
}
