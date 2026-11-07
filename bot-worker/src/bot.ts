import { Bot, type Context } from 'grammy';
import type { Config } from './config.ts';
import { ApiClient } from '../../src/api.ts';
import { isHamsterRunning, ladderPowerGain, planLadder } from '../../src/rules.ts';
import { stakingClaimable, stakingTotals } from '../../src/chain.ts';
import { COMMANDS } from '../../src/commands.ts';
import { parseQuietRange } from '../../src/queue.ts';
import {
  alertBlock, alertCooldown, alertHamster, addrShort, claimExactMsg, digestMsg, esc, fmtInt, fmtSqk, fullAddr,
  activityList, help, ladderMsg, mergeMsg, privacy, statusMsg, t as tr, walletAdded, walletList, welcome, type Lang,
} from '../../src/format.ts';
import {
  addWallet, getUser, listWallets, removeWallet, setAlerts, setBlockAlerts, setHamsterAlerts,
  setActivityAlerts, setMarketAlerts, setBlocked, setDigest, setLang, setQuiet, setThreshold, stats, upsertUser, wipeUser, type User,
} from './db.ts';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const MSG = {
  vi: {
    exists: '⚠️ Ví này đã có trong danh sách.',
    limit: '⚠️ Đã đạt giới hạn số ví.',
    removed: '🗑 Đã bỏ {n} ví.',
    notFound: '⚠️ Không tìm thấy ví đó.',
    mergeNone: '✅ Không có Squeek nào merge được lúc này.',
    ladderNone: 'ℹ️ Không đủ cặp cùng level để merge.',
    blockOn: '⛏ Đã bật thông báo block.',
    blockOff: '⛏ Đã tắt thông báo block.',
    digestOn: '📊 Đã bật digest hằng ngày.',
    digestOff: '📊 Đã tắt digest.',
    quietOn: '🌙 Im lặng {range} (giờ máy).',
    quietOff: '🌙 Đã tắt im lặng.',
    badQuiet: '⚠️ Sai định dạng.\nVí dụ: <code>/quiet 22:00-07:00</code>',
    alertsOn: '🔔 Đã bật thông báo.',
    alertsNow: '🔔 Thông báo: <b>{state}</b>\nĐổi bằng <code>/alerts on</code> hoặc <code>/alerts off</code>',
    alertsOff: '🔕 Đã tắt thông báo.',
    blockNow: '⛏ Block alerts: <b>{state}</b>\nĐổi bằng <code>/block on</code> hoặc <code>/block off</code>',
    hamsterOn: '🐹 Đã bật cảnh báo hamster chạy/dừng.',
    hamsterOff: '🐹 Đã tắt cảnh báo hamster.',
    hamsterNow: '🐹 Cảnh báo hamster: <b>{state}</b>\nĐổi bằng <code>/hamster on</code> hoặc <code>/hamster off</code>',
    activityOn: '🔔 Đã bật theo dõi mọi hoạt động ví (gồm claim phần thưởng).',
    activityOff: '🔕 Đã tắt theo dõi hoạt động ví.',
    activityNow: '🔔 Hoạt động ví: <b>{state}</b>\nĐổi bằng <code>/activity on</code> hoặc <code>/activity off</code>\nXem gần đây: <code>/activity 0x…</code>',
    marketOn: '🏪 Đã bật cảnh báo chợ OTC (list, bid, sold).',
    marketOff: '🏪 Đã tắt cảnh báo chợ OTC.',
    marketNow: '🏪 Cảnh báo chợ OTC: <b>{state}</b>\nĐổi bằng <code>/market on</code> hoặc <code>/market off</code>',
    digestNow: '📊 Digest: <b>{state}</b>\nĐổi bằng <code>/digest on</code> hoặc <code>/digest off</code>',
    quietNow: '🌙 Im lặng: <b>{state}</b>\nĐổi bằng <code>/quiet 22:00-07:00</code> hoặc <code>/quiet off</code>',
    threshold: '🎯 Ngưỡng báo claim: <b>{amount}</b>',
    thresholdNow: '🎯 Ngưỡng hiện tại: <b>{amount}</b>\nĐổi bằng <code>/threshold 5</code>',
    badNum: '⚠️ Số không hợp lệ.',
    langSet: '🇻🇳 Đã đổi sang tiếng Việt. Đổi lại bằng <code>/lang en</code>.',
    langNow: '🌐 Ngôn ngữ hiện tại: <b>{lang}</b>\nĐổi bằng <code>/lang vi</code> hoặc <code>/lang en</code>',
    badLang: '⚠️ Chỉ hỗ trợ <code>vi</code> hoặc <code>en</code>.\nVí dụ: <code>/lang en</code>',
    deleted: '🗑 Đã xoá toàn bộ dữ liệu của bạn.',
    adminOnly: '⛔ Lệnh quản trị.',
    stats: '👥 Users: <b>{users}</b>\n👛 Wallets: <b>{wallets}</b>\n⛔ Blocked: <b>{blocked}</b>',
    banned: '⛔ Đã chặn <code>{id}</code>.',
    unbanned: '✅ Đã bỏ chặn <code>{id}</code>.',
    noId: '⚠️ Thiếu ID.',
  },
  en: {
    exists: '⚠️ Wallet already on your list.',
    limit: '⚠️ Wallet limit reached.',
    removed: '🗑 Removed {n} wallet(s).',
    notFound: '⚠️ Wallet not found.',
    mergeNone: '✅ No Squeek is mergeable right now.',
    ladderNone: 'ℹ️ Not enough same-level pairs to merge.',
    blockOn: '⛏ Block alerts on.',
    blockOff: '⛏ Block alerts off.',
    digestOn: '📊 Daily digest on.',
    digestOff: '📊 Daily digest off.',
    quietOn: '🌙 Quiet hours {range} (server time).',
    quietOff: '🌙 Quiet hours off.',
    badQuiet: '⚠️ Bad format.\nExample: <code>/quiet 22:00-07:00</code>',
    alertsOn: '🔔 Alerts on.',
    alertsNow: '🔔 Alerts: <b>{state}</b>\nChange with <code>/alerts on</code> or <code>/alerts off</code>',
    alertsOff: '🔕 Alerts off.',
    blockNow: '⛏ Block alerts: <b>{state}</b>\nChange with <code>/block on</code> or <code>/block off</code>',
    hamsterOn: '🐹 Hamster started/stopped alerts on.',
    hamsterOff: '🐹 Hamster alerts off.',
    hamsterNow: '🐹 Hamster alerts: <b>{state}</b>\nChange with <code>/hamster on</code> or <code>/hamster off</code>',
    activityOn: '🔔 Wallet activity tracking on (includes rewards claimed).',
    activityOff: '🔕 Wallet activity tracking off.',
    activityNow: '🔔 Wallet activity: <b>{state}</b>\nChange with <code>/activity on</code> or <code>/activity off</code>\nRecent: <code>/activity 0x…</code>',
    marketOn: '🏪 OTC market alerts on (listings, bids, sales).',
    marketOff: '🏪 OTC market alerts off.',
    marketNow: '🏪 OTC market alerts: <b>{state}</b>\nChange with <code>/market on</code> or <code>/market off</code>',
    digestNow: '📊 Digest: <b>{state}</b>\nChange with <code>/digest on</code> or <code>/digest off</code>',
    quietNow: '🌙 Quiet hours: <b>{state}</b>\nChange with <code>/quiet 22:00-07:00</code> or <code>/quiet off</code>',
    threshold: '🎯 Claim threshold: <b>{amount}</b>',
    thresholdNow: '🎯 Current threshold: <b>{amount}</b>\nChange with <code>/threshold 5</code>',
    badNum: '⚠️ Invalid number.',
    langSet: '🇬🇧 Language set to English. Switch back with <code>/lang vi</code>.',
    langNow: '🌐 Current language: <b>{lang}</b>\nChange with <code>/lang vi</code> or <code>/lang en</code>',
    badLang: '⚠️ Only <code>vi</code> or <code>en</code> are supported.\nExample: <code>/lang vi</code>',
    deleted: '🗑 Your data was deleted.',
    adminOnly: '⛔ Admin only.',
    stats: '👥 Users: <b>{users}</b>\n👛 Wallets: <b>{wallets}</b>\n⛔ Blocked: <b>{blocked}</b>',
    banned: '⛔ Blocked <code>{id}</code>.',
    unbanned: '✅ Unblocked <code>{id}</code>.',
    noId: '⚠️ Missing ID.',
  },
} as const;

function evenSplit(ids: string[], total: bigint): { tokenId: string; amount: bigint }[] {
  if (!ids.length) return [];
  const each = total / BigInt(ids.length);
  return ids.map((tokenId) => ({ tokenId, amount: each }));
}

export function createBot(cfg: Config, db: D1Database) {
  const api = new ApiClient(cfg.apiBase);
  const bot = new Bot(cfg.botToken || '0:test');

  const userOf = async (id: string | number): Promise<User> => upsertUser(db, String(id));
  const isAdmin = (id: string | number) => cfg.adminIds.has(String(id));
  const langOf = (u: User): Lang => (u.lang === 'vi' ? 'vi' : 'en');
  const m = (u: User, key: keyof typeof MSG.vi, vars: Record<string, string | number> = {}): string => {
    let s: string = MSG[langOf(u)][key];
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };

  const stateWord = (u: User, on: boolean): string =>
    langOf(u) === 'vi' ? (on ? 'đang bật' : 'đang tắt') : (on ? 'on' : 'off');

  const reply = (ctx: Context, text: string) =>
    ctx.reply(text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }).catch(() => undefined);

  bot.command('start', async (ctx) => {
    const id = String(ctx.from!.id);
    const isNew = !await getUser(db, id);
    const u = await userOf(id);
    if (u.blocked) return;
    const hint = langOf(u) === 'vi'
      ? '👉 <i>Mới dùng? Gõ /help để xem mọi lệnh, /status để xem chain trực tiếp.</i>'
      : '👉 <i>New here? Type /help for every command, /status to see the chain live.</i>';
    await reply(ctx, isNew ? `${welcome(langOf(u))}\n\n${hint}` : welcome(langOf(u)));
  });

  bot.command('help', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    await reply(ctx, help(langOf(u), isAdmin(ctx.from!.id)));
  });

  bot.command('watch', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    if (u.blocked) return;
    const [addr, ...rest] = (ctx.match ?? '').trim().split(/\s+/);
    if (!addr || !ADDRESS.test(addr)) return void (await reply(ctx, tr(langOf(u), 'badAddr')));
    const label = rest.join(' ') || null;
    const r = await addWallet(db, u.tg_id, addr.toLowerCase(), label, cfg.maxWallets);
    if (!r.ok) return void (await reply(ctx, m(u, r.reason === 'limit' ? 'limit' : 'exists')));
    await reply(ctx, walletAdded(langOf(u), addr.toLowerCase(), label));
  });

  bot.command('unwatch', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    const key = (ctx.match ?? '').trim();
    if (!key) return void (await reply(ctx, m(u, 'notFound')));
    const n = await removeWallet(db, u.tg_id, key);
    await reply(ctx, m(u, n ? 'removed' : 'notFound', { n }));
  });

  bot.command('list', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    const ws = await listWallets(db, u.tg_id);
    if (!ws.length) return void (await reply(ctx, tr(langOf(u), 'noWallet')));

    const entries = await Promise.all(ws.map(async (w) => {
      try {
        const a = await api.account(w.address);
        return [w.address.toLowerCase(), {
          claimable: a.claimable,
          tokens: a.tokens.length,
          ready: a.tokens.filter((t) => t.mergeState === 'ready').length,
        }] as const;
      } catch (e) {
        console.error('list account failed', w.address, (e as Error).message);
        return null;
      }
    }));
    const stats: Record<string, { claimable: bigint; tokens: number; ready: number }> = {};
    for (const e of entries) if (e) stats[e[0]] = e[1];
    await reply(ctx, walletList(langOf(u), ws, cfg.maxWallets, stats));
  });

  bot.command('status', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    try {
      const [s, eco] = await Promise.all([api.status(), api.economy().catch(() => null)]);
      // Age must come from the sensor sample, not the HTTP response time.
      const stamp = Date.parse(s.observedAt || s.generatedAt);
      const age = Math.max(0, Math.round((Date.now() - stamp) / 1000));
      const minted = eco?.supply?.miningMintedBaseUnits ? BigInt(eco.supply.miningMintedBaseUnits) : undefined;
      const cap = eco?.supply?.capBaseUnits ? BigInt(eco.supply.capBaseUnits) : undefined;
      const staleAfter = s.staleAfterSeconds || 120;
      const spinning = isHamsterRunning(s.coreStatus, s.rpmMilli);
      const note = age > staleAfter
        ? (spinning
            ? (langOf(u) === 'en'
                ? `⚠️ <i>sensor data is ${age}s old</i>`
                : `⚠️ <i>dữ liệu cảm biến cũ ${age}s</i>`)
            : (langOf(u) === 'en'
                ? `💤 <i>sensor paused while the hamster rests · last sample ${age}s ago</i>`
                : `💤 <i>cảm biến dừng vì hamster nghỉ · mẫu cuối ${age}s trước</i>`))
        : '';
      let stake: { nfts: bigint; nftLive: bigint; sqk: bigint; mined: bigint } | undefined;
      try {
        const staking = eco?.deployment?.components?.staking?.address as string | undefined;
        const nft = eco?.deployment?.components?.collection?.address as string | undefined;
        if (cfg.rpcUrl && staking && nft) {
          const totals = await stakingTotals(cfg.rpcUrl, staking, nft);
          stake = { nfts: totals.nftsStaked, nftLive: BigInt(eco?.nft?.live ?? '0'), sqk: totals.sqkStaked, mined: BigInt(eco?.supply?.miningMintedBaseUnits ?? '0') };
        }
      } catch { /* keep the status without staking totals */ }
      const text = statusMsg(langOf(u), { ...s, minted, cap, liveSupply: eco?.supply?.liveSupplyBaseUnits ? BigInt(eco.supply.liveSupplyBaseUnits) : undefined, premine: eco?.supply?.premintBaseUnits ? BigInt(eco.supply.premintBaseUnits) : undefined }, age, stake, langOf(u) === 'en' ? 'protocol-wide' : 'toàn protocol');
      await reply(ctx, text + (note ? `\n${note}` : ''));
    } catch {
      await reply(ctx, tr(langOf(u), 'apiDown'));
    }
  });

  const targetWallet = async (u: User, arg?: string): Promise<string | undefined> => {
    const ws = await listWallets(db, u.tg_id);
    if (arg && ADDRESS.test(arg.trim())) return arg.trim().toLowerCase();
    if (!ws.length) return undefined;
    if (ws.length === 1) return ws[0].address;
    // Several wallets: default to the one with the most Squeeks (then most claimable).
    const scored = await Promise.all(ws.map(async (w) => {
      try {
        const a = await api.account(w.address);
        return { addr: w.address, score: BigInt(a.tokenCount) * 10n ** 24n + a.claimable };
      } catch {
        return { addr: w.address, score: -1n };
      }
    }));
    scored.sort((x, y) => (y.score > x.score ? 1 : y.score < x.score ? -1 : 0));
    return scored[0].addr;
  };

  const failLine = (lang: Lang, addr: string) =>
    `⚠️ <b>${addrShort(addr)}</b>\n<i>${lang === 'en' ? 'API unreachable for this wallet' : 'API không phản hồi cho ví này'}</i>`;

  bot.command('claim', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    const lang = langOf(u);
    const raw = (ctx.match ?? '').trim();
    const addrs = raw
      ? [await targetWallet(u, ctx.match)].filter((x): x is string => !!x)
      : (await listWallets(db, u.tg_id)).map((w) => w.address);
    if (!addrs.length) return void (await reply(ctx, tr(lang, 'noWallet')));

    const parts: string[] = [];
    let sum = 0n;
    // Rewards are account-level now: one claim pays everything, no per-token split.
    const eco = await api.economy().catch(() => null);
    const staking = eco?.deployment?.components?.staking?.address as string | undefined;
    for (const addr of addrs) {
      try {
        const a = await api.account(addr);
        let total = a.claimable;
        let source: 'chain' | 'api' = 'api';
        if (staking && cfg.rpcUrl) {
          try {
            total = await stakingClaimable(cfg.rpcUrl, staking, addr);
            source = 'chain';
          } catch { /* keep the API figure and label it */ }
        }
        sum += total;
        parts.push(claimExactMsg(lang, {
          address: addr,
          total,
          source,
          nftStaked: a.tokens.filter((t) => t.custody === 'staking').length,
          sqkStaked: a.stakedSqk,
        }));
      } catch {
        parts.push(failLine(lang, addr));
      }
    }
    if (addrs.length > 1 && sum > 0n) {
      parts.push(`<i>${lang === 'en' ? 'Total' : 'Tổng'}: ${fmtSqk(sum, lang)} · ${addrs.length} ${lang === 'en' ? 'wallets' : 'ví'}</i>`);
    }
    await reply(ctx, parts.join('\n\n'));
  });

  bot.command('ladder', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    const lang = langOf(u);
    const raw = (ctx.match ?? '').trim();
    const addrs = raw
      ? [await targetWallet(u, ctx.match)].filter((x): x is string => !!x)
      : (await listWallets(db, u.tg_id)).map((w) => w.address);
    if (!addrs.length) return void (await reply(ctx, tr(lang, 'noWallet')));

    let eco: any;
    try { eco = await api.economy(); } catch { return void (await reply(ctx, tr(lang, 'apiDown'))); }
    const basePower: number[] = (eco?.nft?.basePower ?? []).map(Number);
    const cooldowns: number[] = (eco?.nft?.cooldownBlocks ?? []).map(Number);

    const parts: string[] = [];
    for (const addr of addrs) {
      try {
        const a = await api.account(addr);
        const counts: Record<number, number> = {};
        for (const tok of a.tokens) counts[tok.level] = (counts[tok.level] ?? 0) + 1;
        const steps = planLadder(counts, cooldowns, basePower.length || 10);
        if (!steps.length) {
          parts.push(`🪜 <b>${addrShort(addr)}</b>\n<i>${lang === 'en' ? 'not enough same-level pairs' : 'không đủ cặp cùng level'}</i>`);
          continue;
        }
        const gain = ladderPowerGain(counts, basePower);
        parts.push(ladderMsg(lang, { address: addr, steps, before: gain.before, after: gain.after }));
      } catch {
        parts.push(failLine(lang, addr));
      }
    }
    await reply(ctx, parts.join('\n\n'));
  });

  bot.command('mergecheck', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    const lang = langOf(u);
    const raw = (ctx.match ?? '').trim();
    const addrs = raw
      ? [await targetWallet(u, ctx.match)].filter((x): x is string => !!x)
      : (await listWallets(db, u.tg_id)).map((w) => w.address);
    if (!addrs.length) return void (await reply(ctx, tr(lang, 'noWallet')));

    const parts: string[] = [];
    for (const addr of addrs) {
      try {
        const a = await api.account(addr);
        const ready = a.tokens.filter((x) => x.mergeState === 'ready').map((x) => ({ tokenId: x.tokenId, level: x.level }));
        const cooling = a.tokens.filter((x) => x.mergeState === 'cooldown').length;
        if (!ready.length) {
          parts.push(`🔁 <b>${addrShort(addr)}</b>\n<i>${lang === 'en' ? `nothing mergeable · ${cooling} cooling` : `không có gì merge được · ${cooling} đang cooldown`}</i>`);
          continue;
        }
        parts.push(mergeMsg(lang, { address: addr, ready, cooling }));
      } catch {
        parts.push(failLine(lang, addr));
      }
    }
    await reply(ctx, parts.join('\n\n'));
  });

  bot.command('threshold', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    const raw = (ctx.match ?? '').trim();
    if (!raw) {
      return void (await reply(ctx, m(u, 'thresholdNow', { amount: fmtSqk(BigInt(u.threshold), langOf(u)) })));
    }
    const v = Number(raw.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return void (await reply(ctx, m(u, 'badNum')));
    const base = BigInt(Math.round(v * 1e6)) * 10n ** 12n;
    await setThreshold(db, u.tg_id, base);
    await reply(ctx, m(u, 'threshold', { amount: fmtSqk(base, langOf(u)) }));
  });

  bot.command('alerts', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    const arg = (ctx.match ?? '').trim().toLowerCase();
    if (!arg) return void (await reply(ctx, m(u, 'alertsNow', { state: stateWord(u, !!u.alerts) })));
    const on = arg !== 'off';
    await setAlerts(db, u.tg_id, on);
    await reply(ctx, m(u, on ? 'alertsOn' : 'alertsOff'));
  });

  bot.command('hamster', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    const arg = (ctx.match ?? '').trim().toLowerCase();
    if (!arg) return void (await reply(ctx, m(u, 'hamsterNow', { state: stateWord(u, !!u.hamster_alerts) })));
    const on = arg !== 'off';
    await setHamsterAlerts(db, u.tg_id, on);
    await reply(ctx, m(u, on ? 'hamsterOn' : 'hamsterOff'));
  });

  bot.command('activity', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    const lang = langOf(u);
    const arg = (ctx.match ?? '').trim();

    // /activity 0x… — 10 sự kiện gần nhất của ví đó.
    if (arg && !/^(on|off)$/i.test(arg)) {
      if (!ADDRESS.test(arg)) return void (await reply(ctx, tr(lang, 'badAddr')));
      if (!(await listWallets(db, u.tg_id)).length) return void (await reply(ctx, tr(lang, 'noWallet')));
      const addr = arg.toLowerCase();
      try {
        const items = (await api.activity(addr)).slice(0, 10).map((x) => ({
          kind: x.kind,
          amount: x.amount > 0n ? x.amount : null,
          tx: x.txHash || undefined,
          at: x.at || undefined,
        }));
        await reply(ctx, activityList(lang, { address: addr, items }));
      } catch {
        await reply(ctx, tr(lang, 'apiDown'));
      }
      return;
    }

    if (!arg) return void (await reply(ctx, m(u, 'activityNow', { state: stateWord(u, !!u.activity_alerts) })));
    const on = arg.toLowerCase() !== 'off';
    await setActivityAlerts(db, u.tg_id, on);
    await reply(ctx, m(u, on ? 'activityOn' : 'activityOff'));
  });

  bot.command('market', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    const arg = (ctx.match ?? '').trim().toLowerCase();
    if (!arg) return void (await reply(ctx, m(u, 'marketNow', { state: stateWord(u, !!u.market_alerts) })));
    const on = arg !== 'off';
    await setMarketAlerts(db, u.tg_id, on);
    await reply(ctx, m(u, on ? 'marketOn' : 'marketOff'));
  });

  bot.command('block', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    const arg = (ctx.match ?? '').trim().toLowerCase();
    if (!arg) return void (await reply(ctx, m(u, 'blockNow', { state: stateWord(u, !!u.block_alerts) })));
    const on = arg !== 'off';
    await setBlockAlerts(db, u.tg_id, on);
    await reply(ctx, m(u, on ? 'blockOn' : 'blockOff'));
  });

  bot.command('digest', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    const arg = (ctx.match ?? '').trim().toLowerCase();
    if (!arg) return void (await reply(ctx, m(u, 'digestNow', { state: stateWord(u, !!u.digest) })));
    const on = arg !== 'off';
    await setDigest(db, u.tg_id, on);
    await reply(ctx, m(u, on ? 'digestOn' : 'digestOff'));
  });

  bot.command('quiet', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    const arg = (ctx.match ?? '').trim();
    if (!arg) {
      const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
      const state = u.quiet_start === null || u.quiet_end === null
        ? stateWord(u, false)
        : `${hhmm(u.quiet_start)}-${hhmm(u.quiet_end)}`;
      return void (await reply(ctx, m(u, 'quietNow', { state })));
    }
    if (arg.toLowerCase() === 'off') {
      await setQuiet(db, u.tg_id, null, null);
      return void (await reply(ctx, m(u, 'quietOff')));
    }
    const r = parseQuietRange(arg);
    if (!r) return void (await reply(ctx, m(u, 'badQuiet')));
    await setQuiet(db, u.tg_id, r.start, r.end);
    await reply(ctx, m(u, 'quietOn', { range: esc(arg) }));
  });

  bot.command('lang', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    const arg = (ctx.match ?? '').trim().toLowerCase();
    if (!arg) {
      const name = u.lang === 'vi' ? 'Tiếng Việt' : 'English';
      return void (await reply(ctx, m(u, 'langNow', { lang: name })));
    }
    if (arg !== 'vi' && arg !== 'en') return void (await reply(ctx, m(u, 'badLang')));
    const lang = arg;
    await setLang(db, u.tg_id, lang);
    await reply(ctx, m((await getUser(db, u.tg_id))!, 'langSet'));
  });

  bot.command('privacy', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    await reply(ctx, privacy(langOf(u)));
  });

  bot.command('delete', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    await wipeUser(db, u.tg_id);
    await reply(ctx, m(u, 'deleted'));
  });

  bot.command('stats', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    if (!isAdmin(ctx.from!.id)) return void (await reply(ctx, m(u, 'adminOnly')));
    await reply(ctx, m(u, 'stats', await stats(db)));
  });

  bot.command('ban', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    if (!isAdmin(ctx.from!.id)) return void (await reply(ctx, m(u, 'adminOnly')));
    const id = (ctx.match ?? '').trim();
    if (!id) return void (await reply(ctx, m(u, 'noId')));
    await setBlocked(db, id, true);
    await reply(ctx, m(u, 'banned', { id }));
  });

  bot.command('unban', async (ctx) => {
    const u = await userOf(ctx.from!.id);
    if (!isAdmin(ctx.from!.id)) return void (await reply(ctx, m(u, 'adminOnly')));
    const id = (ctx.match ?? '').trim();
    if (!id) return void (await reply(ctx, m(u, 'noId')));
    await setBlocked(db, id, false);
    await reply(ctx, m(u, 'unbanned', { id }));
  });

  bot.catch((err) => {
    console.error('bot error', err.error);
  });

  return { bot, api };
}

/** Menu lệnh trong Telegram (gọn, chỉ các lệnh chính). */
export async function registerCommands(bot: Bot): Promise<void> {
  await bot.api.setMyCommands(
    COMMANDS.filter((c) => !c.admin).map((c) => ({ command: c.name, description: c.en })),
  );
}
