# External Dependencies

A working reference for every external service, API, and hosted tool this project talks to: what it's for, how it's wired in, what it costs, and what its limits are. Compiled by reading each integration's actual code (not just README's summary of it) and, where noted, by calling the live endpoint directly to confirm current behavior. Last reviewed: 2026-07-18.

This is a personal project — no SLA is expected from any of the unauthenticated/unofficial sources below, and several are explicitly best-effort.

## Quick reference

| Service | Role | Auth | Key env var(s) | Rate limit | Cache/revalidate |
|---|---|---|---|---|---|
| [Vercel](#vercel) | App hosting | N/A (deploy-time) | — | Plan-dependent | — |
| [GitHub Actions](#github-actions) | Background cron | N/A (repo secrets) | — | N/A | Cron requests 5 min; actual cadence ~hourly (GitHub throttling — see below) |
| [Supabase](#supabase) | Database | Anon key (client), service role (scripts) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Plan-dependent | Live queries, no app-level cache |
| [Finnhub](#finnhub) | Quotes, news | API key (query param) | `FINNHUB_API_KEY` | 60 req/min (free tier) | 300s (index quotes), 900s (market news) |
| [FRED](#fred-federal-reserve-economic-data) | Macro series | API key (query param) | `FRED_API_KEY` | ~120 req/min (commonly cited; not confirmed against FRED's own docs — see note) | 3600s |
| [Treasury.gov](#treasurygov) | 2Y/10Y yields | None | — | Unpublished | 3600s |
| [Yahoo Finance](#yahoo-finance-unofficial) | S&P 500 futures (ES), daily price history | None (requires User-Agent) | — | Unofficial, unpublished | 300s (banner); batch script for history |
| [CNN Fear & Greed](#cnn-fear--greed-index-unofficial) | Sentiment index | None (requires User-Agent) | — | Unofficial, unpublished | 1800s |
| [Cboe](#cboe-vix--vixeq) | VIX / VIXEQ | None (requires User-Agent) | — | Unpublished | 3600s |
| [Google Gemini](#google-gemini) | AI summary, daily market digest | API key (query param) | `GEMINI_API_KEY` | Free-tier quota (model/tier-dependent) | 900s (`/ai-summary`); digest is written once a day to Supabase, not cached in-app |
| [Substack](#substack) | Research feed | None | — | Unpublished, per-publication | No cache (`no-store`) |
| [TradingView](#tradingview) | Chart widget | None | — | N/A (client embed) | N/A |
| [Twitter/X](#twitterx) | Timeline embed | None | — | N/A (client embed) | N/A |
| [Web Push](#web-push--vapid) | Browser notifications | VAPID keypair | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` | Per-browser-vendor push service | N/A |
| [IBKR Client Portal Gateway](#interactive-brokers-ibkr-client-portal-gateway) | Portfolio sync | Manual browser login + 2FA, local session | — | N/A (local, manual) | On-demand only |
| [Google Fonts](#google-fonts) | IBM Plex Sans | None | — | N/A (build-time) | Self-hosted after build |

---

## Hosting & Infrastructure

### Vercel
The app deploys to Vercel (per `README.md`); there's no `vercel.json` in the repo, so it runs on Next.js zero-config defaults. Server Components, the FRED/notification API routes, and Next's `fetch`-level caching (the `revalidate` windows throughout this doc) all run inside Vercel's serverless/edge runtime. No project-specific config was found beyond that default.

### GitHub Actions
`.github/workflows/refresh-data.yml` runs `scripts/refresh-data.js` on a schedule and via manual `workflow_dispatch`. The committed cron is `*/5 * * * *` (every 5 minutes) — but **`README.md`'s "~hourly due to scheduler variance" description is the accurate one**, confirmed by pulling this workflow's actual run history from the GitHub API rather than trusting the YAML at face value: the 30 most recent runs landed 50–195 minutes apart, averaging roughly 80–90 minutes, never anywhere close to 5.

This is a known, documented GitHub Actions limitation, not a bug in this project: scheduled workflows requesting a cadence tighter than about an hour get silently throttled by GitHub's own scheduler, especially on public repos and during high-load periods (the top of every hour is a documented hotspot). The practical takeaway is that `*/5 * * * *` in the YAML functions as "as often as GitHub will allow, capped around hourly" rather than a literal 5-minute guarantee — worth keeping the cron expression as-is (tightening it further won't help) and treating "~hourly, sometimes up to ~3 hours" as the real freshness bound on `stock_quotes`/`stock_news`.

Secrets (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FINNHUB_API_KEY`) are injected from the repo's Actions secrets, not committed anywhere.

GitHub automatically disables scheduled workflows in **public** repositories after 60 days with no new commits (private repos aren't affected). Worth checking this repo's visibility setting if the background refresh ever silently stops.

### Supabase
Hosted Postgres + client library (`@supabase/supabase-js`). Two clients exist, matching different trust levels:
- `lib/supabase.ts` — anon key, used by the deployed app for all reads. Ships to the browser; treat it as public, same as any anon-key setup.
- `lib/supabase-server.ts` and `scripts/*.js` — service role key (full read/write, bypasses Row Level Security), used only server-side/in scripts, never in client code.

Tables: `stocks`, `stock_quotes`, `stock_news`, `stock_fundamentals`, `stock_earnings`, `posts`, `push_subscriptions`, `portfolios`, `portfolio_positions`, `ibkr_positions` (see `README.md` for the per-table purpose; `ibkr_positions` is retained but no longer read). **RLS is not enabled on any table** — a known, tracked gap per `SECURITY.md`, reasonable for a single-user dashboard but worth revisiting if scope ever changes.

---

## Market & Macro Data

### Finnhub
Free-tier market data API, 60 requests/minute (per `README.md`; not independently re-verified here, carried forward from the existing doc). Five endpoints in use, all authenticated via a `token=` query param (`FINNHUB_API_KEY`):
- `GET /api/v1/quote?symbol=X` — index prices in `MarketBanner.tsx` (7 index ETFs, revalidate 300s) and per-ticker quotes in the background job.
- `GET /api/v1/news?category=general` — general market news (`lib/finnhubNews.ts`, revalidate 900s).
- `GET /api/v1/company-news?symbol=X&from&to` — per-ticker news, background job only (`scripts/refresh-data.js`).
- `GET /api/v1/stock/profile2?symbol=X` — market cap, listing currency and `finnhubIndustry` (stored as `sector`), daily fundamentals job only (`scripts/refresh-fundamentals.js`).
- `GET /api/v1/stock/metric?symbol=X&metric=all` — 132 fields, of which seven are stored: `forwardPE`, `peTTM`, `beta`, `pbAnnual`, `3MonthADReturnStd`, `52WeekPriceReturnDaily`, `roeTTM`. Same job.
- `GET /api/v1/calendar/earnings?symbol=X&from&to` — upcoming earnings dates, same job.

*(This list previously named `/stock/insider-sentiment`, which `refresh-fundamentals.js` stopped calling when the watchlist's insider column was replaced by P/E, and omitted `/stock/metric`, which had replaced it.)*

**The exposure characteristics cost no extra requests.** Everything the Portfolio tab's exposure panel aggregates already arrived in the `profile2` and `metric` responses the daily job was making and discarding, so `stock-fundamentals-add-exposure.sql` widened the table without widening the request budget. Coverage measured against the real 34-holding book, weighted by market value: sector and beta 99.1%, volatility 95.9%, ROE 89.6%, 52-week return 88.7%, price-to-book 69.7%. Price-to-book is the weak one and it is the sole input to the value/growth axis, which is why that chart carries an explicit `Unclassified` slice — roughly 30% of the book — instead of defaulting those names into "Blend".

**The earnings calendar must be queried per symbol, never whole-market.** Omitting `symbol` returns every company at once, which is tempting as a one-call replacement for 126 calls, but the response is hard-capped at exactly 1500 rows and truncates from the *near* end with no error or truncation flag. Verified: a 12-day window (2026-07-28 → 08-09) still hit the cap and returned only 08-03 onward, and `AAPL` — reporting 2026-07-30 — was absent from both that call and the 1-month version. The most imminent earnings are precisely the ones it drops.

**The response `symbol` is frequently not the symbol queried:** `BRK.B` → `BRK.A`, `SKM` → `017670.KS`, `AIXXF` → `AIXA.DE`, `TORXF` → `TXG.TO`, `STM` → `STMPA.PA`. `stock_earnings.ticker` therefore stores the *queried* watchlist symbol so rows join back to `stocks`, with `source_symbol` recording what Finnhub returned. Keying on the response symbol would file BRK.B's rows under `BRK.A`, where nothing would ever find them.

Consequently `EarningsPanel.tsx` shows per-share estimates only when `source_symbol === ticker` **and** the ticker's `market_cap_currency` is USD. Both gates are needed and neither is sufficient alone — `TORXF` and `STM` report `market_cap_currency = "USD"` but resolve to foreign listings, while `BABA` matches on symbol but is CNY. Without this, BRK.B would display a $7,594 EPS estimate (the Class A figure, ~1500× the B share). Dates are shown regardless, since share classes and ADRs report alongside their home listing.

**No earnings history on the free tier.** `epsActual`/`revenueActual` are null on every row and a purely historical query returns nothing (`AAPL`, full-year 2025: 0 rows), so there is no beat/miss record — only ~4 forward quarters per ticker. Note also that `revenueEstimate` is in absolute units (`110813711563`), unlike `profile2`'s market cap which is in millions.

**`profile2` returns market cap in millions of the *listing* currency, not USD.** Verified live: `SKM` returns `21002317` with `currency: "KRW"` (≈$15B, not $21T). `StockTable.tsx` therefore renders market cap only when `currency === "USD"` and em-dashes everything else, rather than prefixing a `$` onto a foreign-currency figure. The currency is stored alongside the value in `stock_fundamentals` so this can be revisited with an FX source without a backfill.

Also verified: do **not** derive market cap from `price × shareOutstanding` — `BRK.B` reports `shareOutstanding: 1.4`, which would produce nonsense. Use the `marketCapitalization` field directly.

**Coverage is partial for both fundamentals endpoints.** ETFs (`SPY`, `QQQ`, `EWY`) return `{}` from `profile2`. Insider sentiment derives from SEC Form 4 filings, so ETFs, foreign OTC listings (`AIXXF`, `TORXF`, `KRKNF`), and some micro-caps return an empty array — a sample of 18 tickers gave ~56% coverage. This is a property of the data, not a bug; missing values render as em-dashes.

**Futures are not available at all** — not on the free tier, and not as an asset class. The banner's S&P futures line is sourced from [Yahoo Finance](#yahoo-finance-unofficial) instead; see that section for the evidence and for why the `/ES` symbol in particular is a trap.

**Operational note:** within a single run each job makes a Finnhub call per ticker per endpoint with a 1.1s sleep after each — roughly **54 calls/minute during that run**, close to the 60/min ceiling regardless of how often the job fires. Both jobs cover the watchlist *plus* any ticker held in `portfolio_positions` but not watchlisted, skipping the `$CASH` sentinel and option symbols, which Finnhub cannot price. Held-only names are cheaper than watchlist ones: the quote job skips their news and the fundamentals job skips their earnings calendar, since neither feeds the Portfolio tab. At 126 watchlist + 2 held-only tickers that's ~4.6 minutes for the quote/news job and ~7.0 minutes for the daily fundamentals job. The two are scheduled far enough apart (every 30 min vs. daily at 06:00) that overlap is not a practical concern, but adding a further per-ticker call to either loop, or growing the watchlist substantially, is worth re-checking against the 60/min ceiling.

**Historical candles are not on the free tier.** `GET /api/v1/stock/candle` returns `403 "You don't have access to this resource"`, which is why daily price history for the Sharpe/drawdown/beta metrics comes from Yahoo instead — see below. Nothing else in the project depends on it.

**The earnings endpoint reliably fails for the first ~3 tickers of a run.** `/calendar/earnings` answers with an HTML page rather than JSON, surfacing as `Unexpected token '<'` from `res.json()`, then works normally for the remaining ~125.

Observed on two separate runs, failing on the same three tickers both times (`MSFT`, `ATXRF`, `SPY` — the first three in watchlist order). **The cause is not established.** A first guess of rate-limit spillover from a preceding job does not hold: the second occurrence was preceded only by Yahoo and Supabase calls, with no Finnhub traffic at all. Whatever it is, it is positional rather than load-dependent.

Impact is small and self-limiting — those tickers keep their existing `stock_earnings` rows, because the delete only runs after a successful fetch. Worth recognising that it is **not** the endpoint going premium: queried directly it returns HTTP 200 and valid JSON. If it ever matters, retrying a failed earnings fetch once would likely mask it entirely.

### Yahoo Finance (unofficial)
`GET query1.finance.yahoo.com/v8/finance/chart/ES=F?range=1d&interval=1d` in `MarketBanner.tsx`, for the front-month E-mini S&P 500 futures line under the SPY tile. No key; requires a browser-like `User-Agent` or the request is rejected. Price and previous close come from `chart.result[0].meta` (`regularMarketPrice`, `chartPreviousClose`); the percentage is computed locally since the endpoint does not return one.

**Why not Finnhub:** Finnhub has no futures asset class whatsoever. Verified across three independent checks — `/quote` returns `c: 0` for `ES1!`, `ES=F`, `ESU2026`, `CME:ES`, and `SPX` (and `/ES` resolves to **Eversource Energy**, the equity `ES`, at ~$75 rather than the index at ~7,400); symbol search returns zero results for "E-mini" or "S&P 500 futures" and only ever returns `Common Stock`; and `/futures/exchange` and `/futures/symbol` return the marketing HTML page while `/forex/exchange` and `/crypto/exchange` return real JSON. Finnhub's freely published [S&P 500 futures tick dataset](https://www.kaggle.com/datasets/finnhub/sp-500-futures-tick-data-sp) is a static 2000–2019 Kaggle dump, not an API — easy to mistake for live coverage.

**Second use — daily price history.** `scripts/backfill-price-history.js` calls the same chart endpoint with `?range=5y&interval=1d` for every held ticker plus `SPY`, writing closes and volume into `price_history`. This feeds the Sharpe/drawdown/beta metrics on the Portfolio tab, which cannot be computed from point-in-time data at all. Finnhub was the obvious source and is not available: `/stock/candle` is 403 on the free tier.

Coverage checked against the real book before building on it: **34/34 symbols returned data**, including the OTC foreign listings Finnhub has no profile for (`ATXRF`, `TORXF`, `CPPKF`, `MTLMY`). Depth varies — most have the full ~1250 bars, but six are recent listings, the shortest being `SIVEF` at 90. That is what limits the longest window covering every holding to ~90 trading days, and why 1Y is labelled as 86.5% coverage rather than presented as whole-book.

This is a batch script, not a page render: ~35 requests at 300ms spacing, run by hand. It is not on the 60/min Finnhub budget and does not touch it.

**Stability caveat:** this is an undocumented endpoint with no terms guaranteeing availability; it can change shape or start rate-limiting by IP without notice. Every failure path (`!res.ok`, malformed JSON, missing fields, thrown error) returns `{ price: null, changePct: null }`, and the banner only renders the futures line when `price !== null` — so a breakage silently drops the line rather than erroring the page. Load is one request per page render behind `revalidate: 300`, not a per-ticker loop.

### FRED (Federal Reserve Economic Data)
St. Louis Fed's API, `lib/fred.ts`, 20 macro series (`FRED_SERIES`) covering rates, inflation, credit spreads, Fed balance sheet, and similar, plus `lib/fedDotPlot.ts` for the FOMC's dot-plot series and `lib/keyDates.ts` for upcoming release dates. Key via `api_key=` query param (`FRED_API_KEY`) — **this env var is used in code but missing from `README.md`'s documented `.env.local` list** (see [Known documentation gaps](#known-documentation-gaps-found-while-writing-this)). Four entry points across two different FRED endpoints: `fetchFredMetrics()` and `fetchFredHistory()` hit `/fred/series/observations` (actual data values; the latter proxied through `app/api/fred/observations/route.ts` so the client-side chart never sees the API key); `fetchFedDotPlot()` also hits `/fred/series/observations` but for the dot-plot series specifically (see below); `fetchMacroKeyDates()` hits the separate `/fred/release/dates` endpoint, which returns *scheduled release dates* for a given release (CPI = release 10, Employment Situation = release 50, SEP = release 326) rather than data values — confirmed live to return real future dates, not just historical ones.

**On "Next FOMC" specifically:** release 326 (SEP) only covers the 4 SEP-associated meetings per year, not all 8 — there's no free source (checked both FRED's own releases and Finnhub's economic calendar, which is `403 PremiumRequired` on this project's free-tier key) covering every meeting. `fetchMacroKeyDates()` deliberately surfaces only the SEP-tied next date, labeled as such in `MacroKeyBand.tsx` ("Next FOMC (SEP)"), rather than silently presenting partial coverage as complete.

The dot-plot fetch is a genuinely different shape from the other two, worth understanding before touching it: `FEDTARMD`/`FEDTARRH`/`FEDTARRL` (median/range) are keyed by **target calendar year**, not release date — only the Fed's live projection window (current year + ~2 more) has real values, and years that roll out of that window come back as FRED's `.` null sentinel rather than disappearing. `fetchFedDotPlot()` derives which years are live by filtering to non-null values and taking the most recent few, rather than hardcoding year strings — so it shifts forward automatically whenever the Fed's window moves (e.g. 2026/2027/2028 → 2027/2028/2029), no code change needed. The `LR` (longer-run) variants — `FEDTARMDLR`/`FEDTARRHLR`/`FEDTARRLLR` — are keyed by actual SEP release date instead, behaving like a normal time series. Revalidate 3600s throughout.

Rate limit: commonly cited as ~120 requests/minute per key across community sources and third-party wrapper docs, but FRED's own API-errors documentation page returned an HTTP 403 when fetched directly for this review — **not independently confirmed against the authoritative source**. Given 20 series fetched at most once per hour (via the revalidate window), actual usage is far below any plausible ceiling.

### Treasury.gov
Unauthenticated CSV feed (`home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/...`), parsed directly in `MarketBanner.tsx` for the 2Y/10Y yield + daily bps change shown in the sticky header. No key, no published rate limit. Revalidate 3600s. Same "public CSV, parse it yourself" shape as the two entries below.

### CNN Fear & Greed Index (unofficial)
`lib/fearGreed.ts` calls `production.dataviz.cnn.io/index/fearandgreed/graphdata` — CNN's own backend for their public [Fear & Greed page](https://www.cnn.com/markets/fear-and-greed), not a documented or contracted API. Confirmed directly (not from secondhand docs) by calling the endpoint and inspecting the live response: it returns a `fear_and_greed` current-value object plus 9 historical series (the 7 published components + 2 supplementary ones this app doesn't surface). Requires a browser-like `User-Agent` header and a `Referer` header or requests are rejected; no API key. Revalidate 1800s.

**This is the least stable dependency in the project.** CNN can change the response shape or start blocking automated requests with no notice, since there's no contract. On failure the app degrades to `—` placeholders rather than crashing (see the empty-fallback pattern in `lib/fearGreed.ts`), but a silent schema change (rather than an outright failure) could produce wrong-looking numbers without an obvious error — worth a periodic manual spot-check against CNN's own page.

`fear_and_greed_historical.data` (`[{ x: epoch ms, y: score, rating }, …]`) is also parsed into `FearGreedIndex.history` and feeds the Risk page's interpretation paragraph. **It carries only ~251 points — roughly one trailing year — so no all-time statistic for this index is available from this source**, and the interpretation copy in `lib/riskNarrative/fearGreed.ts` deliberately never claims one. Sentiment level bands come from CNN's own `rating` strings rather than locally invented cutoffs.

### Cboe (VIX / VIXEQ)
`lib/cboeVix.ts` pulls two plain CSVs from Cboe's CDN — `VIX_History.csv` (OHLC) and `VIXEQ_History.csv` (single close value) — confirmed live by fetching both directly. No key; requires a browser-like `User-Agent`. The Risk page's "VIXEQ − VIX" spread is computed server-side from same-day closes on both series, deliberately sourced from the same host to avoid a one-day mismatch that mixing in FRED's `VIXCLS` series could introduce. Revalidate 3600s.

Both files are parsed in full, not just their last rows, and exposed as `vixHistory` / `spreadHistory`: they are the source of the all-time distributions behind the Risk page's interpretation paragraphs, and the whole file arrives in the same request either way. As of 2026-07-30 that is 9,239 VIX closes back to 1990-01-02 and 3,045 same-day spread observations back to 2014-06-19 (VIXEQ is the shorter series and bounds the join; its pre-launch values are backfilled by Cboe). Measured on that data, the spread's all-time mean is 13.34 against a 34.14 maximum — which is why `lib/riskNarrative/spread.ts` classifies by percentile rank rather than absolute thresholds.

VIXEQ (Cboe S&P 500 Constituent Volatility Index) is a newer index (2024/2025 launch per Cboe's own announcement) measuring single-stock implied volatility across S&P 500 constituents, versus VIX's index-level measure — the spread is a dispersion/correlation signal. Same unofficial-endpoint caveat as CNN above: no contract, could change without notice.

---

## AI

### Google Gemini
`app/ai-summary/page.tsx` calls `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` to write a one-paragraph analysis of the latest market headline. Key via `key=` query param (`GEMINI_API_KEY`). Free tier (per `README.md`); exact current quota not independently re-verified here since Gemini's free-tier limits are model- and account-tier-specific and change periodically — check Google AI Studio's own quota page if this starts failing. Cached via `unstable_cache` with a 900s revalidate, and **only successful generations are cached** — a failed request retries fresh on the next load rather than being stuck behind the cache window until it expires.

**Second caller — the daily market digest.** `scripts/generate-market-digest.js` calls the same model to rank the ten most important stories of the last 24 hours for the AI Market Summary block on the home page, once a day at 9am ET via `.github/workflows/market-digest.yml`. This is the only integration that needs `GEMINI_API_KEY` set as a **GitHub Actions secret** as well as in Vercel.

Notes specific to that call, measured rather than assumed:

* It uses **structured output** — `generationConfig.responseMimeType: "application/json"` plus a `responseSchema` — which the `v1beta` endpoint honours for `gemini-2.5-flash`.
* 2.5-flash bills its reasoning tokens against `maxOutputTokens`. A run over ~60 headlines was measured at **~6.1k thinking tokens against ~400 of answer**, so the budget is set to 16000. A budget sized to the answer alone returns `finishReason: MAX_TOKENS` with truncated, unparseable JSON.
* Newer models on this account (`gemini-3.x-flash`) were returning **503 UNAVAILABLE** when this was written, which is why the digest deliberately stays on 2.5-flash rather than following the newest release.
* 503s on this endpoint are transient and common; the script retries three times with backoff before giving up for the day.
* The model never supplies a headline, URL, or source — it returns an **index into the candidate list** it was given, so it can misrank a real story but cannot invent one. Ticker suggestions are intersected with the `stocks` watchlist before they are stored.

---

## Content

### Substack
`data/substacks.ts` lists 10 publications (mix of default `*.substack.com` subdomains and custom domains). `lib/substack.ts` hits each publication's own `/api/v1/posts?limit=5&sort=new` endpoint in parallel — this is Substack's standard per-publication JSON endpoint, not a shared platform API, so there's no single rate limit or key; each publication is its own host. Explicitly **not cached** (`cache: "no-store"`), unlike every other integration in this project — every page load re-fetches all 10 feeds live. Paid/subscriber-only posts are included only for publications marked `subscribed: true` in the config (currently one).

---

## Embedded Widgets

These render entirely client-side via third-party script tags; the app never calls their backends directly.

### TradingView
`components/TickerChart.tsx` injects `s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js`, TradingView's free public embed widget, to render the interactive chart for whichever watchlist ticker is selected. No API key, no server-side involvement — purely a client-injected script + config object.

### Twitter/X
`components/ResearchFeed.tsx`'s "X / Twitter" tab loads `platform.twitter.com/widgets.js` and embeds a public timeline (`twitter-timeline`) for one hardcoded handle (`aleabitoreddit`). This is Twitter's public embed widget, not the Twitter API — no key, no rate limit exposed to this app, but also no server-side control over what renders (subject to whatever X's embed service decides to show or if they change/retire the widget).

---

## Notifications

### Web Push / VAPID
Browser-native Push API, server side via the `web-push` npm package (`lib/webpush.ts`), configured with a VAPID keypair (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`). Subscriptions are stored in Supabase (`push_subscriptions` table) via `app/api/subscribe/route.ts`; `app/api/notify/route.ts` sends to all stored subscriptions. This isn't a single external service — `web-push` posts directly to whatever push endpoint each browser vendor's subscription object points at (e.g., Google's FCM for Chrome, Mozilla's push service for Firefox), transparently per-subscription. No app-level rate limit; whatever limits exist are on the vendor push-service side and aren't surfaced to this app.

---

## Brokerage

### Interactive Brokers (IBKR) Client Portal Gateway — tabled
**Currently unused.** The Portfolio tab now reads `portfolio_positions`, loaded by CSV import through the Supabase dashboard, so nothing in the app depends on this gateway. The entry below is kept because the integration and its security review are still accurate and worth not having to rediscover; treat it as documentation of a shelved path rather than a live dependency.

Not an always-on hosted dependency — a gateway process downloaded directly from IBKR and run locally on demand (`https://localhost:5000`), per `README.md` and `SECURITY.md`. `scripts/sync-ibkr-positions.js` talks to it via the official Client Portal Web API (`/iserver/accounts`, `/portfolio/{accountId}/positions/0`). Requires manual browser login + 2FA each session (no automated login, by design — see `SECURITY.md`), and the gateway session times out after ~6 minutes of inactivity. TLS verification is bypassed only for this specific local, self-signed-cert connection, via a dedicated `https.Agent` — not a process-wide setting. No ongoing rate limit beyond "sync when you've traded."

---

## Fonts

### Google Fonts
IBM Plex Sans is loaded via `next/font/google` in `app/layout.tsx`. This is a build-time fetch — Next.js downloads and self-hosts the font files at build, so there's no runtime dependency on Google's font CDN in production; the only network dependency is at build/deploy time.

---

## Known documentation gaps found while writing this

- ~~`FRED_API_KEY` missing from `README.md`'s `.env.local` variable list~~ — **fixed**: added to the setup snippet and the Tech Stack line in `README.md`.
- ~~Cron schedule discrepancy between the YAML (`*/5 * * * *`) and README's "~hourly" description~~ — **not a gap after all**: verified against this workflow's actual run history via the GitHub API (30 most recent runs, spaced 50–195 min apart). README's "~hourly due to scheduler variance" is the accurate description; my first pass at this document was wrong to call it out as an inconsistency. See [GitHub Actions](#github-actions) for the corrected explanation and the known GitHub Actions behavior behind it.

## What to re-check periodically

- The two unofficial endpoints (CNN Fear & Greed, Cboe VIX/VIXEQ) have no contract and can change shape or start blocking without notice — spot-check their rendered values against CNN's and Cboe's own public pages occasionally.
- Finnhub's free-tier rate limit and Gemini's free-tier quota are both the kind of thing providers change without much notice — re-verify against their current pricing/limits pages if either integration starts erroring.
- If this repo is public on GitHub, the background refresh job is subject to GitHub's 60-day scheduled-workflow auto-disable; a stale `stock_quotes` table with no errors anywhere is the symptom to watch for.
- The refresh job's real cadence (~hourly, occasionally up to ~3 hours) is set by GitHub's scheduler, not this project's cron expression — if data ever looks stale, check the [Actions run history](https://github.com/benjaminllu/bl-investment-dashboard/actions/workflows/refresh-data.yml) for actual gaps before assuming the job itself is broken.
