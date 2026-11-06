# Squeek Holder Bot

[![test](https://github.com/DinhTienhz/squeek-holder-bot/actions/workflows/test.yml/badge.svg)](https://github.com/DinhTienhz/squeek-holder-bot/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A524-brightgreen.svg)](package.json)

Multi-user Telegram bot for [Squeekchain](https://squeekchain.com) holders (Sepolia testnet).
Anyone who knows the bot's username can `/start` — no invite needed.

**Bot:** [@SqueekHolder_Bot](https://t.me/SqueekHolder_Bot) · **Landing page:** <https://squeek-holder-bot.chainn.workers.dev/> · **OTC market:** <https://squeeksotc.bid/otc>

## OTC market

Non-custodial NFT trading on Sepolia: **<https://squeeksotc.bid/otc>**

| | |
|---|---|
| Collection | [`0xc4c7982657f00509548f3a3a41db7fa439a6856b`](https://sepolia.etherscan.io/address/0xc4c7982657f00509548f3a3a41db7fa439a6856b) (Squeek) |
| Escrow | [`0xe0c16a29c0ad3b123600284ceb1bc1678a171799`](https://sepolia.etherscan.io/address/0xe0c16a29c0ad3b123600284ceb1bc1678a171799) |
| Fee | 0.1% (10 bps), fixed in the contract |
| Fee recipient | [`0xd7a9f658E176B429869Fc934DF0214b05Eee8F48`](https://sepolia.etherscan.io/address/0xd7a9f658E176B429869Fc934DF0214b05Eee8F48) |

The escrow holds the NFT until the ETH arrives. Payment and transfer settle in the same
transaction, so there is no "send first" step and no operator in the middle. The contract has
no owner, no pause switch and no upgrade path.

### What you can do

- **List** — approve the escrow, then set a price. The NFT moves into escrow until it sells or the seller cancels.
- **Buy** — pay the listing price plus the 0.1% fee. The NFT leaves escrow and the seller is paid in the same transaction.
- **Cancel** — a seller can pull a listing back at any time; the NFT returns to them.
- **Bid** — place an ETH-backed bid at any price for the whole collection, not a specific token. Several bidders may sit at the same price.
- **Accept a bid** — any holder can sell a token into a price level. Within a level bids are served first-in, first-out, so the earliest bidder is matched first. The seller pays the 0.1% fee on this path.
- **Activity** — listings, sales and bid events are read from chain logs, so the feed works without a wallet.

### Notes

- Each escrow is bound to one collection (the NFT address is immutable). A different collection needs its own escrow deployment.
- `cancelBid` refunds the bidder immediately; `acceptBid` pays the seller `amount - fee` in the same transaction.
- Bids are stored in a doubly linked list per price level, so cancelling a bid is O(1) and cannot be used to make acceptance progressively more expensive.
- The page reads the market, the bid book and the activity feed over public RPC — no wallet, no account needed to browse.

### Contract tests

Hardhat suite against a mock ERC-721 covering list/buy/cancel, bids, FIFO ordering, fee maths,
refunds, approvals and view functions — plus a gas test asserting that cancelled bids do not
inflate the cost of accepting the head bid.

## Features

1. **Claimable above threshold** — DM when unclaimed SQK is at or above the threshold; repeats only when it doubles or after 6 hours (anti-spam)
2. **Claim optimizer** — `/claim`: batches of up to 32 tokens, total, dust, number of transactions
3. **Cooldown + /mergecheck** — pings when `cooldown → ready`, lists mergeable tokens
4. **Merge ladder** — `/ladder`: merge plan by level, cooldown block, power gain
5. **Hamster running/stopped** — alerts both ways (based on RPM + work counter rather than `coreStatus`, which can stay IDLE while the wheel spins); fires as soon as the wheel turns, confirms a stop after ~30 s of silence; includes run duration; toggle with `/hamster on|off`
6. **Block completed** — height + SQK issued (supply delta)
7. **Wallet activity** — new events (transfer/stake/merge…), excluding `rewards_claimed`
8. **Watchlist + quiet hours + digest** — 5 wallets per user, overnight silence, daily digest

Also: **English by default**, switch to Vietnamese with `/lang vi`; `/privacy`, `/delete`; admin `/stats`, `/ban`, `/unban`.

## Commands

| Command | What it does |
|---|---|
| `/start` | register + short guide |
| `/watch 0x… [name]` | add a wallet |
| `/unwatch 0x… \| name` | remove a wallet |
| `/list` | list wallets |
| `/status` | wheel status + block |
| `/claim [0x…]` | claimable SQK + number of batches (32 NFTs per batch) |
| `/mergecheck [0x…]` | Squeeks past their cooldown |
| `/threshold 0.5` | claim alert threshold |
| `/alerts on\|off` | wallet alerts |
| `/hamster on\|off` | hamster start/stop alerts |
| `/block on\|off` | block-completed alerts |
| `/digest on\|off` | daily digest |
| `/help` | command list |
| `/quiet 22:00-07:00` | quiet hours in server time |
| `/lang vi\|en` | switch language |
| `/privacy`, `/delete` | data handling |

## Run

```bash
npm ci
cp .env.example .env && chmod 600 .env   # fill in TELEGRAM_BOT_TOKEN
npm start
```

Without a token the bot runs in `DRY_RUN` (still polls data, sends nothing):

```bash
npm run dry
```

## Test

```bash
npm test
```

73 tests: claim/cooldown/hamster rules, claim optimizer, merge ladder, message formatting
(HTML escaping, en/vi number locale), rate-limit queue, quiet hours, database (wallet limits,
dedupe, activity, meta, wipe) and worker host routing for the OTC domain.

## Architecture

```
src/api.ts     Squeekchain API client (ETag, 429/5xx backoff, timeout)
src/format.ts  all user-facing copy (HTML, en/vi locale) — pure, tested
src/rules.ts   pure: evaluateAccount / evaluateHamster / optimizeClaim / planLadder
src/db.ts      node:sqlite (users, wallets, sent) — no native dependency
src/queue.ts   1 message/second per chat + quiet hours
src/bot.ts     grammY handlers + vi/en i18n
src/chain.ts   claimable() per token via multicall (fail-soft to the API)
src/worker.js  Cloudflare Worker: static site + OTC host routing
src/index.ts   poll: status 15 s, wallets 45 s, digest 60 s, healthcheck 5 min
```

Data comes from the public API at `api.squeekchain.com/v1` (`/status`, `/accounts/{address}`).
No private keys are read and no transactions are signed — every action is a link into the
official app.

## Known limitations

- Claimable amounts come from the indexer API (a few blocks behind); `claimable()` reverts on this Sepolia deployment, so the optimizer labels figures as estimates when it cannot read per token
- No Discord support
- Regular alerts are dropped (not queued) during quiet hours; the digest still goes out
- The OTC escrow is Sepolia-only and bound to a single collection

## Static site

`public/` is a static site (dark landing page with a live Squeekchain panel) served by
`src/worker.js`. The market lives on its own host, `squeeksotc.bid`; custom domains are
managed in the Cloudflare dashboard, not in `wrangler.toml` (a `routes` entry breaks the
workers.dev host with error 1042).

Exercise every bot command without a Telegram user: `node scripts/e2e-bot.ts`.

Verify the deployment: `./scripts/smoke.sh` (12 checks: page, headers, assets, 404). See [DEPLOY.md](DEPLOY.md).

## License

MIT — see [LICENSE](LICENSE).
