import { Bot, type Context } from 'grammy';
import type { Config } from './config.ts';
import { ApiClient } from './api.ts';
import { ladderPowerGain, optimizeClaim, planLadder } from './rules.ts';
import { claimablePerToken } from './chain.ts';
import { parseQuietRange } from './queue.ts';
import {
  alertBlock, alertCooldown, alertHamster, addrShort, claimMsg, digestMsg, esc, fmtSqk, fullAddr,
  help, ladderMsg, mergeMsg, privacy, statusMsg, t as tr, walletAdded, walletList, welcome, type Lang,
} from './format.ts';
import {
  addWallet, getUser, listWallets, openDb, removeWallet, setAlerts, setBlockAlerts,
  setBlocked, setDigest, setLang, setQuiet, setThreshold, stats, upsertUser, wipeUser, type User,
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
    alertsOff: '🔕 Đã tắt thông báo.',
    threshold: '🎯 Ngưỡng báo claim: <b>{amount}</b>',
    badNum: '⚠️ Số không hợp lệ.',
    langSet: '🇻🇳 Đã đổi sang tiếng Việt.',
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
    alertsOff: '🔕 Alerts off.',
    threshold: '🎯 Claim threshold: <b>{amount}</b>',
    badNum: '⚠️ Invalid number.',
    langSet: '🇬🇧 Language set to English.',
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

export function createBot(cfg: Config) {
  const db = openDb(cfg.dbPath);
  const api = new ApiClient(cfg.apiBase);
  const bot = new Bot(cfg.botToken || '0:test');

  const userOf = (id: string | number): User => upsertUser(db, String(id));
  const isAdmin = (id: string | number) => cfg.adminIds.has(String(id));
  const langOf = (u: User): Lang => (u.lang === 'vi' ? 'vi' : 'en');
  const m = (u: User, key: keyof typeof MSG.vi, vars: Record<string, string | number> = {}): string => {
    let s: string = MSG[langOf(u)][key];
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };

  const reply = (ctx: Context, text: string) =>
    ctx.reply(text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });

  bot.command('start', async (ctx) => {
    const u = userOf(ctx.from!.id);
    if (u.blocked) return;
    await reply(ctx, welcome(langOf(u)));
  });

  bot.command('help', async (ctx) => {
    const u = userOf(ctx.from!.id);
    await reply(ctx, help(langOf(u)));
  });

  bot.command('watch', async (ctx) => {
    const u = userOf(ctx.from!.id);
    if (u.blocked) return;
    const [addr, ...rest] = (ctx.match ?? '').trim().split(/\s+/);
    if (!addr || !ADDRESS.test(addr)) return void (await reply(ctx, tr(langOf(u), 'badAddr')));
    const label = rest.join(' ') || null;
    const r = addWallet(db, u.tg_id, addr.toLowerCase(), label, cfg.maxWallets);
    if (!r.ok) return void (await reply(ctx, m(u, r.reason === 'limit' ? 'limit' : 'exists')));
    await reply(ctx, walletAdded(langOf(u), addr.toLowerCase(), label));
  });

  bot.command('unwatch', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const key = (ctx.match ?? '').trim();
    if (!key) return void (await reply(ctx, m(u, 'notFound')));
    const n = removeWallet(db, u.tg_id, key);
    await reply(ctx, m(u, n ? 'removed' : 'notFound', { n }));
  });

  bot.command('list', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const ws = listWallets(db, u.tg_id);
    if (!ws.length) return void (await reply(ctx, tr(langOf(u), 'noWallet')));
    await reply(ctx, walletList(langOf(u), ws, cfg.maxWallets));
  });

  bot.command('status', async (ctx) => {
    const u = userOf(ctx.from!.id);
    try {
      const s = await api.status();
      const age = Math.max(0, Math.round((Date.now() - Date.parse(s.generatedAt)) / 1000));
      await reply(ctx, statusMsg(langOf(u), s, age));
    } catch {
      await reply(ctx, tr(langOf(u), 'apiDown'));
    }
  });

  const targetWallet = (u: User, arg?: string) => {
    const ws = listWallets(db, u.tg_id);
    if (arg && ADDRESS.test(arg.trim())) return arg.trim().toLowerCase();
    return ws[0]?.address;
  };

  bot.command('claim', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const addr = targetWallet(u, ctx.match);
    if (!addr) return void (await reply(ctx, tr(langOf(u), 'noWallet')));
    const lang = langOf(u);
    try {
      const a = await api.account(addr);
      if (!a.tokenCount) {
        return void (await reply(ctx, claimMsg(lang, {
          address: addr, total: 0n, dust: 0n, tokens: 0, skipped: 0, batches: 0, approx: null,
        })));
      }

      let approx: 'rpc' | 'noRpc' | null = null;
      let per: { tokenId: string; amount: bigint }[];
      if (cfg.rpcUrl) {
        try {
          const amounts = await claimablePerToken(cfg.rpcUrl, cfg.miningAddress, a.tokens.map((x) => x.tokenId), cfg.collection);
          per = a.tokens.map((x, i) => ({ tokenId: x.tokenId, amount: amounts[i] }));
        } catch {
          per = evenSplit(a.tokens.map((x) => x.tokenId), a.claimable);
          approx = 'rpc';
        }
      } else {
        per = evenSplit(a.tokens.map((x) => x.tokenId), a.claimable);
        approx = 'noRpc';
      }

      const plan = optimizeClaim(per);
      await reply(ctx, claimMsg(lang, {
        address: addr, total: plan.total, dust: plan.dust,
        tokens: plan.tokens.length, skipped: plan.skipped, batches: plan.batches, approx,
      }));
    } catch {
      await reply(ctx, tr(lang, 'apiDown'));
    }
  });

  bot.command('ladder', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const addr = targetWallet(u, ctx.match);
    if (!addr) return void (await reply(ctx, tr(langOf(u), 'noWallet')));
    try {
      const [a, eco] = await Promise.all([api.account(addr), api.economy()]);
      const counts: Record<number, number> = {};
      for (const tok of a.tokens) counts[tok.level] = (counts[tok.level] ?? 0) + 1;
      const basePower: number[] = (eco?.nft?.basePower ?? []).map(Number);
      const cooldowns: number[] = (eco?.nft?.cooldownBlocks ?? []).map(Number);
      const steps = planLadder(counts, cooldowns, basePower.length || 10);
      if (!steps.length) return void (await reply(ctx, m(u, 'ladderNone')));
      const gain = ladderPowerGain(counts, basePower);
      await reply(ctx, ladderMsg(langOf(u), { address: addr, steps, before: gain.before, after: gain.after }));
    } catch {
      await reply(ctx, tr(langOf(u), 'apiDown'));
    }
  });

  bot.command('mergecheck', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const addr = targetWallet(u, ctx.match);
    if (!addr) return void (await reply(ctx, tr(langOf(u), 'noWallet')));
    try {
      const a = await api.account(addr);
      const ready = a.tokens.filter((x) => x.mergeState === 'ready').map((x) => ({ tokenId: x.tokenId, level: x.level }));
      const cooling = a.tokens.filter((x) => x.mergeState === 'cooldown').length;
      if (!ready.length) return void (await reply(ctx, m(u, 'mergeNone')));
      await reply(ctx, mergeMsg(langOf(u), { address: addr, ready, cooling }));
    } catch {
      await reply(ctx, tr(langOf(u), 'apiDown'));
    }
  });

  bot.command('threshold', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const v = Number((ctx.match ?? '').trim().replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return void (await reply(ctx, m(u, 'badNum')));
    const base = BigInt(Math.round(v * 1e6)) * 10n ** 12n;
    setThreshold(db, u.tg_id, base);
    await reply(ctx, m(u, 'threshold', { amount: fmtSqk(base, langOf(u)) }));
  });

  bot.command('alerts', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const on = (ctx.match ?? '').trim().toLowerCase() !== 'off';
    setAlerts(db, u.tg_id, on);
    await reply(ctx, m(u, on ? 'alertsOn' : 'alertsOff'));
  });

  bot.command('block', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const on = (ctx.match ?? '').trim().toLowerCase() !== 'off';
    setBlockAlerts(db, u.tg_id, on);
    await reply(ctx, m(u, on ? 'blockOn' : 'blockOff'));
  });

  bot.command('digest', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const on = (ctx.match ?? '').trim().toLowerCase() !== 'off';
    setDigest(db, u.tg_id, on);
    await reply(ctx, m(u, on ? 'digestOn' : 'digestOff'));
  });

  bot.command('quiet', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const arg = (ctx.match ?? '').trim();
    if (!arg || arg.toLowerCase() === 'off') {
      setQuiet(db, u.tg_id, null, null);
      return void (await reply(ctx, m(u, 'quietOff')));
    }
    const r = parseQuietRange(arg);
    if (!r) return void (await reply(ctx, m(u, 'badQuiet')));
    setQuiet(db, u.tg_id, r.start, r.end);
    await reply(ctx, m(u, 'quietOn', { range: esc(arg) }));
  });

  bot.command('lang', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const lang = (ctx.match ?? '').trim().toLowerCase() === 'vi' ? 'vi' : 'en';
    setLang(db, u.tg_id, lang);
    await reply(ctx, m(getUser(db, u.tg_id)!, 'langSet'));
  });

  bot.command('privacy', async (ctx) => {
    const u = userOf(ctx.from!.id);
    await reply(ctx, privacy(langOf(u)));
  });

  bot.command('delete', async (ctx) => {
    const u = userOf(ctx.from!.id);
    wipeUser(db, u.tg_id);
    await reply(ctx, m(u, 'deleted'));
  });

  bot.command('stats', async (ctx) => {
    const u = userOf(ctx.from!.id);
    if (!isAdmin(ctx.from!.id)) return void (await reply(ctx, m(u, 'adminOnly')));
    await reply(ctx, m(u, 'stats', stats(db)));
  });

  bot.command('ban', async (ctx) => {
    const u = userOf(ctx.from!.id);
    if (!isAdmin(ctx.from!.id)) return void (await reply(ctx, m(u, 'adminOnly')));
    const id = (ctx.match ?? '').trim();
    if (!id) return void (await reply(ctx, m(u, 'noId')));
    setBlocked(db, id, true);
    await reply(ctx, m(u, 'banned', { id }));
  });

  bot.command('unban', async (ctx) => {
    const u = userOf(ctx.from!.id);
    if (!isAdmin(ctx.from!.id)) return void (await reply(ctx, m(u, 'adminOnly')));
    const id = (ctx.match ?? '').trim();
    if (!id) return void (await reply(ctx, m(u, 'noId')));
    setBlocked(db, id, false);
    await reply(ctx, m(u, 'unbanned', { id }));
  });

  bot.catch((err) => {
    console.error('bot error', err.error);
  });

  return { bot, db, api };
}

/** Menu lệnh trong Telegram (gọn, chỉ các lệnh chính). */
export async function registerCommands(bot: Bot): Promise<void> {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Bắt đầu / Start' },
    { command: 'watch', description: 'Thêm ví / Add wallet' },
    { command: 'list', description: 'Danh sách ví / Wallets' },
    { command: 'status', description: 'Trạng thái / Status' },
    { command: 'claim', description: 'SQK claim được / Claimable' },
    { command: 'mergecheck', description: 'Squeek merge được / Mergeable' },
    { command: 'ladder', description: 'Kế hoạch merge / Merge plan' },
    { command: 'threshold', description: 'Ngưỡng báo / Threshold' },
    { command: 'alerts', description: 'Bật/tắt thông báo / Alerts' },
    { command: 'quiet', description: 'Giờ im lặng / Quiet hours' },
    { command: 'help', description: 'Tất cả lệnh / All commands' },
  ]);
}
