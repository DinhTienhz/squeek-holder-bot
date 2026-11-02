# Squeek Holder Bot

[![test](https://github.com/DinhTienhz/squeek-holder-bot/actions/workflows/test.yml/badge.svg)](https://github.com/DinhTienhz/squeek-holder-bot/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A524-brightgreen.svg)](package.json)

Bot Telegram đa người dùng cho holder [Squeekchain](https://squeekchain.com) (Sepolia testnet).
Ai biết username bot đều có thể `/start` và dùng — không cần mời.

## 8 chức năng

1. **Claimable vượt ngưỡng** — DM khi SQK chưa claim ≥ ngưỡng, báo lại ở mỗi bội số
2. **Claim optimizer** — `/claim`: batch tối đa 32 token, tổng nhận, dust, số tx cần
3. **Cooldown + /mergecheck** — báo khi `cooldown → ready`, liệt kê token merge được
4. **Merge ladder** — `/ladder`: kế hoạch merge theo level, cooldown block, power gain
5. **Hamster chạy/dừng** — alert khi `SPINNING ↔ IDLE`, có RPM
6. **Block hoàn thành** — height + SQK phát ra (chênh lệch supply)
7. **Biến động ví** — activity mới (transfer/stake/merge…), trừ `rewards_claimed`
8. **Watchlist + quiet hours + digest** — 5 ví/người, im lặng ban đêm, digest hằng ngày

Kèm: **mặc định tiếng Anh**, đổi sang tiếng Việt bằng `/lang vi`; `/privacy`, `/delete`; admin `/stats`, `/ban`, `/unban`.

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

37 test: rule claim/cooldown/hamster, claim optimizer, merge ladder, format tin nhắn (HTML escape, locale số en/vi), rate-limit queue, quiet hours, DB (giới hạn ví, dedupe, activity, meta, wipe).

## Kiến trúc

```
src/api.ts     client API Squeekchain (ETag, backoff 429/5xx, timeout)
src/format.ts  toàn bộ nội dung hiển thị (HTML, locale en/vi) — pure, có test
src/rules.ts   pure: evaluateAccount / evaluateHamster / optimizeClaim / planLadder
src/db.ts      node:sqlite (users, wallets, sent) — không cần dependency native
src/queue.ts   1 tin/giây mỗi chat + quiet hours
src/bot.ts     grammY handlers + i18n vi/en
src/chain.ts   claimable() per token qua multicall (fail-soft về API)
src/index.ts   poll: status 15s, ví 45s, digest 60s, healthcheck 5 phút
```

Dữ liệu lấy từ API công khai `api.squeekchain.com/v1` (`/status`, `/accounts/{address}`).
Không đọc private key, không ký giao dịch — mọi hành động đều là link mở app chính thức.

## Giới hạn đã biết

- Số claimable lấy từ API indexer (trễ vài block); `claimable()` on-chain hiện revert trên deployment Sepolia này nên optimizer ghi rõ "ước lượng" khi không đọc được từng token
- Chưa hỗ trợ Discord
- Alert thường bị bỏ (không xếp hàng) trong quiet hours; digest thì vẫn gửi

## License

MIT — see [LICENSE](LICENSE).
