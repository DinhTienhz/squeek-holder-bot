/**
 * Cấu hình từ biến môi trường. Không chứa secret trong code.
 */
export type Config = {
  botToken: string;
  apiBase: string;
  adminIds: Set<string>;
  pollStatusMs: number;
  pollWalletMs: number;
  walletConcurrency: number;
  maxWallets: number;
  defaultThresholdSqk: bigint;
  dryRun: boolean;
  rpcUrl: string;
  miningAddress: string;
  collection: number;
  digestHour: number;
  claimAlertMinHours: number;
};

export function sqkToBaseUnits(s: string): bigint {
  const t = s.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`invalid SQK amount: ${s}`);
  const [whole, frac = ''] = t.split('.');
  return BigInt(whole) * 10n ** 18n + BigInt((frac + '0'.repeat(18)).slice(0, 18));
}

const num = (v: unknown, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export function loadConfig(env: Record<string, unknown> = {}): Config {
  // .env files in the wild use either name; accept both, TELEGRAM_BOT_TOKEN wins.
  const botToken = String(env.TELEGRAM_BOT_TOKEN ?? env.BOT_TOKEN ?? '');
  return {
    botToken,
    apiBase: String(env.API_BASE ?? 'https://api.squeekchain.com/v1').replace(/\/+$/, ''),
    adminIds: new Set(String(env.ADMIN_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)),
    pollStatusMs: num(env.POLL_STATUS_MS, 15_000),
    pollWalletMs: num(env.POLL_WALLET_MS, 45_000),
    walletConcurrency: num(env.WALLET_CONCURRENCY, 3),
    maxWallets: num(env.MAX_WALLETS, 5),
    // 0.5 SQK = 5e17 base units (18 decimals)
    defaultThresholdSqk: sqkToBaseUnits(String(env.DEFAULT_THRESHOLD_SQK ?? '0.5')),
    dryRun: env.DRY_RUN === '1' || !botToken,
    rpcUrl: String(env.RPC_URL ?? ''),
    miningAddress: String(env.MINING_ADDRESS ?? '0xcd46990f8349057335289ef282c276204b6cdc62'),
    collection: Number(env.COLLECTION ?? 0),
    digestHour: Number(env.DIGEST_HOUR ?? 9),
    claimAlertMinHours: num(env.CLAIM_ALERT_MIN_HOURS, 6),
  };
}
