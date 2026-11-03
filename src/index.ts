import { loadConfig } from './config.ts';
import { createBot, registerCommands } from './bot.ts';
import { alertActivity, alertBlock, alertClaim, alertCooldown, alertHamster, digestMsg, type Lang } from './format.ts';
import { ChatQueue, inQuietHours } from './queue.ts';
import { isTransientTelegramError, retryDelayMs } from './retry.ts';
import { claimAlertDue, evaluateAccount, hamsterRunMs, isHamsterRunning, snapshot, stepHamster, type AccountState, type HamsterState } from './rules.ts';
import {
  allWallets, firstTime, getMeta, getUser, markDigest, newActivity, pruneActivity, pruneSent, setMeta, stats,
} from './db.ts';

const cfg = loadConfig();
const { bot, db, api } = createBot(cfg);
const queue = new ChatQueue(1100);
const prevAccounts = new Map<string, AccountState>();
let hamsterTrack: HamsterState = { confirmed: null, pending: null, count: 0 };
let lastRunningAt = 0;
let lastWorkUnits = 0;
let lastObservedAt = '';
let lastStatusOkAt = 0;
let statusFailures = 0;

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

const langOf = (u: { lang: string }): Lang => (u.lang === 'vi' ? 'vi' : 'en');

async function notify(tgId: string, text: string, force = false): Promise<void> {
  const u = getUser(db, tgId);
  if (!u || u.blocked || !u.alerts) return;
  if (!force && inQuietHours(new Date(), u.quiet_start, u.quiet_end)) return;
  await queue.run(tgId, async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await bot.api.sendMessage(tgId, text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
        return;
      } catch (e: any) {
        const transient = isTransientTelegramError(e);
        if (!transient || attempt === 3) {
          log('send failed', tgId, `attempt ${attempt}`, e?.message ?? String(e));
          return;
        }
        const wait = retryDelayMs(attempt, Number(e?.parameters?.retry_after));
        log('send retry', tgId, `attempt ${attempt}`, `${wait}ms`, e?.message ?? String(e));
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  });
}

function usersWith(column: 'alerts' | 'block_alerts' | 'digest' | 'hamster_alerts'): { tg_id: string }[] {
  return db.prepare(`SELECT tg_id FROM users WHERE blocked = 0 AND ${column} = 1`).all() as { tg_id: string }[];
}

/** #5: bánh xe chạy/dừng. */
async function pollStatus(): Promise<void> {
  try {
    const s = await api.status();
    lastStatusOkAt = Date.now();
    if (statusFailures > 0) { log('status recovered after', statusFailures, 'failure(s)'); statusFailures = 0; }
    // The sensor publishes every ~10 s; poll faster than that only to catch the
    // new sample sooner. Ignore duplicate reads of the same sample entirely.
    if (s.observedAt && s.observedAt === lastObservedAt) return;
    lastObservedAt = s.observedAt ?? s.generatedAt;
    const work = Number(s.cumulativeWorkUnits) || 0;
    const workDelta = lastWorkUnits > 0 ? Math.max(0, work - lastWorkUnits) : 0;
    lastWorkUnits = work;
    const runningNow = isHamsterRunning(s.coreStatus, s.rpmMilli, workDelta);
    if (hamsterTrack.confirmed === null) {
      // First observation after a restart: no transition to report, but the run
      // marker must match reality or the next duration would be wrong.
      setMeta(db, 'hamster_since', runningNow ? String(Date.now()) : '');
    }
    if (runningNow) lastRunningAt = Date.now();
    // Poll runs at 4 s: start on the first turning sample, stop after two quiet
    // ones (~8 s) — the sensor itself only publishes every 10 s.
    const step = stepHamster(hamsterTrack, runningNow, runningNow ? 1 : 2);
    hamsterTrack = step.state;
    if (step.transition !== null) {
      const running = step.transition;
      const sinceStored = Number(getMeta(db, 'hamster_since') ?? '0') || null;
      const endMs = running ? Date.now() : (lastRunningAt || Date.now());
      const { runMs, nextSince } = hamsterRunMs(running, sinceStored, endMs);
      setMeta(db, 'hamster_since', nextSince ? String(nextSince) : '');
      log('hamster', running ? 'running' : 'stopped', runMs ? `${Math.round(runMs / 1000)}s` : '');
      for (const u of usersWith('hamster_alerts')) {
        const user = getUser(db, u.tg_id);
        if (!user) continue;
        await notify(u.tg_id, alertHamster(langOf(user), s, runMs));
      }
    }
    await maybeBlockAlert(s.settledHeight ?? s.blockHeight);
  } catch (e) {
    statusFailures += 1;
    log('status poll failed', `#${statusFailures}`, (e as Error).message);
  }
}

/** #6: block hoàn thành + SQK phát ra. */
async function maybeBlockAlert(height: number): Promise<void> {
  const last = Number(getMeta(db, 'last_block') ?? '0');
  if (height <= last) return;
  setMeta(db, 'last_block', String(height));
  if (last === 0) return; // lần đầu: lấy mốc, không báo

  let mintedDelta = 0n;
  try {
    const eco: any = await api.economy();
    const minted = BigInt(eco?.supply?.miningMintedBaseUnits ?? '0');
    const prev = BigInt(getMeta(db, 'last_minted') ?? '0');
    if (prev > 0n && minted > prev) mintedDelta = minted - prev;
    setMeta(db, 'last_minted', minted.toString());
  } catch { /* vẫn báo block */ }

  for (const u of usersWith('block_alerts')) {
    const user = getUser(db, u.tg_id);
    if (!user) continue;
    const text = alertBlock(langOf(user), {
      height,
      minted: mintedDelta > 0n ? mintedDelta : null,
    });
    if (firstTime(db, u.tg_id, `block:${height}`)) await notify(u.tg_id, text);
  }
}

/** #1/#3: claimable + cooldown; #7: biến động ví. */
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
      const threshold = BigInt(u.threshold);
      const memoKey = `claimalert:${tgId}:${address.toLowerCase()}`;
      const raw = getMeta(db, memoKey);
      const memo = raw ? { amount: BigInt(raw.split(':')[0] || '0'), at: Number(raw.split(':')[1] || 0) } : null;
      if (claimAlertDue(acct.claimable, threshold, memo, Date.now(), cfg.claimAlertMinHours)) {
        await notify(tgId, alertClaim(langOf(u), { address, amount: acct.claimable, threshold }));
        setMeta(db, memoKey, `${acct.claimable}:${Date.now()}`);
        log('claim alert', tgId, address, String(acct.claimable));
      }

      for (const a of evaluateAccount(prev, acct, threshold)) {
        if (!firstTime(db, tgId, a.key)) continue;
        if (a.kind === 'cooldown') {
          await notify(tgId, alertCooldown(langOf(u), { address, tokenId: a.tokenId ?? '?' }));
        }
      }
    }
    prevAccounts.set(address, snapshot(acct));

    try {
      const items = await api.activity(address);
      // Lần đầu thấy địa chỉ: đánh dấu toàn bộ activity cũ là đã biết (không bắn loạt tin cũ).
      if (prev === null) {
        for (const it of items) newActivity(db, address, it.id);
        continue;
      }
      for (const it of items) {
        if (it.kind === 'rewards_claimed') continue;
        if (!newActivity(db, address, it.id)) continue;
        for (const tgId of watchers) {
          const user = getUser(db, tgId);
          if (!user) continue;
          await notify(tgId, alertActivity(langOf(user), {
            address, kind: it.kind,
            amount: it.amount > 0n ? it.amount : null,
            tx: it.txHash || undefined,
          }));
        }
      }
    } catch (e) {
      log('activity failed', address, (e as Error).message);
    }
  }
}

/** #8: digest hằng ngày. */
async function maybeDigest(): Promise<void> {
  const now = new Date();
  if (now.getHours() !== cfg.digestHour) return;
  const day = now.toISOString().slice(0, 10);
  for (const u of usersWith('digest')) {
    const user = getUser(db, u.tg_id);
    if (!user || user.last_digest === day) continue;

    const wallets = allWallets(db).filter((w) => w.tg_id === u.tg_id);
    if (!wallets.length) { markDigest(db, u.tg_id, day); continue; }

    let claimable = 0n;
    let ready = 0;
    for (const w of wallets) {
      try {
        const a = await api.account(w.address);
        claimable += a.claimable;
        ready += a.tokens.filter((t) => t.mergeState === 'ready').length;
      } catch { /* bỏ qua ví lỗi */ }
    }
    let height = 0;
    try { height = (await api.status()).blockHeight; } catch { /* ignore */ }

    await notify(u.tg_id, digestMsg(langOf(user), {
      day, wallets: wallets.length, claimable, ready, height,
    }), true);
    markDigest(db, u.tg_id, day);
  }
}

/**
 * Dead-man's switch: ping healthchecks.io mỗi 5 phút.
 * Chỉ ping "ok" khi dữ liệu còn tươi; mất API quá 3 chu kỳ → ping /fail
 * để dịch vụ ngoài báo động dù tiến trình vẫn sống.
 */
async function healthcheck(): Promise<void> {
  const url = process.env.HEALTHCHECK_URL;
  if (!url || lastStatusOkAt === 0) return;
  const staleAfter = Math.max(120_000, cfg.pollStatusMs * 3);
  const ok = Date.now() - lastStatusOkAt < staleAfter;
  const target = ok ? url : url.replace(/\/+$/, '') + '/fail';
  try { await fetch(target, { signal: AbortSignal.timeout(8000) }); } catch { /* ignore */ }
}

async function main(): Promise<void> {
  log('starting', { dryRun: cfg.dryRun, api: cfg.apiBase, db: cfg.dbPath, rpc: Boolean(cfg.rpcUrl) });
  pruneSent(db);
  pruneActivity(db);
  await pollStatus();
  await pollWallets();

  const t1 = setInterval(pollStatus, cfg.pollStatusMs);
  const t2 = setInterval(pollWallets, cfg.pollWalletMs);
  const t3 = setInterval(healthcheck, 5 * 60_000);
  const t4 = setInterval(() => { pruneSent(db); pruneActivity(db); }, 24 * 3600_000);
  const t5 = setInterval(maybeDigest, 60_000);
  const t6 = setInterval(() => {
    const st = stats(db);
    log('alive', `users=${st.users}`, `wallets=${st.wallets}`, `blocked=${st.blocked}`, `statusAge=${Math.round((Date.now() - lastStatusOkAt) / 1000)}s`);
  }, 60 * 60_000);

  if (!cfg.dryRun) {
    try { await registerCommands(bot); } catch (e) { log('setMyCommands failed', (e as Error).message); }
    await bot.start({ onStart: (me) => log('bot @' + me.username + ' ready') });
  }
  else log('DRY_RUN: không kết nối Telegram; giữ poll để kiểm tra dữ liệu');

  const shutdown = async () => {
    for (const t of [t1, t2, t3, t4, t5, t6]) clearInterval(t);
    try { await bot.stop(); } catch { /* ignore */ }
    log('stopped');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => { console.error(e); process.exit(1); });
