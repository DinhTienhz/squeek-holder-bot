# Squeek Holder Bot

Bot Telegram đa người dùng cho holder [Squeekchain](https://squeekchain.com) (Sepolia testnet).
Ai biết username bot đều có thể `/start` và dùng — không cần mời.

## Tính năng (MVP)

- **Watchlist**: mỗi người thêm tối đa 5 ví, đặt tên
- **Claimable alert**: báo khi SQK claim được vượt ngưỡng (mặc định 0.5 SQK), báo lại ở mỗi bội số ngưỡng
- **Merge cooldown alert**: báo khi Squeek chuyển `cooldown → ready`
- **Hamster alert**: báo khi bánh xe đổi trạng thái `SPINNING ↔ IDLE`
- **Quiet hours + alerts on/off** theo từng người
- **Song ngữ** vi/en
- **Riêng tư**: chỉ lưu Telegram ID, địa chỉ ví, cài đặt; `/delete` xoá sạch
- **Admin**: `/stats`, `/block`, `/unblock`

## Lệnh

| Lệnh | Việc |
|---|---|
| `/start` | đăng ký + hướng dẫn |
| `/watch 0x… [tên]` | thêm ví |
| `/unwatch 0x… \| tên` | bỏ ví |
| `/list` | danh sách ví |
| `/status` | trạng thái bánh xe + block |
| `/claim [0x…]` | SQK claim được + số batch (32 NFT/batch) |
| `/mergecheck [0x…]` | Squeek đã hết cooldown |
| `/threshold 0.5` | ngưỡng báo claim |
| `/alerts on\|off` | bật/tắt alert |
| `/quiet 22:00-07:00` | im lặng theo giờ máy |
| `/lang vi\|en` | đổi ngôn ngữ |
| `/privacy`, `/delete` | dữ liệu |

## Chạy

```bash
npm ci
cp .env.example .env && chmod 600 .env   # điền TELEGRAM_BOT_TOKEN
npm start
```

Không có token → chạy `DRY_RUN` (vẫn poll dữ liệu, không gửi tin):

```bash
npm run dry
```

## Test

```bash
npm test
```

17 test: rule claim/cooldown/hamster, format số, rate-limit queue, quiet hours, DB (giới hạn ví, dedupe, wipe).

## Kiến trúc

```
src/api.ts     client API Squeekchain (ETag, backoff 429/5xx, timeout)
src/rules.ts   pure functions: evaluateAccount / evaluateHamster / formatSqk
src/db.ts      node:sqlite (users, wallets, sent) — không cần dependency native
src/queue.ts   1 tin/giây mỗi chat + quiet hours
src/bot.ts     grammY handlers + i18n vi/en
src/index.ts   vòng poll: status 15s, ví 45s, healthcheck 5 phút
```

Dữ liệu lấy từ API công khai `api.squeekchain.com/v1` (`/status`, `/accounts/{address}`).
Không đọc private key, không ký giao dịch — mọi hành động đều là link mở app chính thức.

## Giới hạn đã biết

- Claim số liệu lấy từ API (indexer), có thể trễ vài block so với contract
- Chưa hỗ trợ Discord (v2)
- Alert chỉ gửi khi không trong quiet hours; không có digest (v2)
