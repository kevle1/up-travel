# up-travel

A personal trip budget tracker on Cloudflare. Connects to Up Bank via your personal access token and shows whether you're pacing under your trip budget at a glance. Mobile-first, single page, designed for a year-long trip.

Single-user per deployment. Up's terms require each user to use their own PAT, so this is intended to be deployed to your own Cloudflare account.

## Features

- One mobile dashboard: pace vs target, daily allowance, today's spend, by-category bars, by-city breakdown, daily trend.
- Up Bank sync via hourly cron and Up webhooks (near-real-time).
- Manual cash entries with currency conversion (free, no key, via fawazahmed0/exchange-api).
- ATM-aware: ATM withdrawals count as spend; manual cash entries default to detail-only so you do not double-count.
- Itinerary-based city grouping with currency-fallback for Eurozone-style ambiguity.
- Multi-trip with archive: keep historical trips alongside the active one.
- Cloudflare Access in front of everything except the HMAC-verified `/webhook/up` route.

## One-click deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/<your-github-username>/up-travel)

After clicking:

1. Cloudflare forks the repo to your GitHub.
2. Cloudflare provisions Pages + Worker + D1 + KV on your account.
3. You are prompted for `UP_API_TOKEN` — paste your Up PAT.
4. Migrations run automatically via the post-deploy script.

After the deploy completes:

5. **Enable Cloudflare Access** on the Pages project (Zero Trust dashboard → Access → Applications → Add → Self-hosted → pick the Pages domain → add your email under "Allow" policy).
6. **Open the deployed URL once.** The app calls `POST /api/setup` which registers the Up webhook on your behalf and stores the webhook secret in KV. This is idempotent — safe to re-run.
7. **Create your first trip** (Trips tab → name, start date, budget) and paste your itinerary.

Done. Cron syncs every hour. Webhooks fire near-instantly when Up settles a transaction.

## Local development

```
pnpm install
pnpm --filter @up-travel/worker db:migrate:local
cp apps/worker/.dev.vars.example apps/worker/.dev.vars

# Edit .dev.vars with your real UP_API_TOKEN

pnpm dev
```

- Worker on http://localhost:8787
- Web on http://localhost:5173 (proxies `/api/*` and `/webhook/*` to the worker)
- Local D1 + KV via Miniflare; no Cloudflare account needed for local.

Webhooks do not fire to localhost. For local testing the hourly cron logic is exercised via the integration tests; for end-to-end webhook testing, deploy to a Cloudflare workers.dev URL and inspect Tail logs.

## Manual deploy (alternative to button)

```
./scripts/deploy-init.sh

# Paste the printed database_id and namespace id into apps/worker/wrangler.jsonc

pnpm --filter @up-travel/worker exec wrangler secret put UP_API_TOKEN
pnpm --filter @up-travel/worker exec wrangler deploy
./scripts/post-deploy.sh
```

Then follow steps 5-7 from the "After the deploy completes" section above.

## Architecture

See [`docs/superpowers/specs/2026-05-16-up-travel-design.md`](docs/superpowers/specs/2026-05-16-up-travel-design.md).

## Privacy

- The Up PAT lives as a Cloudflare Worker secret and never reaches your browser.
- The Up webhook secret lives in KV (encrypted at rest, readable only by the Worker).
- No third-party analytics. Worker logs (Cloudflare Tail) include sync summaries and error codes only; transaction descriptions, amounts, and secrets are never logged.
