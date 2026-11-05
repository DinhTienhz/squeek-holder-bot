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
  { name: 'start', group: 'other', en: 'register and show the intro', vi: 'đăng ký và xem hướng dẫn' },
  { name: 'help', group: 'other', en: 'this command list', vi: 'danh sách lệnh này' },

  { name: 'watch', usage: '0x… [label]', group: 'wallets', en: 'track a wallet (max 5)', vi: 'theo dõi ví (tối đa 5)' },
  { name: 'unwatch', usage: '0x… | label', group: 'wallets', en: 'stop tracking a wallet', vi: 'bỏ theo dõi ví' },
  { name: 'list', group: 'wallets', en: 'your wallets', vi: 'danh sách ví' },

  { name: 'status', group: 'track', en: 'hamster, block, round', vi: 'hamster, block, round' },
  { name: 'claim', usage: '[0x…]', group: 'track', en: 'exact claimable, one transaction', vi: 'số claim chính xác, 1 giao dịch' },
  { name: 'mergecheck', usage: '[0x…]', group: 'track', en: 'Squeeks off cooldown', vi: 'Squeek đã hết cooldown' },
  { name: 'ladder', usage: '[0x…]', group: 'track', en: 'merge plan + power gain', vi: 'kế hoạch merge + power gain' },
  { name: 'threshold', usage: '[amount]', group: 'track', en: 'claim alert level (bare: show current)', vi: 'ngưỡng báo claim (trống: xem hiện tại)' },

  { name: 'alerts', usage: '[on|off]', group: 'notifications', en: 'all wallet alerts (bare: show state)', vi: 'mọi cảnh báo ví (trống: xem trạng thái)' },
  { name: 'hamster', usage: '[on|off]', group: 'notifications', en: 'wheel start/stop alerts', vi: 'cảnh báo hamster chạy/dừng' },
  { name: 'activity', usage: '[on|off | 0x…]', group: 'notifications', en: 'every wallet event, incl. rewards claimed (0x…: recent)', vi: 'mọi biến động ví, gồm claim thưởng (0x…: xem gần đây)' },
  { name: 'block', usage: '[on|off]', group: 'notifications', en: 'completed block alerts', vi: 'cảnh báo block hoàn thành' },
  { name: 'digest', usage: '[on|off]', group: 'notifications', en: 'daily summary', vi: 'tổng hợp hằng ngày' },
  { name: 'quiet', usage: '[22:00-07:00 | off]', group: 'notifications', en: 'quiet hours (bare: show state)', vi: 'giờ im lặng (trống: xem trạng thái)' },

  { name: 'lang', usage: 'vi | en', group: 'other', en: 'switch language (bare: show current)', vi: 'đổi ngôn ngữ (trống: xem hiện tại)' },
  { name: 'privacy', group: 'other', en: 'what is stored', vi: 'dữ liệu được lưu gì' },
  { name: 'delete', group: 'other', en: 'wipe your data', vi: 'xoá toàn bộ dữ liệu' },

  { name: 'stats', group: 'admin', admin: true, en: 'usage stats', vi: 'thống kê sử dụng' },
  { name: 'ban', usage: 'id', group: 'admin', admin: true, en: 'block a user', vi: 'chặn người dùng' },
  { name: 'unban', usage: 'id', group: 'admin', admin: true, en: 'unblock a user', vi: 'bỏ chặn người dùng' },
];
