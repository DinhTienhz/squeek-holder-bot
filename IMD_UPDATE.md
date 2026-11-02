# IMD change request — one consolidated update

Paste the block below into **Change the site** on the existing job (`b4610fb2` /
`e21589e7`). One request, 0.5 IMD, replaces the piecemeal fixes.

---

Rebuild the published site from repository HEAD (branch `master`) of
https://github.com/DinhTienhz/squeek-holder-bot — mirror it, do not redesign it.

Deliver `public/` as the site root, with `index.html` served at `/`:

- `index.html` (single file, inline CSS/JS, no build step, no framework)
- `logo-mark.png`, `logo-mark-32.png`, `logo-180.png`, `favicon.ico`, `og.png`
- asset paths must stay relative (`logo-mark.png`, not `/logo-mark.png`)

Requirements:

1. `GET /` returns the page with HTTP 200 and
   `<title>Squeek Holder Bot — Telegram alerts for Squeekchain</title>`.
   It must not return a directory listing.
2. Header shows `<img class="logo" src="logo-mark.png?v=2">` next to the text
   "Squeek Holder Bot".
3. The primary button links to `https://t.me/SqueekHolder_Bot` (opens in a new tab).
   No placeholder usernames anywhere.
4. Live panel: poll `https://api.squeekchain.com/v1/status` every 10 s and
   `/economy/state` every 60 s; show real numbers; keep the last values on error and
   switch the timestamp to "data unavailable" after 60 s without data.
5. "Refresh now" disables while the request is in flight and must return to its label
   afterwards — it must never stay on "Refreshing…".
6. Commands section lists all 18 commands, grouped Wallets / Track / Notifications /
   Other, including `/hamster on|off`, `/alerts`, `/unwatch`, `/help`, `/privacy`,
   `/lang`, `/delete`.
7. Feature card 5 is "Hamster alerts": a DM when the wheel starts **or** stops,
   with live RPM, toggled by `/hamster`.
8. Keep canonical, Open Graph and Twitter card meta tags pointing at
   `https://squeek-holder-bot.chainn.workers.dev/`.

Acceptance (must all hold after publish):

- `grep -c 't.me/SqueekHolder_Bot' index.html` returns 1
- `grep -c '/hamster on|off' index.html` returns 1
- `grep -c 'rel="canonical"' index.html` returns 1
- `/logo-mark-32.png` returns 200 with `image/png`
- `/` renders the logo, live values and a working Refresh button
- no placeholder links, no TODO text, no other bot username

Do not deploy contracts and do not add a backend. This is a static site.

---

## What changed vs the currently published IMD site

| Item | Published now | Target |
|---|---|---|
| Logo | none | `logo-mark.png` in header + favicon set |
| Telegram button | `t.me/squeekholderbot` (does not exist) | `t.me/SqueekHolder_Bot` |
| Commands listed | 13 | 18 (adds `/hamster`, `/alerts`, `/unwatch`, `/help`, `/privacy`) |
| Hamster card | "status" only | "alerts": start and stop, `/hamster` toggle |
| Refresh button | stays on "Refreshing…" | re-enables after the request |
| Canonical | missing | present |
| CSP connect-src | `https:` (any host) | only `api.squeekchain.com` |

## After the job

1. Check `curl -sS https://squeek-holder-bot-telegram-alert.imd.site/ | grep -c 'SqueekHolder_Bot'` → 1
2. Open the site and confirm the logo and the Refresh button.
3. Submit the project on Squeekchain Genesis with the IMD job URL (wallet `0x0e01…cc2c`).
