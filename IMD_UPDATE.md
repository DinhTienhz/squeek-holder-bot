# IMD change request — one consolidated update

Paste the block below into **Change the site** on the existing job. One request,
0.5 IMD, replaces the informal "one fix at a time" flow.

---

Rebuild the published site from the repository HEAD (branch `master`) of
https://github.com/DinhTienhz/squeek-holder-bot — do not redesign it, mirror it.

Deliver `public/` as the site root, with `index.html` served at `/`:

- `index.html` (single file, inline CSS/JS, no build step, no framework)
- `logo-mark.png`, `logo-mark-32.png`, `logo-180.png`, `favicon.ico`, `og.png`
- asset paths must stay relative (`logo-mark.png`, not `/logo-mark.png`)

Requirements:

1. `GET /` returns the page HTML with HTTP 200 and
   `<title>Squeek Holder Bot — Telegram alerts for Squeekchain</title>`.
   It must not return a directory listing.
2. Header shows `<img class="logo" src="logo-mark.png?v=2">` next to the text
   "Squeek Holder Bot".
3. The primary button links to `https://t.me/SqueekHolder_Bot` and opens in a new tab.
4. The live panel keeps polling `https://api.squeekchain.com/v1/status` every 10 s and
   `/economy/state` every 60 s, shows numbers, keeps the last values on error and
   switches the timestamp to "data unavailable" after 60 s without data.
5. The "Refresh now" button disables while the request is in flight and must return to
   its label afterwards — it must never stay on "Refreshing…".
6. Keep the canonical URL, Open Graph and Twitter card meta tags pointing at
   `https://squeek-holder-bot.chainn.workers.dev/`.

Acceptance (must all hold after publish):

- `curl -sS <site>/ | grep -c 't.me/SqueekHolder_Bot'` returns 1
- `curl -sSI <site>/logo-mark-32.png` returns 200 and `image/png`
- `/` renders the logo, the live panel with values, and a working Refresh button
- no placeholder links, no TODO text, no references to any other bot username

Do not deploy contracts and do not add a backend. This is a static site.
