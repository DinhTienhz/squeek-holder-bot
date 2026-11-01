import { Bot } from 'grammy';
import type { Config } from './config.ts';
import { ApiClient } from './api.ts';
import { formatSqk, ladderPowerGain, optimizeClaim, planLadder, progressPct } from './rules.ts';
import { claimablePerToken } from './chain.ts';
import { parseQuietRange } from './queue.ts';
import {
  addWallet, getUser, listWallets, openDb, removeWallet, setAlerts, setBlockAlerts,
  setBlocked, setDigest, setLang, setQuiet, setThreshold, stats, upsertUser, wipeUser, type User,
} from './db.ts';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const TEXT: Record<string, Record<string, string>> = {
  vi: {
    welcome: 'Bot theo dõi Squeekchain.\n\n/watch 0x… [tên]  — thêm ví\nTheo dõi: claimable, cooldown merge, hamster chạy/dừng.\n\n/help để xem tất cả lệnh.',
    help: [
      'LỆNH',
      '/watch 0x… [tên] — thêm ví (tối đa 5)',
      '/unwatch 0x… | tên — bỏ ví',
      '/list — danh sách ví',
      '/status — trạng thái bánh xe + block',
      '/claim [0x…] — batch tối ưu 32 token + dust',
      '/ladder [0x…] — kế hoạch merge + power gain',
      '/block on|off · /digest on|off',
      '/mergecheck [0x…] — Squeek đã hết cooldown',
      '/threshold 0.5 — ngưỡng báo claim (SQK)',
      '/alerts on|off · /quiet 22:00-07:00|off',
      '/lang vi|en · /privacy · /delete',
    ].join('\n'),
    noWallet: 'Chưa có ví nào. Dùng /watch 0x… trước.',
    badAddr: 'Địa chỉ không hợp lệ (cần 0x + 40 ký tự hex).',
    added: 'Đã thêm {addr}{label}.',
    exists: 'Ví này đã có trong danh sách.',
    limit: 'Đã đạt giới hạn số ví.',
    removed: 'Đã bỏ {n} ví.',
    notFound: 'Không tìm thấy ví đó.',
    list: 'VÍ ĐANG THEO DÕI\n{rows}',
    status: 'HAMSTER: {state} · {rpm} rpm\nBLOCK: {height} · {pct}% tới block kế\nSETTLED: round {round} · API {age}s trước',
    claim: 'VÍ {addr}\nClaimable: {amount}\nNFT: {n} · batch cần: {batches}\nMở app để ký: https://sepolia.squeekchain.com/genesis/me',
    merge: 'MERGE ĐƯỢC ({n})\n{rows}\nCòn cooldown: {cool}',
    mergeNone: 'Không có Squeek nào merge được lúc này.',
    claimPlan: 'VÍ {addr}\nBatch tốt nhất: {n} token\nTổng claim: {amount}\nDust (không trả được): {dust}\nCòn lại ngoài batch: {skipped} token · cần {batches} tx để claim hết{approx}\nToken: {ids}\nMở app để ký: https://sepolia.squeekchain.com/genesis/me',
    ladder: 'KẾ HOẠCH MERGE\n{rows}\nPower: {before} → {after} (+{gain})\nCooldown tính bằng block; merge xong chờ theo level.',
    ladderNone: 'Không đủ cặp cùng level để merge.',
    blockOn: 'Đã bật thông báo block hoàn thành.',
    blockOff: 'Đã tắt thông báo block.',
    digestOn: 'Đã bật digest hằng ngày.',
    digestOff: 'Đã tắt digest.',
    quietOn: 'Đã đặt im lặng {range} (giờ máy).',
    quietOff: 'Đã tắt im lặng.',
    badQuiet: 'Sai định dạng. Ví dụ: /quiet 22:00-07:00',
    alertsOn: 'Đã bật alert.', alertsOff: 'Đã tắt alert.',
    threshold: 'Ngưỡng báo claim: {amount}',
    badNum: 'Số không hợp lệ.',
    langSet: 'Đã đổi ngôn ngữ sang tiếng Việt.',
    privacy: 'Bot chỉ lưu: Telegram ID, địa chỉ ví bạn thêm, cài đặt alert. Không lưu private key, không ký giao dịch.\n/delete để xoá toàn bộ.',
    deleted: 'Đã xoá dữ liệu của bạn.',
    adminOnly: 'Lệnh quản trị.',
    stats: 'Users: {users} · Wallets: {wallets} · Blocked: {blocked}',
    blocked: 'Đã chặn {id}.', unblocked: 'Đã bỏ chặn {id}.',
  },
  en: {
    welcome: 'Squeekchain watcher bot.\n\n/watch 0x… [label] — add a wallet\nAlerts: claimable, merge cooldown, hamster spin.\n\n/help for all commands.',
    help: [
      'COMMANDS',
      '/watch 0x… [label] — add wallet (max 5)',
      '/unwatch 0x… | label — remove',
      '/list — your wallets',
      '/status — wheel + block state',
      '/claim [0x…] — best 32-token batch + dust',
      '/ladder [0x…] — merge plan + power gain',
      '/block on|off · /digest on|off',
      '/mergecheck [0x…] — Squeeks off cooldown',
      '/threshold 0.5 — claim alert threshold (SQK)',
      '/alerts on|off · /quiet 22:00-07:00|off',
      '/lang vi|en · /privacy · /delete',
    ].join('\n'),
    noWallet: 'No wallets yet. Use /watch 0x… first.',
    badAddr: 'Invalid address (0x + 40 hex chars).',
    added: 'Added {addr}{label}.',
    exists: 'Wallet already on your list.',
    limit: 'Wallet limit reached.',
    removed: 'Removed {n} wallet(s).',
    notFound: 'Wallet not found.',
    list: 'YOUR WALLETS\n{rows}',
    status: 'HAMSTER: {state} · {rpm} rpm\nBLOCK: {height} · {pct}% to next\nSETTLED: round {round} · API {age}s ago',
    claim: 'WALLET {addr}\nClaimable: {amount}\nNFTs: {n} · batches: {batches}\nOpen app to sign: https://sepolia.squeekchain.com/genesis/me',
    merge: 'MERGEABLE ({n})\n{rows}\nStill cooling: {cool}',
    mergeNone: 'No Squeek is mergeable right now.',
    claimPlan: 'WALLET {addr}\nBest batch: {n} tokens\nTotal claim: {amount}\nDust (not payable): {dust}\nLeft out: {skipped} tokens · {batches} tx to claim all{approx}\nTokens: {ids}\nOpen app to sign: https://sepolia.squeekchain.com/genesis/me',
    ladder: 'MERGE PLAN\n{rows}\nPower: {before} → {after} (+{gain})\nCooldowns are in blocks; each level waits longer.',
    ladderNone: 'Not enough same-level pairs to merge.',
    blockOn: 'Block alerts on.',
    blockOff: 'Block alerts off.',
    digestOn: 'Daily digest on.',
    digestOff: 'Daily digest off.',
    quietOn: 'Quiet hours set to {range} (server time).',
    quietOff: 'Quiet hours off.',
    badQuiet: 'Bad format. Example: /quiet 22:00-07:00',
    alertsOn: 'Alerts on.', alertsOff: 'Alerts off.',
    threshold: 'Claim threshold: {amount}',
    badNum: 'Invalid number.',
    langSet: 'Language set to English.',
    privacy: 'Stored: Telegram ID, wallet addresses you add, alert settings. No private keys, no signing.\n/delete to wipe.',
    deleted: 'Your data was deleted.',
    adminOnly: 'Admin only.',
    stats: 'Users: {users} · Wallets: {wallets} · Blocked: {blocked}',
    blocked: 'Blocked {id}.', unblocked: 'Unblocked {id}.',
  },
};

function t(user: User | undefined, key: string, vars: Record<string, string | number> = {}): string {
  const lang = user?.lang === 'en' ? 'en' : 'vi';
  let s = TEXT[lang][key] ?? TEXT.vi[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

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

  bot.command('start', async (ctx) => {
    const u = userOf(ctx.from!.id);
    if (u.blocked) return;
    await ctx.reply(t(u, 'welcome'));
  });

  bot.command('help', async (ctx) => {
    const u = userOf(ctx.from!.id);
    await ctx.reply(t(u, 'help'));
  });

  bot.command('watch', async (ctx) => {
    const u = userOf(ctx.from!.id);
    if (u.blocked) return;
    const [addr, ...rest] = (ctx.match ?? '').trim().split(/\s+/);
    if (!addr || !ADDRESS.test(addr)) return void (await ctx.reply(t(u, 'badAddr')));
    const r = addWallet(db, u.tg_id, addr.toLowerCase(), rest.join(' ') || null, cfg.maxWallets);
    if (!r.ok) return void (await ctx.reply(t(u, r.reason === 'limit' ? 'limit' : 'exists')));
    await ctx.reply(t(u, 'added', { addr: addr.toLowerCase(), label: rest.length ? ` (${rest.join(' ')})` : '' }));
  });

  bot.command('unwatch', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const key = (ctx.match ?? '').trim();
    if (!key) return void (await ctx.reply(t(u, 'notFound')));
    const n = removeWallet(db, u.tg_id, key);
    await ctx.reply(t(u, n ? 'removed' : 'notFound', { n }));
  });

  bot.command('list', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const ws = listWallets(db, u.tg_id);
    if (!ws.length) return void (await ctx.reply(t(u, 'noWallet')));
    const rows = ws.map((w, i) => `${i + 1}. ${w.address}${w.label ? ` — ${w.label}` : ''}`).join('\n');
    await ctx.reply(t(u, 'list', { rows }));
  });

  bot.command('status', async (ctx) => {
    const u = userOf(ctx.from!.id);
    try {
      const s = await api.status();
      const age = Math.max(0, Math.round((Date.now() - Date.parse(s.generatedAt)) / 1000));
      await ctx.reply(t(u, 'status', {
        state: s.coreStatus, rpm: (s.rpmMilli / 1000).toFixed(2), height: s.blockHeight,
        pct: progressPct(s.blockProgress).toFixed(1), round: s.settledThroughRound, age,
      }));
    } catch {
      await ctx.reply('API không phản hồi / API unreachable.');
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
    if (!addr) return void (await ctx.reply(t(u, 'noWallet')));
    try {
      const a = await api.account(addr);
      if (!a.tokenCount) return void (await ctx.reply(t(u, 'claim', { addr, amount: formatSqk(0n), n: 0, batches: 0 })));

      let approx = '';
      let per: { tokenId: string; amount: bigint }[];
      if (cfg.rpcUrl) {
        try {
          const amounts = await claimablePerToken(cfg.rpcUrl, cfg.miningAddress, a.tokens.map((x) => x.tokenId), cfg.collection);
          per = a.tokens.map((x, i) => ({ tokenId: x.tokenId, amount: amounts[i] }));
        } catch {
          per = evenSplit(a.tokens.map((x) => x.tokenId), a.claimable);
          approx = ' (ước lượng — RPC lỗi)';
        }
      } else {
        per = evenSplit(a.tokens.map((x) => x.tokenId), a.claimable);
        approx = ' (ước lượng — chưa cấu hình RPC_URL)';
      }

      const plan = optimizeClaim(per);
      await ctx.reply(t(u, 'claimPlan', {
        addr, n: plan.tokens.length, amount: formatSqk(plan.total), dust: formatSqk(plan.dust),
        skipped: plan.skipped, batches: plan.batches, approx,
        ids: plan.tokens.slice(0, 8).join(', ') + (plan.tokens.length > 8 ? '…' : ''),
      }));
    } catch {
      await ctx.reply('API không phản hồi / API unreachable.');
    }
  });

  bot.command('ladder', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const addr = targetWallet(u, ctx.match);
    if (!addr) return void (await ctx.reply(t(u, 'noWallet')));
    try {
      const [a, eco] = await Promise.all([api.account(addr), api.economy()]);
      const counts: Record<number, number> = {};
      for (const tok of a.tokens) counts[tok.level] = (counts[tok.level] ?? 0) + 1;
      const basePower: number[] = (eco?.nft?.basePower ?? []).map(Number);
      const cooldowns: number[] = (eco?.nft?.cooldownBlocks ?? []).map(Number);
      const steps = planLadder(counts, cooldowns, basePower.length || 10);
      if (!steps.length) return void (await ctx.reply(t(u, 'ladderNone')));
      const rows = steps.map((x) => `L${x.level} ×${x.merges * 2} → L${x.level + 1} ×${x.produced}  (chờ ${x.cooldownBlocks} block)`).join('\n');
      const gain = ladderPowerGain(counts, basePower);
      await ctx.reply(t(u, 'ladder', {
        rows, before: gain.before.toString(), after: gain.after.toString(),
        gain: (gain.after - gain.before).toString(),
      }));
    } catch {
      await ctx.reply('API không phản hồi / API unreachable.');
    }
  });

  bot.command('block', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const on = (ctx.match ?? '').trim().toLowerCase() !== 'off';
    setBlockAlerts(db, u.tg_id, on);
    await ctx.reply(t(u, on ? 'blockOn' : 'blockOff'));
  });

  bot.command('digest', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const on = (ctx.match ?? '').trim().toLowerCase() !== 'off';
    setDigest(db, u.tg_id, on);
    await ctx.reply(t(u, on ? 'digestOn' : 'digestOff'));
  });

  bot.command('mergecheck', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const addr = targetWallet(u, ctx.match);
    if (!addr) return void (await ctx.reply(t(u, 'noWallet')));
    try {
      const a = await api.account(addr);
      const ready = a.tokens.filter((x) => x.mergeState === 'ready');
      const cooling = a.tokens.filter((x) => x.mergeState === 'cooldown');
      if (!ready.length) return void (await ctx.reply(t(u, 'mergeNone')));
      const rows = ready.slice(0, 15).map((x) => `#${x.tokenId} · level ${x.level}`).join('\n');
      await ctx.reply(t(u, 'merge', { n: ready.length, rows, cool: cooling.length }));
    } catch {
      await ctx.reply('API không phản hồi / API unreachable.');
    }
  });

  bot.command('threshold', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const v = Number((ctx.match ?? '').trim().replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return void (await ctx.reply(t(u, 'badNum')));
    const base = BigInt(Math.round(v * 1e6)) * 10n ** 12n; // 6 số lẻ → base units
    setThreshold(db, u.tg_id, base);
    await ctx.reply(t(u, 'threshold', { amount: formatSqk(base) }));
  });

  bot.command('alerts', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const on = (ctx.match ?? '').trim().toLowerCase() !== 'off';
    setAlerts(db, u.tg_id, on);
    await ctx.reply(t(u, on ? 'alertsOn' : 'alertsOff'));
  });

  bot.command('quiet', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const arg = (ctx.match ?? '').trim();
    if (!arg || arg.toLowerCase() === 'off') {
      setQuiet(db, u.tg_id, null, null);
      return void (await ctx.reply(t(u, 'quietOff')));
    }
    const r = parseQuietRange(arg);
    if (!r) return void (await ctx.reply(t(u, 'badQuiet')));
    setQuiet(db, u.tg_id, r.start, r.end);
    await ctx.reply(t(u, 'quietOn', { range: arg }));
  });

  bot.command('lang', async (ctx) => {
    const u = userOf(ctx.from!.id);
    const lang = (ctx.match ?? '').trim().toLowerCase() === 'en' ? 'en' : 'vi';
    setLang(db, u.tg_id, lang);
    await ctx.reply(t(getUser(db, u.tg_id), 'langSet'));
  });

  bot.command('privacy', async (ctx) => {
    const u = userOf(ctx.from!.id);
    await ctx.reply(t(u, 'privacy'));
  });

  bot.command('delete', async (ctx) => {
    const u = userOf(ctx.from!.id);
    wipeUser(db, u.tg_id);
    await ctx.reply(t(u, 'deleted'));
  });

  bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx.from!.id)) return void (await ctx.reply('Admin only.'));
    const s = stats(db);
    await ctx.reply(t(userOf(ctx.from!.id), 'stats', s));
  });

  bot.command('block', async (ctx) => {
    if (!isAdmin(ctx.from!.id)) return void (await ctx.reply('Admin only.'));
    const id = (ctx.match ?? '').trim();
    if (!id) return;
    setBlocked(db, id, true);
    await ctx.reply(t(userOf(ctx.from!.id), 'blocked', { id }));
  });

  bot.command('unblock', async (ctx) => {
    if (!isAdmin(ctx.from!.id)) return void (await ctx.reply('Admin only.'));
    const id = (ctx.match ?? '').trim();
    if (!id) return;
    setBlocked(db, id, false);
    await ctx.reply(t(userOf(ctx.from!.id), 'unblocked', { id }));
  });

  bot.catch((err) => {
    console.error('bot error', err.error);
  });

  return { bot, db, api };
}
