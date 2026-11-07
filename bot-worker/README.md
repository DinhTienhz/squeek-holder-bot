# squeek-bot — Cloudflare Workers port

Telegram bot for Squeekchain, running as a Worker: webhook for commands, cron for polling.
State lives in D1 (`squeek-bot`), no servers and no long polling.

## Layout
- `src/index.ts` — `fetch` (webhook + /health) and `scheduled` (status, settlements, wallets, digest).
- `src/bot.ts` — the same commands as `../src/bot.ts`, with awaited D1 calls.
- `src/db.ts` — D1 adapter: same function names as the SQLite version, all async.
- `src/config.ts` — env parsing (no `dbPath`; D1 is the store).
- `schema.sql` — D1 schema (users, wallets, sent, meta, seen_activity, snapshots).

## Endpoints
- `POST /telegram` — Telegram webhook.
- `GET /health` — `{"ok":true}` for uptime checks.

## Deploy
```
npx wrangler deploy
npx wrangler d1 execute squeek-bot --remote --file=schema.sql   # first time
```

## Cut over from the Node bot
```
./cutover.sh          # asks for the bot token, sets the secret, calls setWebhook
pkill -f 'node src/index.ts'
```
Rollback: `./rollback.sh`, then start `node src/index.ts` again.

## Free plan vs Workers Paid ($5)
The cron runs every minute. A single invocation on the free plan has **10 ms of CPU**; on
Paid it has **30 s**. That only changes how many wallets one tick can process.

| Plan | `WALLET_BATCH` | `WALLET_CONCURRENCY` | Freshness |
|------|----------------|----------------------|-----------|
| Free | 8              | 4                    | ~1 min for ≤ 25 wallets, slower as the list grows |
| Paid | 300            | 10                   | ~1 min for 1,000–2,000 wallets |

Change them in `wrangler.toml` (`[vars]`) and redeploy. No code change is needed when upgrading.

Cron cadence: sensor sample every minute, settlements every 3 minutes, digest at `DIGEST_HOUR`
Asia/Ho_Chi_Minh, pruning at minute 0.

## Notes
- Free-plan fits the current 25 wallets comfortably; upgrade to Paid once the wallet count
  passes ~60–100, otherwise the rotation gets slow.
- `sent` rows migrated from SQLite prevent duplicate alerts after the switch.
- `snapshots` stores each address's previous state so cooldown alerts survive between
  invocations (Workers have no in-memory state).

## OTC market alerts

`/market on|off` toggles alerts for the Sepolia escrow (`Listed`, `BidPlaced`, `Sold`,
`BidAccepted`). Every second minute the cron scans up to 300 new blocks with `eth_getLogs`,
decodes the events locally (`src/market.ts`) and sends one message per event and user:

- what happened (`New listing` / `New bid` / `Sold`), token or bid id, price in ETH
- the addresses involved and the direction of the move (seller → escrow, NFT seller → buyer, ETH buyer → seller)
- a Sepolia Etherscan link to the transaction

The cursor lives in `meta.otc_block`; the first run only records the head, so nothing is replayed.
Alerts respect `/alerts`, `/quiet` and blocked users.
