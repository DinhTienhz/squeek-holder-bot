
import { Bot, webhookCallback } from 'grammy';
import { ApiClient, type Account } from '../../src/api.ts';
import { activityBatch, alertActivity, alertBlock, alertClaim, alertCooldown, alertHamster, digestMsg, type Lang } from '../../src/format.ts';
import { ChatQueue, inQuietHours } from '../../src/queue.ts';
import { claimAlertDue, evaluateAccount, hamsterRunMs, isHamsterRunning, snapshot, type AccountState } from '../../src/rules.ts';
import { loadConfig } from './config.ts';
import { stakingTotals } from '../../src/chain.ts';
import { createBot, registerCommands } from './bot.ts';
import {
  allWallets, firstTime, getMeta, getUser, markDigest, newActivity, pruneActivity, pruneSent, setMeta, type User,
} from './db.ts';

type Env = {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  BOT_TOKEN?: string;
  API_BASE?: string;
  ADMIN_IDS?: string;
  MAX_WALLETS?: string;
  WALLET_BATCH?: string;
  WALLET_CONCURRENCY?: string;
  RPC_URL?: string;
  DEFAULT_THRESHOLD_SQK?: string;
  DIGEST_HOUR?: string;
  CLAIM_ALERT_MIN_HOURS?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  HEALTHCHECK_URL?: string;
};

const langOf = (u: { lang: string }): Lang => (u.lang === 'vi' ? 'vi' : 'en');
const queue = new ChatQueue(1100);

async function notify(env: Env, bot: Bot, tgId: string, text: string, force = false): Promise<void> {
  const u = await getUser(env.DB, tgId);
  if (!u || u.blocked || !u.alerts) return;
  if (!force && inQuietHours(new Date(), u.quiet_start, u.quiet_end)) return;
  await queue.run(tgId, async () => {
    try {
      await bot.api.sendMessage(tgId, text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    } catch { /* a blocked bot or a bad chat id must not fail the cron */ }
  });
}

function serState(s: AccountState): string {
  return JSON.stringify({ claimable: s.claimable.toString(), mergeState: [...s.mergeState.entries()] });
}
function deState(raw: string | null): AccountState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { claimable: string; mergeState: [string, { state: string; nextMergeHeight: number }][] };
    return { claimable: BigInt(o.claimable), mergeState: new Map(o.mergeState) };
  } catch { return null; }
}

/** One sample of the sensor: hamster start/stop plus settlement batches. */
async function pollStatus(env: Env, bot: Bot, api: ApiClient, cfg: ReturnType<typeof loadConfig>): Promise<void> {
  const s = await api.status();
  const observed = s.observedAt ?? s.generatedAt;
  const lastObserved = await getMeta(env.DB, 'last_observed');
  if (observed && observed === lastObserved) return;
  await setMeta(env.DB, 'last_observed', observed ?? '');

  const work = Number(s.cumulativeWorkUnits) || 0;
  const prevWork = Number(await getMeta(env.DB, 'last_work')) || 0;
  const workDelta = prevWork > 0 ? Math.max(0, work - prevWork) : 0;
  await setMeta(env.DB, 'last_work', String(work));

  const runningNow = isHamsterRunning(s.coreStatus, s.rpmMilli, workDelta);
  const confirmedRaw = await getMeta(env.DB, 'hamster_state');
  const confirmed = confirmedRaw === 'running' ? true : confirmedRaw === 'stopped' ? false : null;

  if (confirmed === null) {
    await setMeta(env.DB, 'hamster_since', runningNow ? String(Date.now()) : '');
    await setMeta(env.DB, 'hamster_state', runningNow ? 'running' : 'stopped');
    return;
  }
  if (runningNow === confirmed) {
    await setMeta(env.DB, 'hamster_pending', '');
    return;
  }
  const pendingRaw = await getMeta(env.DB, 'hamster_pending');
  const pending = pendingRaw ? JSON.parse(pendingRaw) as { value: boolean; count: number } : { value: runningNow, count: 0 };
  if (pending.value !== runningNow) pending.value = runningNow;
  pending.count += 1;
  const need = runningNow ? 2 : 3;
  if (pending.count < need) {
    await setMeta(env.DB, 'hamster_pending', JSON.stringify(pending));
    return;
  }

  const sinceStored = Number(await getMeta(env.DB, 'hamster_since') ?? '0') || null;
  const endMs = runningNow ? Date.now() : (Date.now());
  const { runMs, nextSince } = hamsterRunMs(runningNow, sinceStored, endMs);
  await setMeta(env.DB, 'hamster_pending', '');
  await setMeta(env.DB, 'hamster_state', runningNow ? 'running' : 'stopped');
  await setMeta(env.DB, 'hamster_since', nextSince ? String(nextSince) : '');

  const rows = (await env.DB.prepare('SELECT tg_id FROM users WHERE blocked = 0 AND hamster_alerts = 1').all<{ tg_id: string }>()).results;
  for (const row of rows) {
    const user = await getUser(env.DB, row.tg_id);
    if (!user) continue;
    await notify(env, bot, row.tg_id, alertHamster(langOf(user), s, runMs, runningNow ? undefined : endMs));
  }
}

async function pollSettlements(env: Env, bot: Bot, api: ApiClient): Promise<void> {
  let list;
  try { list = await api.settlements(); } catch { return; }
  if (!list.length) return;
  const lastHash = await getMeta(env.DB, 'last_settlement') ?? '';
  if (!lastHash) { await setMeta(env.DB, 'last_settlement', list[0].hash); return; }
  const idx = list.findIndex((x) => x.hash === lastHash);
  if (idx === -1) { await setMeta(env.DB, 'last_settlement', list[0].hash); return; }

  for (const st of list.slice(0, idx).reverse()) {
    if (st.minted === null) break;
    if (st.status && st.status !== 'safe') continue;
    const rows = (await env.DB.prepare('SELECT tg_id FROM users WHERE blocked = 0 AND block_alerts = 1').all<{ tg_id: string }>()).results;
    for (const row of rows) {
      const user = await getUser(env.DB, row.tg_id);
      if (!user) continue;
      if (await firstTime(env.DB, row.tg_id, `block:${st.last}`)) {
        await notify(env, bot, row.tg_id, alertBlock(langOf(user), {
          first: st.first, last: st.last, blocks: st.blocks, minted: st.minted,
        }));
      }
    }
    await setMeta(env.DB, 'last_settlement', st.hash);
  }
}

async function pollWallet(env: Env, bot: Bot, api: ApiClient, address: string, watchers: string[], users: Map<string, User>): Promise<void> {
  let acct: Account;
  try { acct = await api.account(address); } catch { return; }

  const row = await env.DB.prepare('SELECT state FROM snapshots WHERE address = ?').bind(address).first<{ state: string }>();
  const prev = deState(row?.state ?? null);
  const cfg = loadConfig(env);

  for (const tgId of watchers) {
    const u = users.get(tgId);
    if (!u || !u.alerts || u.blocked) continue;
    const threshold = BigInt(u.threshold);
    const memoKey = `claimalert:${tgId}:${address.toLowerCase()}`;
    const raw = await getMeta(env.DB, memoKey);
    const memo = raw ? { amount: BigInt(raw.split(':')[0] || '0'), at: Number(raw.split(':')[1] || 0) } : null;
    if (claimAlertDue(acct.claimable, threshold, memo, Date.now(), cfg.claimAlertMinHours)) {
      await notify(env, bot, tgId, alertClaim(langOf(u), { address, amount: acct.claimable, threshold }));
      await setMeta(env.DB, memoKey, `${acct.claimable}:${Date.now()}`);
    }
    for (const a of evaluateAccount(prev, acct, threshold)) {
      if (!(await firstTime(env.DB, tgId, a.key))) continue;
      if (a.kind === 'cooldown') {
        await notify(env, bot, tgId, alertCooldown(langOf(u), { address, tokenId: a.tokenId ?? '?' }));
      }
    }
  }

  await env.DB.prepare('INSERT INTO snapshots (address, state, at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(address) DO UPDATE SET state = excluded.state, at = excluded.at')
    .bind(address, serState(snapshot(acct))).run();

  try {
    const items = await api.activity(address);
    if (prev === null) {
      for (const it of items) await newActivity(env.DB, address, it.id);
      return;
    }
    const fresh: typeof items = [];
    for (const it of items) if (await newActivity(env.DB, address, it.id)) fresh.push(it);
    if (!fresh.length) return;
    for (const tgId of watchers) {
      const user = users.get(tgId);
      if (!user || !user.alerts || user.blocked || !user.activity_alerts) continue;
      if (fresh.length === 1) {
        const it = fresh[0];
        await notify(env, bot, tgId, alertActivity(langOf(user), {
          address, kind: it.kind, amount: it.amount > 0n ? it.amount : null, tx: it.txHash || undefined,
        }));
      } else {
        await notify(env, bot, tgId, activityBatch(langOf(user), {
          address,
          items: fresh.map((it) => ({ kind: it.kind, amount: it.amount, tx: it.txHash || undefined })),
        }));
      }
    }
  } catch { /* activity is best-effort */ }
}

/** Poll a rotating slice of wallets so one minute stays inside the CPU budget. */
async function pollWallets(env: Env, bot: Bot, api: ApiClient): Promise<void> {
  const wallets = await allWallets(env.DB);
  if (!wallets.length) return;
  const byAddress = new Map<string, string[]>();
  for (const w of wallets) {
    const k = w.address.toLowerCase();
    if (!byAddress.has(k)) byAddress.set(k, []);
    byAddress.get(k)!.push(w.tg_id);
  }
  const users = new Map<string, User>();
  for (const row of (await env.DB.prepare('SELECT * FROM users').all<User>()).results) users.set(row.tg_id, row);

  const entries = [...byAddress.entries()];
  const batch = Math.max(5, Number(env.WALLET_BATCH ?? 40));
  const cursor = (Number(await getMeta(env.DB, 'wallet_cursor')) || 0) % entries.length;
  // Take at most `batch` distinct addresses, wrapping once around the ring.
  const take = Math.min(batch, entries.length);
  const todo: [string, string[]][] = [];
  for (let i = 0; i < take; i++) todo.push(entries[(cursor + i) % entries.length]);
  await setMeta(env.DB, 'wallet_cursor', String((cursor + take) % entries.length));

  const concurrency = Math.max(1, Number(env.WALLET_CONCURRENCY ?? 6));
  for (let i = 0; i < todo.length; i += concurrency) {
    await Promise.all(todo.slice(i, i + concurrency).map(([address, watchers]) => pollWallet(env, bot, api, address, watchers, users)));
  }
}

async function maybeDigest(env: Env, bot: Bot, api: ApiClient): Promise<void> {
  const now = new Date();
  const cfg = loadConfig(env);
  // The digest hour is Asia/Ho_Chi_Minh (UTC+7), matching the old Node bot.
  const vn = new Date(now.getTime() + 7 * 3600_000);
  if (vn.getUTCHours() !== cfg.digestHour) return;
  const day = vn.toISOString().slice(0, 10);
  const rows = (await env.DB.prepare('SELECT tg_id FROM users WHERE blocked = 0 AND digest = 1').all<{ tg_id: string }>()).results;
  for (const row of rows) {
    const user = await getUser(env.DB, row.tg_id);
    if (!user || user.last_digest === day) continue;
    const wallets = (await env.DB.prepare('SELECT * FROM wallets WHERE tg_id = ?').bind(row.tg_id).all<{ address: string }>()).results;
    if (!wallets.length) { await markDigest(env.DB, row.tg_id, day); continue; }
    let claimable = 0n, ready = 0, height = 0;
    const per: { address: string; claimable: bigint; ready: number }[] = [];
    for (const w of wallets) {
      try {
        const a = await api.account(w.address);
        const r = a.tokens.filter((t) => t.mergeState === 'ready').length;
        claimable += a.claimable; ready += r;
        per.push({ address: w.address, claimable: a.claimable, ready: r });
      } catch { /* skip a failing wallet */ }
    }
    try { height = (await api.status()).blockHeight; } catch { /* ignore */ }
    await notify(env, bot, row.tg_id, digestMsg(langOf(user), { day, wallets: wallets.length, claimable, ready, height, per }), true);
    await markDigest(env.DB, row.tg_id, day);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
    if (url.pathname !== '/telegram' || req.method !== 'POST') return new Response('not found', { status: 404 });
    const expected = env.TELEGRAM_WEBHOOK_SECRET ?? '';
    if (!expected) return new Response('webhook secret not configured', { status: 503 });
    if (req.headers.get('x-telegram-bot-api-secret-token') !== expected) {
      return new Response('forbidden', { status: 403 });
    }
    const cfg = loadConfig(env as unknown as Record<string, unknown>);
    if (!cfg.botToken) return new Response('bot not configured', { status: 503 });
    const { bot } = createBot(cfg, env.DB);
    if (cfg.botToken === '0:test') {
      (bot as any).botInfo = { id: 0, is_bot: true, first_name: 'test', username: 'test_bot',
        can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false };
    }
    return await (webhookCallback(bot, 'cloudflare-mod') as any)(req);
  },

  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    const started = Date.now();
    const cfg = loadConfig(env as unknown as Record<string, unknown>);
    if (!cfg.botToken) return;
    const bot = new Bot(cfg.botToken);
    const api = new ApiClient(cfg.apiBase);
    const minute = new Date().getUTCMinutes();

    await pollStatus(env, bot, api, cfg).catch(() => {});
    if (minute % 3 === 0) await pollSettlements(env, bot, api).catch(() => {});
    await pollWallets(env, bot, api).catch(() => {});
    if (minute === 0) {
      await maybeDigest(env, bot, api).catch(() => {});
      await pruneSent(env.DB, 14).catch(() => {});
      await pruneActivity(env.DB, 30).catch(() => {});
      await env.DB.prepare("DELETE FROM snapshots WHERE at < datetime('now', '-90 days')").run().catch(() => {});
    }
    // Dead-man's switch: an external checker alerts if these pings stop.
    if (env.HEALTHCHECK_URL) {
      try { await fetch(env.HEALTHCHECK_URL, { method: 'GET' }); } catch { /* ping is best-effort */ }
    }
    console.log(JSON.stringify({ cron: event.cron, ms: Date.now() - started, minute }));
  },
};
