# Ben's Investment Research

A personal investment research dashboard for tracking a stock watchlist, macro market data, curated financial news, and AI-powered analysis.

## Features

- **Market Banner** — sticky header showing live index prices and 1D % change (S&P 500, NASDAQ, DOW, Russell 2000, Gold, Oil, Copper), Treasury yields (2Y/10Y with daily bps change), ES futures under SPY, and a real-time market status indicator (Market Open / Pre-Market / After Hours / Market Closed)
- **Watchlist** — curated stock table with price, 1D % change, priority, and last-updated timestamp; organized by list with tab switching and preset filters
- **Research Feed** — aggregated articles from followed Substack publications and Finnhub market news, filtered for quality (removes paywalled domains and clickbait headlines)
- **Research Posts** — personal blog-style notes stored in Supabase, written directly via the Supabase dashboard
- **AI Summary** — latest market news article with a one-paragraph analysis powered by Google Gemini, cached per-article so repeat views don't re-generate
- **TradingView Chart** — embedded interactive chart for any selected watchlist ticker
- **Portfolio** — up to five portfolios with live P&L, loaded from broker CSV exports by a local import script (see [Portfolio (CSV import)](#portfolio-csv-import) below and [`PORTFOLIO.md`](PORTFOLIO.md)). Above them, an **Exposure & Risk** panel aggregates the whole book: sector and size×style composition charts, plus concentration, beta, momentum and quality metrics — every formula and its limitations in [`METRICS.md`](METRICS.md). The IBKR gateway sync it previously used is [tabled but still documented](#portfolio--ibkr-integration-tabled).

## Architecture

Data flows through two separate paths:

**Background refresh (GitHub Actions, ~hourly):**
- Fetches quotes and news for all watchlist tickers from Finnhub
- Writes results to Supabase (`stock_quotes`, `stock_news` tables)
- Page reads pre-fetched data instantly with no API latency

**On page load (live):**
- Market banner index prices → Finnhub API (7 tickers + ES futures)
- Treasury yields → Treasury.gov CSV
- Substack feed → each publication's API (9 sources, 5 posts each)
- Market news → Finnhub general news endpoint
- AI Summary → Google Gemini (on AI Summary page only; response cached ~15 min per article, so a repeated top headline doesn't re-generate)

(The home page's **AI Market Summary** block is *not* on this live path — it is written once a day by a background job and read from Supabase like any other pre-fetched table.)

**On-demand (manual, whenever positions change):**
- Portfolio positions → broker CSV export, parsed and written into `portfolio_positions` by `scripts/import-portfolio-csv.js` (the IBKR gateway sync that previously filled this is tabled — see below)
- Portfolio P&L is computed by joining those imported positions against the already-live `stock_quotes` table, so prices stay current even though positions only refresh when you import

## Tech Stack

- **Frontend / Backend:** Next.js 16 (App Router, React Server Components)
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel
- **Background Jobs:** GitHub Actions (cron, effectively ~hourly due to scheduler variance)
- **Market Data:** Finnhub API (free tier, 60 req/min), FRED API (free)
- **AI:** Google Gemini (free tier)
- **Brokerage Data:** Interactive Brokers Client Portal Web API (local gateway, on-demand sync — see below)
- **Charts:** TradingView Lightweight Charts widget
- **Styling:** Tailwind CSS

## Local Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Create `.env.local` with the following variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   FINNHUB_API_KEY=
   FRED_API_KEY=
   GEMINI_API_KEY=
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=
   VAPID_PRIVATE_KEY=
   VAPID_EMAIL=mailto:your@email.com
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

## Supabase Tables

| Table | Purpose |
|---|---|
| `stocks` | Watchlist tickers, company names, priority, list |
| `stock_quotes` | Latest price and % change per ticker (written by background job) |
| `stock_news` | Filtered news articles per ticker (written by background job) |
| `stock_fundamentals` | Market cap and insider sentiment per ticker (written by the daily fundamentals job) — one row per ticker, overwritten, no history |
| `stock_earnings` | Upcoming earnings dates per ticker (written by the daily fundamentals job) — many rows per ticker, whole set replaced each run |
| `market_digest` | The ten ranked stories behind the home page's AI Market Summary (written by the daily 9am ET digest job) — ten rows per day, 90 days retained |
| `posts` | Personal research notes |
| `push_subscriptions` | Browser push notification subscriptions (in progress) |
| `portfolios` | The five Portfolio slots and their labels — `slot`, `label`, `broker` |
| `portfolio_positions` | Positions per slot, keyed on `(slot, ticker)`, loaded by `scripts/import-portfolio-csv.js` |
| `ibkr_positions` | Snapshot of IBKR positions as of the last manual sync — **no longer read by the app**, kept alongside the tabled IBKR integration |

## Background Jobs

Three GitHub Actions cron jobs, split by how fast the underlying data actually moves. All three write to Supabase and share `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `FINNHUB_API_KEY`; the digest job additionally needs `GEMINI_API_KEY`. The two ticker jobs read all symbols from `stocks` and sleep 1.1s between Finnhub calls to respect the 60 req/min limit.

**`scripts/refresh-data.js` — every 30 min.** Quote + recent news per ticker. At 126 tickers × 2 calls × 1.1s ≈ 4.6 minutes per run.

**`scripts/refresh-fundamentals.js` — daily.** Market cap (`/stock/profile2`), insider sentiment (`/stock/insider-sentiment`), and upcoming earnings (`/calendar/earnings`) per ticker, written to `stock_fundamentals` and `stock_earnings`. At 126 tickers × 3 calls × 1.1s ≈ 6.9 minutes per run. This is deliberately *not* folded into the 30-minute job: insider sentiment is monthly data lagging 1-2 months and earnings dates move rarely, so re-fetching either every 30 minutes would triple that job's runtime for data that cannot have changed. Requires `scripts/stock-fundamentals-table.sql` and `scripts/stock-earnings-table.sql` to have been run once first.

**`scripts/generate-market-digest.js` — daily, ~9am ET.** Ranks the ten most important stories of the last 24 hours into `market_digest`, which the **AI Market Summary** block on the home page reads. One Finnhub call for the general wire, the watchlist's own `stock_news` rows as extra candidates, then one Gemini call to rank them. Requires `scripts/market-digest-table.sql` to have been run once first.

Two things about it are worth knowing:

* **The model cannot invent a story.** It is handed a numbered candidate list and returns *indices* into it, so headline, URL and source always come from the wire. What it contributes is the ordering, a category, and one sentence on why the story matters. Ticker suggestions are intersected with the `stocks` watchlist before being stored.
* **"9am" is a target, not a guarantee.** GitHub cron is UTC-only while ET is not, and GitHub throttles scheduled runs (see [`DEPENDENCIES.md`](DEPENDENCIES.md)). The workflow fires four times across 13:00–14:30 UTC; the script skips any run before 9am Eastern and skips a day already done, so exactly one writes. The panel shows the timestamp it actually ran at, and badges the digest "not today's" if the job never succeeded that day rather than showing yesterday's as if it were fresh.

Coverage for both fundamentals metrics is partial by nature — ETFs have no Finnhub profile, and insider sentiment comes from SEC Form 4 filings so foreign listings and some micro-caps return nothing. Missing values render as an em-dash rather than being hidden.

## Portfolio (CSV import)

The Portfolio tab holds **up to five portfolios** in fixed slots, loaded from
broker CSV exports. Full instructions, per-broker column mappings, and the
caveats that affect the numbers are in **[`PORTFOLIO.md`](PORTFOLIO.md)**. The
formulas behind the Exposure & Risk panel above them — and what each metric
deliberately does *not* claim — are in **[`METRICS.md`](METRICS.md)**.

```
# one-time: run scripts/portfolio-positions-table.sql in the Supabase SQL editor
node scripts/import-portfolio-csv.js "Roth Contributory IRA-Positions.csv" --slot=1 --dry-run
node scripts/import-portfolio-csv.js "Roth Contributory IRA-Positions.csv" --slot=1
```

The import runs locally with the service role key, so the deployed app keeps
its read-only posture: it uses only the public anon key, and RLS is not enabled
on this project's tables (see `SECURITY.md`), so an in-app upload form would
have been a public write endpoint without its own auth gate.

Schwab is supported and verified against a real export; Vanguard is not yet, and
the script rejects formats it does not recognise rather than guessing. P&L is
computed live against `stock_quotes` by joining on `ticker`, so prices stay
current between imports.

## Portfolio / IBKR Integration (tabled)

**Not currently wired to the Portfolio tab** — the tab reads
`portfolio_positions` (above) instead. This section and its scripts
(`scripts/sync-ibkr-positions.js`, `scripts/ibkr-positions-table.sql`) are kept
intact and still accurate, so the integration can be picked back up without
rediscovering any of it. The `ibkr_positions` table, if created, is simply no
longer read.

The Portfolio tab read a snapshot of IBKR positions from Supabase rather than
calling IBKR live on every page load — see `SECURITY.md` for the full
reasoning and the security review behind this design. One-time and per-sync
setup:

1. **Create the table once:** run `scripts/ibkr-positions-table.sql` in the
   Supabase SQL editor.
2. **Install and run the IBKR Client Portal Gateway locally** (requires Java
   8u192+ / a modern JRE):
   ```
   # download from IBKR directly:
   # https://download2.interactivebrokers.com/portal/clientportal.gw.zip
   bin\run.bat root\conf.yaml
   ```
   Then open `https://localhost:5000` in a browser and log in (2FA required).
   The gateway's `conf.yaml` restricts inbound connections to `127.0.0.1`
   only — don't widen `ips.allow` without re-reading `SECURITY.md` first.
3. **Sync whenever you've traded:**
   ```
   node scripts/sync-ibkr-positions.js
   ```
   This fully replaces `ibkr_positions` (delete + insert) so closed positions
   disappear rather than lingering. Do this soon after logging in — the
   gateway session times out after ~6 minutes of inactivity.
4. Reload `/portfolio` — positions came from the last sync, P&L computed live
   against `stock_quotes`. (Step 4 no longer applies while this is tabled; the
   page reads `portfolio_positions`.)

No credentials are stored anywhere in this repo for this integration — login
is manual, every time, by design (see `SECURITY.md`).

## Security

See [`SECURITY.md`](./SECURITY.md) for secrets handling, the IBKR gateway
hardening that was done, and known/accepted risks (e.g. no Row Level Security
on Supabase tables yet).
