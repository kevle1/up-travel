# Up Travel Spend Tracker

A trip budget tracker that connects to your **Up Bank** account so you can see at a glance whether you're pacing under or over your travel budget.

Mobile-first, designed for extended trips where lumpy spending (accommodation deposits, monthly transit passes, the occasional cash withdrawal) makes "what's my daily burn?" it a bit harder to figure out. Designed throughout a 2 month Europe trip. Hopefully someone finds it as useful :)

> **Important: for personal use only.** Up Bank's [API terms](https://api.up.com.au) say each user must use their own personal access token. This app is built around that: you deploy it to **your own** Cloudflare account, your PAT lives as a worker secret, and your data never touches anyone else's server. Don't share a deployment with someone else, don't host this as a service - your own copy, your own token.

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kevle1/up-travel)

Click the button, sign in to Cloudflare, and the platform forks the repo, provisions a Worker + D1 + Pages on your account, prompts you for your `UP_API_TOKEN`, and runs migrations. Open the deployed URL, create your first trip, hit the sync button - done.

You'll want to add **Cloudflare Access** in front of the Pages domain so it's not publicly browseable. Zero Trust -> Access -> Applications -> self-hosted, pick the Pages domain, allow only your email.

## What you get

### Today
Your dashboard. At the top: how much you've spent today and your 7-day average, each labelled green / amber / red against your daily target. Below that: how much you're banked (or behind), how much budget is left, where today's spend went by category, a 30-day sparkline, and your **money runway** - how many days your remaining budget lasts at your current pace vs how many days are left in the trip. When a trip's over, the layout flips to a summary view: came in over or under budget, total spent, the whole-trip breakdown.

### Trends
Daily-burn chart over 3 / 7 / 14 / 30 / All days with the target line overlaid. Same window picker drives a category breakdown. Underneath, the **biggest spends across the whole trip** and a "what if" slider that projects how much you'll have at the end if you keep spending at $X/day.

### Spend
Every transaction in the trip window. Filter by category. Tap a row to:

- Re-tag from Up's generic category into one of 11 travel-specific ones (Accommodation, Food & Drink, Local Transport, Flights & Intercity, Sights & Activities, Nightlife & Bars, Shopping, Health & Pharmacy, Groceries, Cash, Other).
- **Mark it as accommodation** and link it to a stay (deposits + balance both get amortised across the nights you sleep there, so a lumpy hotel booking doesn't spike one day).
- **Spread it across N days** for things like 5-day transit passes - counts as 1/N each day instead of the full amount on day one.
- **Add notes** that go in your CSV export.
- **Exclude it** from totals (greyed out but still visible so you can re-include later).

Incoming funds (refunds, salary, transfers in) show up too, in green with a `+` prefix. They don't affect burn by default; flick a toggle to apply a refund against the day's spend.

### Stays
Each booking gets its own card with a per-night cost, a row of blocks showing how many nights you've slept, the lumpy real payment schedule, and a stepper to adjust nights. Add a stay manually, link multiple payments to the same one - the app sums them and divides by nights for the smooth amortised cost.

### Cash
Tracks physical cash. Up-sourced ATM withdrawals fill your "cash on hand"; tap **Log spend** with the "Paid in cash" toggle on to draw it back down. The withdrawn / spent / on-hand triple always reconciles. Non-cash manual spends live in the Spend tab and don't touch this view.

### Multiple trips
Header dropdown switches between trips. Each trip keeps its own budget, dates, current city, transactions, stays, cash logs and category overrides. Trip settings (the gear) lets you edit budget and target, archive, or delete with a two-tap confirm. Completed trips stay around in the switcher for reference.

## Other things worth knowing

- **Sync** runs hourly via a Cloudflare cron and on demand via the **🔄 button** in the top bar. Right-click the button to reset the watermark and pull everything from the trip start. Each spend gets stamped with the city you were in (from the stay covering that day), so it carries through even if stays change later.
- **CSV export** (download icon, top bar) covers every column you'd want: date, description, AUD amount, foreign amount + currency, travel category, Up category, payment method, city, kind, accommodation flag + stay nights, excluded, incoming, spread days, paid-in-cash, notes.
- **Light / dark / auto** theme via the gear menu.
- **No webhooks**, no third-party analytics, no telemetry. Your PAT is a Worker secret, your D1 lives on your Cloudflare account, your transaction descriptions never leave your worker.

## Local development

```bash
pnpm install
pnpm --filter @up-travel/worker db:migrate:local
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
# put your real UP_API_TOKEN in .dev.vars
pnpm dev
```

- Web on http://localhost:5173 (proxies /api/* to the worker)
- Worker on http://localhost:8787 (local D1 + KV via Miniflare; no Cloudflare account needed)
- Use `pnpm dev:host` if you want to test on your phone over LAN

Hourly cron doesn't fire locally - use the sync button.

## Manual deploy

If you'd rather not use the button:

```bash
./scripts/deploy-init.sh
# paste the printed database_id + namespace id into apps/worker/wrangler.jsonc
pnpm --filter @up-travel/worker exec wrangler secret put UP_API_TOKEN
pnpm --filter @up-travel/worker exec wrangler deploy
./scripts/post-deploy.sh
```

Then add Cloudflare Access to the Pages project and create your first trip in the UI.

## Privacy

- `UP_API_TOKEN` is a Cloudflare Worker secret. Never sent to the browser.
- No third-party analytics or trackers.
- Worker logs (Cloudflare Tail) include sync summaries and error codes; transaction descriptions, amounts, and secrets are never logged.
- Up Bank rate-limits and HMAC-signs everything its end; we just verify and store.
