/**
 * Toàn bộ nội dung hiển thị của bot. Pure functions, không I/O → test được.
 * Tin nhắn dùng HTML parse mode: mọi dữ liệu do người dùng nhập phải qua esc().
 */
export type Lang = 'vi' | 'en';

export const esc = (s: string): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const group = (digits: string, lang: Lang): string =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '.');

/** 5973 → "5,973" (en) / "5.973" (vi) */
export const fmtInt = (n: number | bigint, lang: Lang = 'en'): string => group(n.toString(), lang);

/** 68.94 → "68.94" (en) / "68,94" (vi) */
import { isHamsterRunning } from './rules.ts';
import { COMMANDS, type Group } from './commands.ts';

export function fmtNum(n: number, lang: Lang = 'en', digits = 2): string {
  const fixed = n.toFixed(digits);
  const [whole, frac] = fixed.split('.');
  return group(whole, lang) + (frac ? (lang === 'en' ? '.' : ',') + frac : '');
}

/** 7235340000000000000000n → "7,235.34 SQK" (en) / "7.235,34 SQK" (vi) */
export function fmtSqk(base: bigint, lang: Lang = 'en', decimals = 2, fixed = false): string {
  const neg = base < 0n;
  const v = neg ? -base : base;
  const whole = group((v / 10n ** 18n).toString(), lang);
  const raw = (v % 10n ** 18n).toString().padStart(18, '0').slice(0, decimals);
  const frac = fixed ? raw : raw.replace(/0+$/, '');
  const body = frac ? `${whole}${lang === 'en' ? '.' : ','}${frac}` : whole;
  return `${neg ? '-' : ''}${body} SQK`;
}

/** Địa chỉ rút gọn để hiển thị inline (bản đầy đủ nằm ở /list). */
export const addrShort = (a: string): string =>
  `<code>${esc(a.slice(0, 6))}…${esc(a.slice(-4))}</code>`;

export const fullAddr = (a: string): string => `<code>${esc(a)}</code>`;

const L = {
  vi: {
    appLink: '🔗 <a href="https://sepolia.squeekchain.com/">Mở app để ký</a>',
    approxRpc: 'Ước lượng từ API — RPC không đọc được từng token.',
    approxNoRpc: 'Ước lượng từ API — chưa cấu hình RPC_URL.',
    noWallet: '👛 Chưa có ví nào.\nThêm bằng <code>/watch 0x…</code>',
    badAddr: '⚠️ Địa chỉ không hợp lệ.\nCần <code>0x</code> + 40 ký tự hex.',
    apiDown: '⚠️ API không phản hồi. Thử lại sau ít phút.',
  },
  en: {
    appLink: '🔗 <a href="https://sepolia.squeekchain.com/">Open app to sign</a>',
    approxRpc: 'Estimated from the API — RPC could not read per-token amounts.',
    approxNoRpc: 'Estimated from the API — RPC_URL is not configured.',
    noWallet: '👛 No wallets yet.\nAdd one with <code>/watch 0x…</code>',
    badAddr: '⚠️ Invalid address.\nNeeds <code>0x</code> + 40 hex characters.',
    apiDown: '⚠️ API unreachable. Try again in a minute.',
  },
} as const;

export const t = (lang: Lang, key: keyof typeof L.vi): string => L[lang][key];

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export function welcome(lang: Lang): string {
  if (lang === 'en') {
    return [
      '🐹 <b>Squeek Holder Bot</b>',
      'Track your Squeekchain wallets inside Telegram.',
      '',
      '<b>Start</b>',
      '/watch <code>0x…</code> [label] — add a wallet',
      '/status — wheel &amp; block',
      '/help — all commands',
      '',
      '<i>Read-only. No private keys, no signing.</i>',
    ].join('\n');
  }
  return [
    '🐹 <b>Squeek Holder Bot</b>',
    'Theo dõi ví Squeekchain ngay trong Telegram.',
    '',
    '<b>Bắt đầu</b>',
    '/watch <code>0x…</code> [tên] — thêm ví',
    '/status — bánh xe &amp; block',
    '/help — tất cả lệnh',
    '',
    '<i>Chỉ đọc dữ liệu công khai. Không giữ private key.</i>',
  ].join('\n');
}

const GROUP_TITLE: Record<Group, { en: string; vi: string }> = {
  wallets: { en: 'Wallets', vi: 'Ví' },
  track: { en: 'Track', vi: 'Theo dõi' },
  notifications: { en: 'Notifications', vi: 'Thông báo' },
  other: { en: 'Other', vi: 'Khác' },
  admin: { en: 'Admin', vi: 'Quản trị' },
};

export function help(lang: Lang, isAdmin = false): string {
  const vi = lang !== 'en';
  const groups: Group[] = ['wallets', 'track', 'notifications', 'other'];
  if (isAdmin) groups.push('admin');

  const out: string[] = [`📖 <b>${vi ? 'LỆNH' : 'COMMANDS'}</b>`];
  for (const g of groups) {
    const items = COMMANDS.filter((c) => c.group === g && (isAdmin || !c.admin));
    if (!items.length) continue;
    out.push('', `<b>${GROUP_TITLE[g][lang]}</b>`);
    for (const c of items) {
      const usage = c.usage ? ` <code>${esc(c.usage)}</code>` : '';
      out.push(`/${c.name}${usage} · ${vi ? c.vi : c.en}`);
    }
  }
  return out.join('\n');
}

export function walletList(lang: Lang, wallets: { address: string; label: string | null }[], max: number,
  stats?: Record<string, { claimable: bigint; tokens: number; ready: number }>): string {
  const head = lang === 'en'
    ? `👛 <b>Wallets</b> · ${wallets.length}/${max}`
    : `👛 <b>Ví đang theo dõi</b> · ${wallets.length}/${max}`;
  const rows = wallets.map((w, i) => {
    const label = w.label ? ` — ${esc(w.label)}` : '';
    const lines = [`${i + 1}. ${fullAddr(w.address)}${label}`];
    const st = stats?.[w.address.toLowerCase()];
    if (!st) {
      lines.push(`   <i>${lang === 'en' ? 'no data — API unreachable' : 'không đọc được dữ liệu'}</i>`);
      return lines.join('\n');
    }
    const vi = lang !== 'en';
    lines.push(`   💰 ${fmtSqk(st.claimable, lang)} token`);
    lines.push(`   🖼 ${st.tokens} Squeek NFT · ${st.ready} ${vi ? 'merge được' : 'ready'}`);
    return lines.join('\n');
  });
  const hint = lang === 'en' ? '<i>Add: /watch 0x… label</i>' : '<i>Thêm: /watch 0x… tên</i>';
  return [head, '', ...rows.flatMap((r, i) => (i === 0 ? [r] : ['', r])), '', hint].join('\n');
}

export function walletAdded(lang: Lang, address: string, label: string | null): string {
  const name = label ? ` — ${esc(label)}` : '';
  return lang === 'en'
    ? `✅ Added ${addrShort(address)}${name}`
    : `✅ Đã thêm ${addrShort(address)}${name}`;
}

export function statusMsg(lang: Lang, s: {
  coreStatus: string; rpmMilli: number; blockHeight: number; blockProgress: number;
  settledThroughRound: number; settledHeight?: number; minted?: bigint; cap?: bigint; liveSupply?: bigint; premine?: bigint;
}, ageSec: number, stake?: { nfts: bigint; nftLive: bigint; sqk: bigint; mined: bigint }, scope = ''): string {
  const spinning = isHamsterRunning(s.coreStatus, s.rpmMilli);
  const state = spinning
    ? `🏃 ${lang === 'en' ? 'running' : 'đang chạy'} · ${fmtNum(s.rpmMilli / 1000, lang, 2)} rpm`
    : (lang === 'en' ? '😴 resting' : '😴 nghỉ');
  const pct = fmtNum((s.blockProgress / 1e9) * 100, lang, 1);
  const filled = Math.max(0, Math.min(20, Math.round((s.blockProgress / 1e9) * 20)));
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  const pctOf = (a: bigint, b: bigint) => (b > 0n ? fmtNum(Number(a * 1000n / b) / 10, lang, 1) : '—');
  const live = s.liveSupply ?? s.minted;

  // 1. What the chain is doing
  const lines = [
    `🐹 <b>Hamster</b> · ${state}`,
    `⛏️ <b>Block</b> ${fmtInt(s.blockHeight, lang)} · ${pct}%` +
      (s.settledHeight ? ` · ${lang === 'en' ? 'settled' : 'đã settle'} ${fmtInt(s.settledHeight, lang)}` : ''),
    bar,
    `🔄 <b>Round</b> ${fmtInt(s.settledThroughRound, lang)} ${lang === 'en' ? 'settled' : 'đã settle'}`,
  ];

  // 2. How much SQK exists
  if (live != null && s.cap != null && s.cap > 0n) {
    const capShare = fmtNum((Number(live) / Number(s.cap)) * 100, lang, 2);
    lines.push('', `🪙 <b>${lang === 'en' ? 'Supply' : 'Cung'}</b> · ${fmtInt(live / 10n ** 18n, lang)} / ${fmtInt(s.cap / 10n ** 18n, lang)} (${capShare}%)`);
    if (s.premine != null) lines.push(`├ ${lang === 'en' ? 'Premine' : 'Premine'} · ${fmtInt(s.premine / 10n ** 18n, lang)}`);
    if (s.minted != null) lines.push(`└ ${lang === 'en' ? 'Mined' : 'Đã đào'} · ${fmtInt(s.minted / 10n ** 18n, lang)} (${pctOf(s.minted, live)}% ${lang === 'en' ? 'of live' : 'của cung'})`);
  }

  // 3. How much is locked
  if (stake) {
    lines.push('', `🖼 <b>NFT ${lang === 'en' ? 'staked' : 'stake'}</b> · ${fmtInt(stake.nfts, lang)} / ${fmtInt(stake.nftLive, lang)} (${pctOf(stake.nfts, stake.nftLive)}%)`);
    const liveSupp = live ?? stake.mined;
    lines.push(`💰 <b>SQK ${lang === 'en' ? 'staked' : 'stake'}</b> · ${fmtInt(stake.sqk / 10n ** 18n, lang)} (${pctOf(stake.sqk, liveSupp)}% ${lang === 'en' ? 'live' : 'cung'} · ${pctOf(stake.sqk, stake.mined)}% ${lang === 'en' ? 'mined' : 'đào'})`);
  }

  lines.push('', `<i>${scope ? `${scope} · ` : ''}${lang === 'en' ? 'updated' : 'cập nhật'} ${ageSec}s ${lang === 'en' ? 'ago' : 'trước'}</i>`);
  return lines.join('\n');
}

export function claimMsg(lang: Lang, p: {
  address: string; total: bigint; dust: bigint;
  tokens: number; skipped: number; batches: number; approx: 'rpc' | 'noRpc' | null;
}): string {
  const vi = lang !== 'en';
  const lines = [
    `💰 <b>Claim</b> · ${addrShort(p.address)}`,
    '',
    `<b>${fmtSqk(p.total, lang)}</b>`,
    vi
      ? `Batch ${p.tokens} token · còn ${p.skipped} ngoài batch`
      : `Batch ${p.tokens} ${plural(p.tokens, 'token', 'tokens')} · ${p.skipped} left out`,
    vi
      ? `Dust ${fmtSqk(p.dust, lang)} · cần ${p.batches} giao dịch`
      : `Dust ${fmtSqk(p.dust, lang)} · ${p.batches} ${plural(p.batches, 'transaction', 'transactions')}`,
  ];
  if (p.approx) {
    lines.push('', `<i>${vi ? (p.approx === 'rpc' ? L.vi.approxRpc : L.vi.approxNoRpc) : (p.approx === 'rpc' ? L.en.approxRpc : L.en.approxNoRpc)}</i>`);
  }
  lines.push(vi ? L.vi.appLink : L.en.appLink);
  return lines.join('\n');
}

export function claimExactMsg(lang: Lang, p: { address: string; total: bigint; source: 'chain' | 'api'; nftStaked: number; sqkStaked: bigint }): string {
  const vi = lang !== 'en';
  const lines = [
    `💰 <b>Claim</b> · ${addrShort(p.address)}`,
    '',
    `<b>${fmtSqk(p.total, lang)} token</b>`,
    `🖼 ${p.nftStaked} ${vi ? 'Squeek NFT đang stake' : 'Squeek NFT staked'} · ${fmtSqk(p.sqkStaked, lang)} token ${vi ? 'đang stake' : 'staked'}`,
    p.total === 0n
      ? `<i>${vi ? 'chưa có gì để claim' : 'nothing to claim yet'}</i>`
      : (vi ? '1 giao dịch · trả toàn bộ phần thưởng' : '1 transaction · pays all rewards'),
  ];
  if (p.source === 'api') {
    lines.push('', `<i>${vi ? 'số từ API — RPC chưa đọc được' : 'figure from the API — RPC read unavailable'}</i>`);
  }
  lines.push(vi ? L.vi.appLink : L.en.appLink);
  return lines.join('\n');
}

export function ladderMsg(lang: Lang, p: {
  address: string; steps: { level: number; merges: number; produced: number; cooldownBlocks: number }[];
  before: bigint; after: bigint;
}): string {
  const vi = lang !== 'en';
  const rows = p.steps.slice(0, 8).map((x) =>
    `L${x.level} ×${x.merges * 2} → L${x.level + 1} ×${x.produced} · ${vi ? 'chờ' : 'wait'} ${fmtInt(x.cooldownBlocks, lang)} ${vi ? 'block' : plural(x.cooldownBlocks, 'block', 'blocks')}`);
  if (p.steps.length > 8) rows.push('…');
  const gain = p.after - p.before;
  return [
    `🪜 <b>${vi ? 'Kế hoạch merge' : 'Merge plan'}</b> · ${addrShort(p.address)}`,
    '',
    ...rows,
    '',
    `Power ${fmtInt(p.before, lang)} → ${fmtInt(p.after, lang)} <b>(+${fmtInt(gain, lang)})</b>`,
  ].join('\n');
}

export function mergeMsg(lang: Lang, p: { address: string; ready: { tokenId: string; level: number }[]; cooling: number }): string {
  const vi = lang !== 'en';
  const rows = p.ready.slice(0, 15).map((x) => `#${esc(x.tokenId)} · L${x.level}`);
  if (p.ready.length > 15) rows.push('…');
  return [
    `🔁 <b>${vi ? 'Merge được' : 'Mergeable'} (${p.ready.length} Squeek NFT)</b> · ${addrShort(p.address)}`,
    '',
    ...rows,
    '',
    `<i>${vi ? `Còn ${p.cooling} đang cooldown · xem /ladder` : `${p.cooling} still cooling · see /ladder`}</i>`,
  ].join('\n');
}

export function alertClaim(lang: Lang, p: { address: string; amount: bigint; threshold: bigint }): string {
  const vi = lang !== 'en';
  return [
    `💰 <b>Claimable ${fmtSqk(p.amount, lang)}</b>`,
    `${vi ? 'Ví' : 'Wallet'} ${addrShort(p.address)} · ${vi ? 'ngưỡng' : 'threshold'} ${fmtSqk(p.threshold, lang)}`,
    vi ? L.vi.appLink : L.en.appLink,
  ].join('\n');
}

export function alertCooldown(lang: Lang, p: { address: string; tokenId: string }): string {
  const vi = lang !== 'en';
  return [
    `🔁 <b>Squeek NFT #${esc(p.tokenId)} ${vi ? 'hết cooldown' : 'is off cooldown'}</b>`,
    `${vi ? 'Ví' : 'Wallet'} ${addrShort(p.address)} · ${vi ? 'merge được ngay' : 'mergeable now'}`,
  ].join('\n');
}

export function formatDuration(lang: Lang, ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  const vi = lang !== 'en';
  if (sec < 60) return vi ? `${sec} giây` : `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return vi ? `${min} phút` : `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return vi ? `${h} giờ ${String(m).padStart(2, '0')} phút` : `${h}h ${String(m).padStart(2, '0')}m`;
}

export function alertHamster(
  lang: Lang,
  s: { coreStatus: string; rpmMilli: number; blockHeight: number; blockProgress: number },
  runMs?: number | null,
): string {
  const vi = lang !== 'en';
  const live = `🔴 <a href="https://x.com/squeekchain">${vi ? 'Xem live trên X' : 'Watch live on X'}</a>`;
  if (isHamsterRunning(s.coreStatus, s.rpmMilli)) {
    return [
      `🐹 <b>${vi ? 'Hamster đang chạy' : 'Hamster is running'}</b>`,
      `${fmtNum(s.rpmMilli / 1000, lang, 2)} rpm · Block ${fmtInt(s.blockHeight, lang)}`,
      live,
    ].join('\n');
  }
  const pct = fmtNum((s.blockProgress / 1e9) * 100, lang, 1);
  const ran = runMs && runMs > 0
    ? (vi ? ` (chạy ${formatDuration(lang, runMs)})` : ` (ran ${formatDuration(lang, runMs)})`)
    : '';
  return [
    `😴 <b>${vi ? 'Hamster đã dừng' : 'Hamster stopped'}</b>${ran}`,
    `Block ${fmtInt(s.blockHeight, lang)} · ${pct}%`,
    live,
  ].join('\n');
}

export function alertBlock(lang: Lang, p: {
  first: number; last: number; blocks: number; minted: bigint | null;
}): string {
  const vi = lang !== 'en';
  const range = p.first === p.last
    ? `Block #${fmtInt(p.first, lang)}`
    : `Blocks ${fmtInt(p.first, lang)}–${fmtInt(p.last, lang)}`;
  const head = `⛏️ <b>${range}</b>` +
    (p.blocks > 1 ? ` · ${fmtInt(p.blocks, lang)} ${vi ? 'block' : 'blocks'}` : '');
  const second = p.minted != null
    ? `${fmtSqk(p.minted, lang, 4, true)} ${vi ? 'đã phát' : 'minted'}`
    : (vi ? 'SQK mint chưa index xong' : 'SQK mint not indexed yet');
  return [head, second].join('\n');
}

const ACTIVITY_KINDS: Record<string, { en: string; vi: string }> = {
  nft_deposited: { en: 'Squeek NFT received', vi: 'Nhận Squeek NFT' },
  nft_withdrawn: { en: 'Squeek NFT sent', vi: 'Gửi Squeek NFT' },
  nft_transferred: { en: 'Squeek NFT transferred', vi: 'Chuyển Squeek NFT' },
  nft_merged: { en: 'Squeek NFT merged', vi: 'Merge Squeek NFT' },
  nft_claimed: { en: 'Squeek NFT claimed', vi: 'Nhận Squeek NFT (claim)' },
  sqk_staked: { en: 'SQK staked', vi: 'Stake SQK' },
  sqk_unstaked: { en: 'SQK unstaked', vi: 'Unstake SQK' },
  rewards_staked: { en: 'Rewards staked', vi: 'Stake phần thưởng' },
  claimed: { en: 'SQK claimed', vi: 'Đã claim SQK' },
  rewards_claimed: { en: 'Rewards claimed', vi: 'Đã claim phần thưởng' },
  claim: { en: 'SQK claimed', vi: 'Đã claim SQK' },
  transfer: { en: 'Transfer', vi: 'Chuyển' },
};

export function activityLabel(lang: Lang, kind: string): string {
  const k = ACTIVITY_KINDS[kind];
  if (!k) return kind;
  return lang === 'en' ? k.en : k.vi;
}

export function activityList(lang: Lang, p: {
  address: string; items: { kind: string; amount: bigint | null; tx?: string; at?: string }[];
}): string {
  const vi = lang !== 'en';
  const head = `🔔 <b>${vi ? 'Hoạt động ví' : 'Wallet activity'}</b> · ${addrShort(p.address)} · UTC`;
  if (!p.items.length) return [head, '', `<i>${vi ? 'chưa có sự kiện' : 'no events yet'}</i>`].join('\n');
  const rows = p.items.map((i) => {
    const label = esc(activityLabel(lang, i.kind));
    const amt = i.amount ? ` · ${fmtSqk(i.amount, lang)}` : '';
    const hhmm = i.at ? new Date(i.at).toISOString().slice(11, 16) : '';
    const when = hhmm && i.tx
      ? `<a href="https://sepolia.etherscan.io/tx/${esc(i.tx)}">${hhmm}</a> · `
      : (hhmm ? `${hhmm} · ` : '');
    return `• ${when}${label}${amt}`;
  });
  return [head, '', ...rows].join('\n');
}

export function activityBatch(lang: Lang, p: {
  address: string; items: { kind: string; amount: bigint | null; tx?: string }[];
}): string {
  const vi = lang !== 'en';
  const lines = [
    `🔔 <b>${vi ? `${p.items.length} biến động ví` : `${p.items.length} wallet events`}</b> · ${addrShort(p.address)}`,
    '',
  ];
  for (const i of p.items.slice(0, 10)) {
    const amt = i.amount && i.amount > 0n ? ` · ${fmtSqk(i.amount, lang)}` : '';
    lines.push(`• ${esc(activityLabel(lang, i.kind))}${amt}`);
  }
  if (p.items.length > 10) lines.push('…');
  const tx = p.items.find((i) => i.tx)?.tx;
  if (tx) lines.push('', `🔗 <a href="https://sepolia.etherscan.io/tx/${esc(tx)}">Etherscan</a>`);
  return lines.join('\n');
}

export function alertActivity(lang: Lang, p: { address: string; kind: string; amount: bigint | null; tx?: string }): string {
  const vi = lang !== 'en';
  const label = esc(activityLabel(lang, p.kind));
  const line = p.amount ? `${label} · ${fmtSqk(p.amount, lang)}` : label;
  const out = [
    `🔔 <b>${vi ? 'Biến động ví' : 'Wallet activity'}</b> · ${addrShort(p.address)}`,
    line,
  ];
  if (p.tx) out.push(`🔗 <a href="https://sepolia.etherscan.io/tx/${esc(p.tx)}">Etherscan</a>`);
  return out.join('\n');
}

export function digestMsg(lang: Lang, p: {
  day: string; wallets: number; claimable: bigint; ready: number; height: number;
  per?: { address: string; claimable: bigint; ready: number }[];
}): string {
  const vi = lang !== 'en';
  const lines = [
    `📊 <b>Digest ${esc(p.day)}</b>`,
    '',
    `👛 ${vi ? 'Ví' : 'Wallets'} · ${p.wallets}`,
    `💰 Claimable · ${fmtSqk(p.claimable, lang)} token`,
    `🔁 ${vi ? 'Merge được' : 'Mergeable'} · ${p.ready}`,
    `⛏️ Block · ${fmtInt(p.height, lang)}`,
  ];
  if (p.per && p.per.length > 1) {
    lines.push('');
    for (const w of p.per) {
      lines.push(`${addrShort(w.address)} · ${fmtSqk(w.claimable, lang)} · ${w.ready} ${vi ? 'merge được' : 'ready'}`);
    }
  }
  return lines.join('\n');
}

export function privacy(lang: Lang): string {
  if (lang === 'en') {
    return [
      '🔒 <b>Privacy</b>',
      '',
      'Stored: Telegram ID, wallet addresses you add, alert settings.',
      'Not stored: private keys, seed phrases. The bot cannot sign.',
      '',
      '/delete wipes everything.',
    ].join('\n');
  }
  return [
    '🔒 <b>Quyền riêng tư</b>',
    '',
    'Lưu: Telegram ID, địa chỉ ví bạn thêm, cài đặt thông báo.',
    'Không lưu: private key, seed phrase. Bot không ký giao dịch.',
    '',
    '/delete để xoá toàn bộ.',
  ].join('\n');
}
