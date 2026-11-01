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
export function fmtNum(n: number, lang: Lang = 'en', digits = 2): string {
  const fixed = n.toFixed(digits);
  const [whole, frac] = fixed.split('.');
  return group(whole, lang) + (frac ? (lang === 'en' ? '.' : ',') + frac : '');
}

/** 7235340000000000000000n → "7,235.34 SQK" (en) / "7.235,34 SQK" (vi) */
export function fmtSqk(base: bigint, lang: Lang = 'en', decimals = 2): string {
  const neg = base < 0n;
  const v = neg ? -base : base;
  const whole = group((v / 10n ** 18n).toString(), lang);
  const frac = (v % 10n ** 18n).toString().padStart(18, '0').slice(0, decimals).replace(/0+$/, '');
  const body = frac ? `${whole}${lang === 'en' ? '.' : ','}${frac}` : whole;
  return `${neg ? '-' : ''}${body} SQK`;
}

/** Địa chỉ rút gọn để hiển thị inline (bản đầy đủ nằm ở /list). */
export const addrShort = (a: string): string =>
  `<code>${esc(a.slice(0, 6))}…${esc(a.slice(-4))}</code>`;

export const fullAddr = (a: string): string => `<code>${esc(a)}</code>`;

const L = {
  vi: {
    appLink: '🔗 Mở app để ký',
    approxRpc: 'Ước lượng từ API — RPC không đọc được từng token.',
    approxNoRpc: 'Ước lượng từ API — chưa cấu hình RPC_URL.',
    noWallet: '👛 Chưa có ví nào.\nThêm bằng <code>/watch 0x…</code>',
    badAddr: '⚠️ Địa chỉ không hợp lệ.\nCần <code>0x</code> + 40 ký tự hex.',
    apiDown: '⚠️ API không phản hồi. Thử lại sau ít phút.',
  },
  en: {
    appLink: '🔗 Open app to sign',
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

export function help(lang: Lang): string {
  if (lang === 'en') {
    return [
      '📖 <b>COMMANDS</b>',
      '',
      '<b>Wallets</b>',
      '/watch <code>0x…</code> [label] · max 5',
      '/unwatch <code>0x…</code> | label',
      '/list',
      '',
      '<b>Track</b>',
      '/status · /claim · /mergecheck · /ladder',
      '/threshold 0.5 · /block on|off',
      '',
      '<b>Notifications</b>',
      '/alerts on|off · /quiet 22:00-07:00',
      '/digest on|off',
      '',
      '<b>Other</b>',
      '/lang vi|en · /privacy · /delete',
    ].join('\n');
  }
  return [
    '📖 <b>LỆNH</b>',
    '',
    '<b>Ví</b>',
    '/watch <code>0x…</code> [tên] · tối đa 5',
    '/unwatch <code>0x…</code> | tên',
    '/list',
    '',
    '<b>Theo dõi</b>',
    '/status · /claim · /mergecheck · /ladder',
    '/threshold 0.5 · /block on|off',
    '',
    '<b>Thông báo</b>',
    '/alerts on|off · /quiet 22:00-07:00',
    '/digest on|off',
    '',
    '<b>Khác</b>',
    '/lang vi|en · /privacy · /delete',
  ].join('\n');
}

export function walletList(lang: Lang, wallets: { address: string; label: string | null }[], max: number): string {
  const head = lang === 'en'
    ? `👛 <b>Wallets</b> · ${wallets.length}/${max}`
    : `👛 <b>Ví đang theo dõi</b> · ${wallets.length}/${max}`;
  const rows = wallets.map((w, i) => {
    const label = w.label ? ` — ${esc(w.label)}` : '';
    return `${i + 1}. ${fullAddr(w.address)}${label}`;
  });
  const hint = lang === 'en' ? '<i>Add: /watch 0x… label</i>' : '<i>Thêm: /watch 0x… tên</i>';
  return [head, '', ...rows, '', hint].join('\n');
}

export function walletAdded(lang: Lang, address: string, label: string | null): string {
  const name = label ? ` — ${esc(label)}` : '';
  return lang === 'en'
    ? `✅ Added ${addrShort(address)}${name}`
    : `✅ Đã thêm ${addrShort(address)}${name}`;
}

export function statusMsg(lang: Lang, s: {
  coreStatus: string; rpmMilli: number; blockHeight: number; blockProgress: number; settledThroughRound: number;
}, ageSec: number): string {
  const spinning = s.coreStatus === 'SPINNING';
  const state = spinning
    ? `🏃 ${lang === 'en' ? 'running' : 'đang chạy'} · ${fmtNum(s.rpmMilli / 1000, lang, 2)} rpm`
    : (lang === 'en' ? '😴 resting' : '😴 nghỉ');
  const pct = fmtNum((s.blockProgress / 1e9) * 100, lang, 1);
  return [
    `🐹 <b>Hamster</b> · ${state}`,
    `⛏️ <b>Block</b> ${fmtInt(s.blockHeight, lang)} · ${pct}%`,
    `🔄 <b>Round</b> ${fmtInt(s.settledThroughRound, lang)} ${lang === 'en' ? 'settled' : 'đã settle'}`,
    `<i>${lang === 'en' ? 'updated' : 'cập nhật'} ${ageSec}s ${lang === 'en' ? 'ago' : 'trước'}</i>`,
  ].join('\n');
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
    `🔁 <b>${vi ? 'Merge được' : 'Mergeable'} (${p.ready.length})</b> · ${addrShort(p.address)}`,
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
    `🔁 <b>Squeek #${esc(p.tokenId)} ${vi ? 'hết cooldown' : 'is off cooldown'}</b>`,
    `${vi ? 'Ví' : 'Wallet'} ${addrShort(p.address)} · ${vi ? 'merge được ngay' : 'mergeable now'}`,
  ].join('\n');
}

export function alertHamster(lang: Lang, s: { coreStatus: string; rpmMilli: number; blockHeight: number; blockProgress: number }): string {
  const vi = lang !== 'en';
  if (s.coreStatus === 'SPINNING') {
    return [
      `🐹 <b>${vi ? 'Hamster đang chạy' : 'Hamster is running'}</b>`,
      `${fmtNum(s.rpmMilli / 1000, lang, 2)} rpm · Block ${fmtInt(s.blockHeight, lang)}`,
    ].join('\n');
  }
  const pct = fmtNum((s.blockProgress / 1e9) * 100, lang, 1);
  return [
    `😴 <b>${vi ? 'Hamster đã dừng' : 'Hamster stopped'}</b>`,
    `Block ${fmtInt(s.blockHeight, lang)} · ${pct}%`,
  ].join('\n');
}

export function alertBlock(lang: Lang, p: { height: number; minted: bigint | null }): string {
  const vi = lang !== 'en';
  const second = p.minted
    ? `+${fmtSqk(p.minted, lang)} ${vi ? 'vừa phát' : 'minted'}`
    : (vi ? 'không phát SQK' : 'no SQK minted');
  return [`⛏️ <b>Block #${fmtInt(p.height, lang)}</b>`, second].join('\n');
}

export function alertActivity(lang: Lang, p: { address: string; kind: string; amount: bigint | null; tx?: string }): string {
  const vi = lang !== 'en';
  const line = p.amount ? `${esc(p.kind)} · ${fmtSqk(p.amount, lang)}` : esc(p.kind);
  const out = [
    `🔔 <b>${vi ? 'Biến động ví' : 'Wallet activity'}</b> · ${addrShort(p.address)}`,
    line,
  ];
  if (p.tx) out.push(`🔗 <a href="https://sepolia.etherscan.io/tx/${esc(p.tx)}">Etherscan</a>`);
  return out.join('\n');
}

export function digestMsg(lang: Lang, p: { day: string; wallets: number; claimable: bigint; ready: number; height: number }): string {
  const vi = lang !== 'en';
  return [
    `📊 <b>Digest ${esc(p.day)}</b>`,
    '',
    `👛 ${vi ? 'Ví' : 'Wallets'} · ${p.wallets}`,
    `💰 Claimable · ${fmtSqk(p.claimable, lang)}`,
    `🔁 ${vi ? 'Merge được' : 'Mergeable'} · ${p.ready}`,
    `⛏️ Block · ${fmtInt(p.height, lang)}`,
  ].join('\n');
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
