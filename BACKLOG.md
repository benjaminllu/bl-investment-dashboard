# Backlog

Ideas discussed and parked, with enough context to pick any one up without
re-deriving it. Constraint for everything here, set 2026-11-05: **free data
sources only**.

Ordered roughly by how ready each item is to build.

---

## 1. Alerts (push notifications) — explored furthest

**State of the plumbing.** Web push works end to end: `NotificationButton`,
the `push_subscriptions` table, `lib/webpush.ts`, `/api/subscribe`. The only
sender is `/api/notify`, which broadcasts a test message to every
subscription. The natural evaluator is the 30-minute `refresh-data.yml` job,
which already has fresh quotes.

**Latency limit.** GitHub cron fires late often enough that alerts are
30–60 minutes behind. Good for "something changed today", not for intraday
trading.

**Candidate triggers, all from data the app already has:**

| Group | Trigger |
|---|---|
| Watchlist price | Daily move beyond ±X%; crossing 50d / 200d average; new 52-week high or low |
| Earnings | Reports tomorrow (pre/post market); results out — beat or miss |
| Insiders | Cluster of insider buys in a watchlist name |
| Sector rotation | Sector moves 3+ ranks in a month; quadrant change; rotation score crosses 40 or 70 |
| Macro / risk | VIX past a level or term structure inverting; HY spreads into widest fifth; Fear & Greed extreme; large Polymarket swing; FOMC / CPI day |
| Positioning | Put/call extreme; gamma sign flip |
| Portfolio | Position down X% from its high; one holding above X% of the book; large daily P&L move |
| Housekeeping | Morning digest ready; a data job failed |

**Design problems to solve, not just choose:**
- **Recipients.** A send currently reaches every subscribed device. If family
  ever subscribe, portfolio alerts would reach them. Personal alerts need
  per-device or per-person targeting.
- **Noise.** A stock sitting on its 200-day line would alert every run. Needs
  a cooldown / dedupe per rule.

**Open questions for Ben (unanswered):**
1. Immediate per-alert pushes, or a morning / close digest with only a few
   urgent ones sent immediately?
2. Rules editable on the site, or a fixed set adjusted in code?
3. Which 3–5 triggers would actually make you open the site?
4. Only your devices, or might family/friends subscribe — and receive what?
5. Anything outside market hours or at weekends (e.g. night-before-earnings)?

## 2. Ticker popup, then a full ticker page

**Popup first.** The Desk format preview already has one
(`components/preview/TickerDrawer.tsx`, a native `<dialog>`). The work is
mostly wiring it in wherever a ticker is shown. Data already held per
watchlist ticker: quote and daily change, market cap, forward / TTM P/E,
beta, P/B, ROE, 3-month volatility, 52-week return (Finnhub), next earnings
with EPS / revenue estimates, insider transactions, news, TradingView chart.
It must not show positions or P&L unless gated like `/portfolio`.

**Full page later** needs history the app does not have: multi-year
financials, valuation over time, peers. Free route: SEC EDGAR company-facts
API. Finnhub's free metric endpoint may also carry historical ratio series
and `/stock/peers` — unverified.

## 3. Other ideas from the Koyfin / TIKR / Fiscal.ai comparison

The site is strong on the market (macro, positioning, risk, rotation) and
thin on individual companies, which is what those platforms centre on.

- **Fundamentals history** — 10+ years of revenue, margins, FCF, share count
  from SEC EDGAR. Prerequisite for the next two.
- **Valuation bands** — current P/E or EV/sales against the stock's own
  5–10 year range.
- **Peer comparison table** — a name beside 4–6 peers on growth, margins,
  valuation.
- **AI earnings brief** — summarise the 8-K earnings release and guidance
  when a watchlist name files, in the digest's style. (Transcripts are
  usually paid; the release is free.)
- **Investor holdings tracker** — chosen funds' quarterly 13F buys and sells,
  focused on watchlist overlap. Free from EDGAR, up to 45 days stale.
- **Thesis journal** — per ticker: why held, what would change your mind,
  levels, review date; flag reviews that are due. Stored in Supabase.
- **Analytics page** — currently a placeholder. Return attribution by
  position and sector, exposure vs SPY, drawdown.
- **Screener** — price-based filters (momentum, RS, quadrant) are cheap;
  fundamental filters depend on the EDGAR work.
- **Ratio / overlay chart builder** — any ticker over any other, or a price
  over a FRED series.
- **Market breadth** — % of S&P 500 above 50d / 200d, new highs vs lows, A/D
  line. Needs ~500 tickers of prices, the most expensive item here.

Unanswered: what you look up first when researching a stock; which investors
you follow; whether you keep theses anywhere now; what the Analytics page was
meant for; whether a screener is for discovery or re-ranking.

## 4. Sectors page — deferred audit findings (2026-11-04)

- **Cycle classifier calls recession too early.** `lib/cycle.ts`: any CFNAI
  reading below −0.20 that is not rising is labelled Recession, though the
  file cites the −0.70 threshold. The credit-stress rule just above it never
  changes the outcome. Product call: probably label the −0.70 to −0.20 band
  Late / slowing unless credit is stressed.
- **Cycle panel placement contradicts its own rationale.** `app/sectors/page.tsx`
  renders it beside the rotation graph, while comments in that file and in
  `CyclePanel.tsx` say it belongs after the price signals so it is not read as
  a forecast. Decide which is right and make the other match.
- **Unverified:** whether Yahoo's daily series includes the in-progress
  session, which would make the header's "close" a mid-session price during
  market hours.
