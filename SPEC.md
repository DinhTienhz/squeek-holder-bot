# SPEC — Squeek Holder Bot

## Mục tiêu

Bot Telegram công khai, đa người dùng, giúp holder Squeekchain biết **khi nào có tiền để claim** và **khi nào Squeek merge được**, mà không phải mở app.

Người dùng tìm bot bằng username, `/start` là dùng được. Không cần mời, không cần whitelist.

## Người dùng & quyền

- Mỗi Telegram ID = 1 tài khoản, tối đa **5 ví**
- Không phân biệt holder hay không (bot chỉ đọc dữ liệu công khai)
- Admin (env `ADMIN_IDS`): `/stats`, `/block`, `/unblock`

## Nguồn dữ liệu

- `GET https://api.squeekchain.com/v1/status` — trạng thái bánh xe, block height/progress
- `GET https://api.squeekchain.com/v1/accounts/{address}` — `rewards.claimableBaseUnits`, `tokens[]` với `level`, `mergeState`, `nextMergeHeight`
- Chỉ **đọc**. Không ký, không giữ key.

## Yêu cầu chức năng & tiêu chí nghiệm thu

| # | Yêu cầu | Tiêu chí nghiệm thu (test) |
|---|---|---|
| F1 | `/start` tạo user, trả hướng dẫn | user mới có `lang=en`, `alerts=1`; gọi lại không tạo trùng |
| F2 | `/watch 0x… [label]` | validate 0x+40 hex; trùng → báo; quá 5 ví → báo limit |
| F3 | Alert claimable vượt ngưỡng | vượt ngưỡng lần đầu → 1 alert; cùng ngưỡng không lặp; vượt bội số tiếp → alert mới |
| F4 | Alert cooldown → ready | chuyển `cooldown→ready` → alert đúng tokenId; `ready` sẵn từ đầu **không** alert |
| F5 | Alert hamster đổi trạng thái | `IDLE→SPINNING` → alert; giữ nguyên → không |
| F6 | Chống gửi trùng sau restart | cùng key chỉ gửi 1 lần (bảng `sent`) |
| F7 | Rate limit | mỗi chat ≥1,1 s/tin; 3 alert liên tiếp vẫn đủ, không 429 |
| F8 | Quiet hours | 22:00–07:00 không gửi alert thường; hỗ trợ khoảng qua nửa đêm |
| F9 | `/claim` | hiện claimable, số NFT, số batch = ceil(n/32), link mở app |
| F10 | `/mergecheck` | liệt kê token `mergeState=ready`, đếm số đang cooldown |
| F11 | `/threshold` | đổi ngưỡng, lưu base units chính xác (0.5 SQK = 5e17) |
| F12 | `/alerts off` | tắt hoàn toàn alert của user đó |
| F13 | `/privacy`, `/delete` | giải thích dữ liệu; xoá user + ví + sent |
| F14 | Admin | non-admin gọi `/stats` bị từ chối; `/ban` chặn user, `/unban` bỏ chặn |
| F15 | API lỗi/429 | backoff, không crash, không gửi alert sai |
| F16 | Multi-user | 2 user watch cùng 1 ví → API chỉ gọi 1 lần/vòng, mỗi người nhận alert riêng |
| F17 | Claim optimizer | 40 token → chọn 32 lớn nhất, `skipped=8`, `batches=2`, dust = tổng % 1e18 |
| F18 | Merge ladder | 4×L1 → 2 merge L2 → 1 merge L3; power trước/sau tính từ `basePower` |
| F19 | Block alert | block height tăng → 1 alert/người/block, kèm delta SQK minted; lần đầu chỉ lấy mốc |
| F20 | Wallet movement | activity mới → alert; `rewards_claimed` bị bỏ; lần đầu thêm ví không bắn loạt cũ |
| F21 | Digest | mỗi ngày 1 tin/người (đúng giờ cấu hình), tổng claimable + mergeable + block |
| F22 | Bật/tắt riêng | `/block on\|off`, `/digest on\|off` độc lập với `/alerts` |

## Không làm (non-goals)

- Không ký giao dịch, không giữ private key
- Không tự động claim/merge
- Không indexer riêng (dùng API công khai)
- Không Discord trong bản này (v2)
- Không leaderboard/hiển thị ví người khác

## Yêu cầu phi chức năng

- Node.js ≥ 24 (chạy trực tiếp `.ts`, `node:sqlite` không cần flag)
- Không dependency native; SQLite qua `node:sqlite`
- Chạy 24/7 dưới systemd `Restart=always`
- Healthcheck ngoài (healthchecks.io) mỗi 5 phút
- Log ra stdout (journald) hoặc file có rotation
- Thời gian phản hồi lệnh < 3 s (API bình thường)

## Định dạng tin nhắn

- **HTML parse mode**; mọi dữ liệu người dùng nhập phải escape (`&`, `<`, `>`)
- Số theo locale: `1,234.56 SQK` (en) · `1.234,56 SQK` (vi), tối đa 2 chữ số lẻ
- Mỗi tin có cấu trúc: tiêu đề in đậm + dòng số liệu + ghi chú in nghiêng; không dòng trắng thừa
- Địa chỉ: rút gọn `0x32cd…cc41` trong alert; đầy đủ trong `/list`
- Alert claim: số tiền + ví + ngưỡng + link app
- Ngôn ngữ mặc định: **tiếng Anh**; `/lang vi` để đổi
