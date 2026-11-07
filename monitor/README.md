# squeek-monitor

Independent uptime check for the bot **and the Squeek Market**. A separate Worker so it survives a
broken bot Worker.

- Cron `*/5 * * * *`, checks three targets in parallel:
  - `bot` → `https://squeek-bot.chainn.workers.dev/health` (expects `"ok":true`)
  - `otc-home` → `https://squeeksotc.bid/` (expects `Squeek OTC` in the page)
  - `otc-market` → `https://squeeksotc.bid/market` (expects `Squeek OTC`)
- One Telegram message per **up → down** transition, a reminder every 6 hours while down, and one
  message on recovery. State per target in D1 (`monitor` table, same database as the bot).
- Silent while healthy.

## Deploy
```
npx wrangler d1 execute squeek-bot --remote --file=schema.sql
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler deploy
```

`ALERT_CHAT_ID`, `BOT_HEALTH_URL`, `OTC_HOME_URL`, `OTC_MARKET_URL` are plain vars in `wrangler.toml`.

## Verify
- Remote: `npx wrangler d1 execute squeek-bot --remote --command "SELECT * FROM monitor ORDER BY key"` →
  `state:bot`, `state:otc-home`, `state:otc-market` all `up|<ts>`.
- Force a failure: point one URL var at a bad path, deploy, wait ≤5 minutes for the alert, then revert.
