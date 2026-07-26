# Ben's Investment Research

A personal investment research dashboard for tracking a stock watchlist, macro market data, curated financial news, and AI-powered analysis.

## Features

- **Market Banner** — sticky header showing live index prices and 1D % change (S&P 500, NASDAQ, DOW, Russell 2000, Gold, Oil, Copper), Treasury yields (2Y/10Y with daily bps change), ES futures under SPY, and a real-time market status indicator (Market Open / Pre-Market / After Hours / Market Closed)
- **Watchlist** — curated stock table with price, 1D % change, priority, and last-updated timestamp; organized by list with tab switching and preset filters
- **Research Feed** — aggregated articles from followed Substack publications and Finnhub market news, filtered for quality (removes paywalled domains and clickbait headlines)
- **Research Posts** — personal blog-style notes stored in Supabase, written directly via the Supabase dashboard
- **AI Summary** — latest market news article with a one-paragraph analysis powered by Google Gemini, cached per-article so repeat views don't re-generate
- **TradingView Chart** — embedded interactive chart for any selected watchlist ticker
- **Portfolio** — live IBKR positions and P&L, synced on-demand from a locally-run IBKR Client Portal Gateway (see [Portfolio / IBKR Integration](#portfolio--ibkr-integration) below)

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

**On-demand sync (manual, a few times a day):**
- Portfolio positions → IBKR Client Portal Web API, via a gateway run locally on demand (not always-on, not scheduled)
- Portfolio P&L is computed by joining those synced positions against the already-live `stock_quotes` table, so prices stay current even though positions only refresh when you trigger a sync

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
| `posts` | Personal research notes |
| `push_subscriptions` | Browser push notification subscriptions (in progress) |
| `ibkr_positions` | Snapshot of IBKR positions as of the last manual sync (ticker, quantity, cost basis) — fully replaced on each sync, not appended |

## Background Job

`scripts/refresh-data.js` runs via GitHub Actions on a cron schedule. Reads all tickers from `stocks`, fetches a quote and recent news for each from Finnhub (1.1s delay between calls to respect rate limits), upserts results to Supabase.

At 24 tickers × 2 calls × 1.1s ≈ 53 seconds per run. Maximum capacity before hitting a 5-minute window: ~136 tickers.

Requires three GitHub Actions secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FINNHUB_API_KEY`.

## Portfolio / IBKR Integration

The Portfolio tab reads a snapshot of IBKR positions from Supabase rather than
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
4. Reload `/portfolio` — positions come from the last sync, P&L is computed
   live against `stock_quotes`.

No credentials are stored anywhere in this repo for this integration — login
is manual, every time, by design (see `SECURITY.md`).

## Security

See [`SECURITY.md`](./SECURITY.md) for secrets handling, the IBKR gateway
hardening that was done, and known/accepted risks (e.g. no Row Level Security
on Supabase tables yet).
