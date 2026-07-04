# Ben's Investment Research

A personal investment research dashboard for tracking a stock watchlist, macro market data, curated financial news, and AI-powered analysis.

## Features

- **Market Banner** — sticky header showing live index prices and 1D % change (S&P 500, NASDAQ, DOW, Russell 2000, Gold, Oil, Copper), Treasury yields (2Y/10Y with daily bps change), ES futures under SPY, and a real-time market status indicator (Market Open / Pre-Market / After Hours / Market Closed)
- **Watchlist** — curated stock table with price, 1D % change, priority, and last-updated timestamp; organized by list with tab switching and preset filters
- **Research Feed** — aggregated articles from followed Substack publications and Finnhub market news, filtered for quality (removes paywalled domains and clickbait headlines)
- **Research Posts** — personal blog-style notes stored in Supabase, written directly via the Supabase dashboard
- **AI Summary** — latest market news article with a one-paragraph analysis powered by Google Gemini 3.5 Flash
- **TradingView Chart** — embedded interactive chart for any selected watchlist ticker

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
- AI Summary → Google Gemini 3.5 Flash (on AI Summary page only)

## Tech Stack

- **Frontend / Backend:** Next.js 15 (App Router, React Server Components)
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel
- **Background Jobs:** GitHub Actions (cron, effectively ~hourly due to scheduler variance)
- **Market Data:** Finnhub API (free tier, 60 req/min)
- **AI:** Google Gemini 3.5 Flash (free tier, 1,500 req/day)
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

## Background Job

`scripts/refresh-data.js` runs via GitHub Actions on a cron schedule. Reads all tickers from `stocks`, fetches a quote and recent news for each from Finnhub (1.1s delay between calls to respect rate limits), upserts results to Supabase.

At 24 tickers × 2 calls × 1.1s ≈ 53 seconds per run. Maximum capacity before hitting a 5-minute window: ~136 tickers.

Requires three GitHub Actions secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FINNHUB_API_KEY`.
