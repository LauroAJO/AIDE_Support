# AIDE Cron Worker

Standalone Cloudflare **Worker** (not Pages) that triggers AIDE's daily deadline
notifications. It exists because Cloudflare Pages does not support `[triggers]`
cron — so this satellite Worker runs on a cron and calls AIDE over HTTP.

Daily at **08:00 UTC** it does:

```
POST {AIDE_URL}/api/cron/run    header: X-Cron-Secret: {CRON_SECRET}
```

AIDE validates the secret and runs `runDailyNotifications` (due-tomorrow +
overdue tasks → in-app notification + push, deduped per user/task/day).

## Deploy

```bash
cd aide_cron_worker
npx wrangler deploy
```

## Secrets / vars

- `AIDE_URL` — set in `wrangler.toml` (`https://aide-support.pages.dev`).
- `CRON_SECRET` — **secret**, must match the `CRON_SECRET` secret on the
  `aide-support` Pages project:
  ```bash
  npx wrangler secret put CRON_SECRET           # here (aide-cron)
  npx wrangler pages secret put CRON_SECRET --project-name aide-support
  ```
  Use the same random value in both.

## Manual test

```
GET https://aide-cron.<subdomain>.workers.dev/trigger?secret=<CRON_SECRET>
```
or, in the Cloudflare Dashboard → Workers → aide-cron → trigger the cron.
