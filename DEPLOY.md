# Deploy the landing page

The site is static: everything lives in `public/`. No build step.

## Option A — Workers Builds (Git-connected Worker + static assets)

`wrangler.toml` serves `public/` through a minimal Worker (`src/worker.js` das ASSETS).

1. Cloudflare dashboard → **Create an app** → connect repo `DinhTienhz/squeek-holder-bot`
2. **Build command**: *(empty)*
3. **Deploy command**: `npx wrangler deploy`
4. **Enable Preview builds**: off (optional)
5. **Advanced → Path**: `/`
6. If asked for an API token, click **Create new token**
7. **Deploy** → URL `https://squeek-holder-bot.<account>.workers.dev`

Every push to the connected branch rebuilds and redeploys.

## Option B — Cloudflare Pages, Git integration (auto-deploy on every push)

1. Open <https://dash.cloudflare.com/> → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Authorise GitHub and pick repository **`DinhTienhz/squeek-holder-bot`**, branch **`master`**
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **`public`**
4. **Save and Deploy** → first deploy takes ~30 s
5. URL: `https://squeek-holder-bot.pages.dev`

Every `git push` to `master` redeploys automatically. No secrets, no CI config.

## Option C — Direct upload with wrangler (manual, Pages)

```bash
export CLOUDFLARE_API_TOKEN=...      # token with "Cloudflare Pages: Edit"
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler pages deploy public --project-name squeek-holder-bot
```

`wrangler.toml` already sets `pages_build_output_dir = "public"`, so
`npx wrangler pages deploy` without arguments also works.

## Custom domain

After the project exists: **Pages project → Custom domains → Set up a domain**.
For a subdomain on Cloudflare DNS the CNAME is created automatically; otherwise
add the shown CNAME at your DNS provider. TLS is issued automatically.

Do not change the record after submitting the site to Squeekchain Genesis — they
recheck it daily and a changed or missing record fails verification.

## What must stay true

- `GET /` returns the landing page (not a directory listing)
- `logo-mark.png`, `logo-mark-32.png`, `favicon.ico` are served from the root
- The Telegram button points at <https://t.me/SqueekHolder_Bot>
