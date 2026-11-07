/**
 * Single source of truth for the command surface.
 * Used by /help and by the Telegram command menu, so they cannot drift.
 */
export type Group = 'wallets' | 'track' | 'notifications' | 'other' | 'admin';

export type CommandDef = {
  name: string;
  usage?: string;
  en: string;
  vi: string;
  group: Group;
  admin?: boolean;
};

export const COMMANDS: CommandDef[] = [
  // Wallets
  { name: 'watch', usage: '0x… [label]', group: 'wallets', en: 'add a wallet (max 5)', vi: 'thêm ví (tối đa 5)' },
  { name: 'unwatch', usage: '0x… | label', group: 'wallets', en: 'remove by address or label', vi: 'bỏ theo địa chỉ hoặc nhãn' },
  { name: 'list', group: 'wallets', en: 'your wallets', vi: 'danh sách ví' },

  // Tracking
  { name: 'status', group: 'track', en: 'chain, wheel and round', vi: 'chain, bánh xe và round' },
  { name: 'claim', usage: '[0x… | label]', group: 'track', en: 'exact claimable, one tx', vi: 'số claim chính xác, 1 giao dịch' },
  { name: 'mergecheck', usage: '[0x… | label]', group: 'track', en: 'Squeeks off cooldown', vi: 'Squeek đã hết cooldown' },
  { name: 'ladder', usage: '[0x… | label]', group: 'track', en: 'merge plan + power gain', vi: 'kế hoạch merge + power gain' },
  { name: 'threshold', usage: '[amount]', group: 'track', en: 'claim alert level', vi: 'ngưỡng báo claim' },

  // Alerts
  { name: 'alerts', usage: '[on|off]', group: 'notifications', en: 'all wallet alerts', vi: 'mọi cảnh báo ví' },
  { name: 'hamster', usage: '[on|off]', group: 'notifications', en: 'wheel start / stop', vi: 'bánh xe chạy / dừng' },
  { name: 'block', usage: '[on|off]', group: 'notifications', en: 'completed blocks', vi: 'block hoàn thành' },
  { name: 'activity', usage: '[on|off | 0x…]', group: 'notifications', en: 'every wallet event', vi: 'mọi biến động ví' },
  { name: 'market', usage: 'on|off | list|bid|sold', group: 'notifications', en: 'Squeek Market alerts', vi: 'cảnh báo Squeek Market' },
  { name: 'digest', usage: '[on|off]', group: 'notifications', en: 'daily summary', vi: 'tổng hợp hằng ngày' },
  { name: 'quiet', usage: '[22:00-07:00 | off]', group: 'notifications', en: 'silent hours', vi: 'giờ im lặng' },

  // Other
  { name: 'lang', usage: 'vi | en', group: 'other', en: 'language', vi: 'ngôn ngữ' },
  { name: 'privacy', group: 'other', en: 'what is stored', vi: 'dữ liệu được lưu gì' },
  { name: 'delete', group: 'other', en: 'wipe your data', vi: 'xoá toàn bộ dữ liệu' },
  { name: 'start', group: 'other', en: 'intro', vi: 'giới thiệu' },
  { name: 'help', group: 'other', en: 'this list', vi: 'danh sách này' },

  // Admin
  { name: 'stats', group: 'admin', admin: true, en: 'usage stats', vi: 'thống kê sử dụng' },
  { name: 'ban', usage: 'id', group: 'admin', admin: true, en: 'block a user', vi: 'chặn người dùng' },
  { name: 'unban', usage: 'id', group: 'admin', admin: true, en: 'unblock a user', vi: 'bỏ chặn người dùng' },
];
