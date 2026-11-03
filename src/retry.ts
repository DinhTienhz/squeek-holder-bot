/**
 * Retry policy shared by the Telegram sender and the API client.
 *
 * Telegram returns 5xx / 429 when it is overloaded, and grammY surfaces network
 * failures with no error_code. Those are worth retrying; 400/403 (bad token,
 * blocked bot) are not.
 */

export type TelegramError = {
  error_code?: number;
  parameters?: { retry_after?: number };
  message?: string;
};

export function isTransientTelegramError(err: unknown): boolean {
  const e = (err ?? {}) as TelegramError;
  const code = Number(e.error_code ?? 0);
  if (code === 429 || code >= 500) return true;
  if (code >= 400 && code < 500) return false;
  const msg = String(e.message ?? '');
  return /timeout|timed out|econnreset|econnrefused|etimedout|socket hang up|network|aborted/i.test(msg);
}

/** 1s, 4s, 16s … capped; Retry-After from Telegram wins when present. */
export function retryDelayMs(attempt: number, retryAfterSec?: number): number {
  if (Number.isFinite(retryAfterSec) && Number(retryAfterSec) > 0) {
    return Math.min(60_000, Number(retryAfterSec) * 1000);
  }
  return Math.min(30_000, 1000 * 4 ** Math.max(0, attempt - 1));
}
