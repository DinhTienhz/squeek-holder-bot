import { loadConfig } from './config.ts';
import { createBot } from './bot.ts';
import { ChatQueue, inQuietHours } from './queue.ts';
import { evaluateAccount, evaluateHamster, formatSqk, snapshot, type AccountState } from './rules.ts';
import { allWallets, firstTime, getUser, pruneSent } from './db.ts';

const cfg = loadConfig();
const { bot, db, api } = createBot(cfg);
const queue = new ChatQueue(1100);
const prevAccounts = new Map<string, AccountState>();
let prevHamster: string | null = null;
let lastStatusAt = 0;

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function notify(tgId: string, text: string): Promise<void> {
  const u = getUser(db, tgId);
  if (!u || u.blocked || !u.alerts) return;
  if (inQuietHours(new Date(), u.quiet_start, u.quiet_end)) return;
  await queue.run(tgId, async () => {
    try {
      await bot.api.sendMessage(tgId, text);
    } catch (e) {
      log('send failed', tgId, (e as Error).message);
    }
  });
}

async function pollStatus(): Promise<void> {
  try {
    const s = await api.status();
    lastStatusAt = Date.now();
    const alert = evaluateHamster(prevHamster, s);
    prevHamster = s.coreStatus;
    if (!alert) return;
    const users = db.prepare('SELECT tg_id FROM users WHERE blocked = 0 AND alerts = 1').all() as { tg_id: string }[];
    const text = s.coreStatus === 'SPINNING'
      ? `🐹 Hamster đang chạy — ${(s.rpmMilli / 1000).toFixed(2)} rpm\nBlock ${s.blockHeight}`
      : `😴 Hamster đã dừng — block ${s.blockHeight} (${(s.blockProgress / 1e9 * 100).toFixed(1)}%)`;
    for (const u of users) {
      if (firstTime(db, u.tg_id, alert.key)) await notify(u.tg_id, text);
    }
  } catch (e) {
    log('status poll failed', (e as Error).message);
  }
}

async function pollWallets(): Promise<void> {
  const byAddress = new Map<string, string[]>();
  for (const w of allWallets(db)) {
    const k = w.address.toLowerCase();
    if (!byAddress.has(k)) byAddress.set(k, []);
    byAddress.get(k)!.push(w.tg_id);
  }
  for (const [address, watchers] of byAddress) {
    let acct;
    try {
      acct = await api.account(address);
    } catch (e) {
      log('account failed', address, (e as Error).message);
      continue;
    }
    const prev = prevAccounts.get(address) ?? null;
    for (const tgId of watchers) {
      const u = getUser(db, tgId);
      if (!u || !u.alerts || u.blocked) continue;
      const alerts = evaluateAccount(prev, acct, BigInt(u.threshold));
      for (const a of alerts) {
        if (!firstTime(db, tgId, a.key)) continue;
        if (a.kind === 'claim') {
          await notify(tgId, `💰 Claimable: ${formatSqk(a.value ?? 0n)}\nVí ${address.slice(0, 6)}…${address.slice(-4)}\nMở app để ký: https://sepolia.squeekchain.com/genesis/me`);
        } else if (a.kind === 'cooldown') {
          await notify(tgId, `🔁 Squeek #${a.tokenId} đã hết cooldown merge.\nVí ${address.slice(0, 6)}…${address.slice(-4)}`);
        }
      }
    }
    prevAccounts.set(address, snapshot(acct));
  }
}

async function healthcheck(): Promise<void> {
  const url = process.env.HEALTHCHECK_URL;
  if (!url) return;
  try {
    await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch { /* ignore */ }
}

async function main(): Promise<void> {
  log('starting', { dryRun: cfg.dryRun, api: cfg.apiBase, db: cfg.dbPath });
  pruneSent(db);
  await pollStatus();
  await pollWallets();

  const statusTimer = setInterval(pollStatus, cfg.pollStatusMs);
  const walletTimer = setInterval(pollWallets, cfg.pollWalletMs);
  const healthTimer = setInterval(healthcheck, 5 * 60_000);
  const pruneTimer = setInterval(() => pruneSent(db), 24 * 3600_000);

  if (!cfg.dryRun) {
    await bot.start({ onStart: (me) => log('bot @' + me.username + ' ready') });
  } else {
    log('DRY_RUN: không kết nối Telegram; giữ poll để kiểm tra dữ liệu');
  }

  const shutdown = async () => {
    clearInterval(statusTimer); clearInterval(walletTimer);
    clearInterval(healthTimer); clearInterval(pruneTimer);
    try { await bot.stop(); } catch { /* ignore */ }
    log('stopped');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => { console.error(e); process.exit(1); });
