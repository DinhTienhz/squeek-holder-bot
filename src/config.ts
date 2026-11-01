/**
 * Cấu hình từ biến môi trường. Không chứa secret trong code.
 */
export type Config = {
  botToken: string;
  apiBase: string;
  dbPath: string;
  adminIds: Set<string>;
  pollStatusMs: number;
  pollWalletMs: number;
  maxWallets: number;
  defaultThresholdSqk: bigint;
  dryRun: boolean;
  logPath: string | null;
  rpcUrl: string;
  miningAddress: string;
  collection: number;
  digestHour: number;
};

export function sqkToBaseUnits(s: string): bigint {
  const t = s.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`invalid SQK amount: ${s}`);
  const [whole, frac = ''] = t.split('.');
  return BigInt(whole) * 10n ** 18n + BigInt((frac + '0'.repeat(18)).slice(0, 18));
}

const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    botToken: env.TELEGRAM_BOT_TOKEN ?? '',
    apiBase: (env.API_BASE ?? 'https://api.squeekchain.com/v1').replace(/\/+$/, ''),
    dbPath: env.DB_PATH ?? new URL('../data/bot.db', import.meta.url).pathname,
    adminIds: new Set((env.ADMIN_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)),
    pollStatusMs: num(env.POLL_STATUS_MS, 15_000),
    pollWalletMs: num(env.POLL_WALLET_MS, 45_000),
    maxWallets: num(env.MAX_WALLETS, 5),
    // 0.5 SQK = 5e17 base units (18 decimals)
    defaultThresholdSqk: sqkToBaseUnits(env.DEFAULT_THRESHOLD_SQK ?? '0.5'),
    dryRun: env.DRY_RUN === '1' || !env.TELEGRAM_BOT_TOKEN,
    logPath: env.LOG_PATH ?? null,
    rpcUrl: env.RPC_URL ?? '',
    miningAddress: env.MINING_ADDRESS ?? '0xcd46990f8349057335289ef282c276204b6cdc62',
    collection: Number(env.COLLECTION ?? 0),
    digestHour: Number(env.DIGEST_HOUR ?? 9),
  };
}
