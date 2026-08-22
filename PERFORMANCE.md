# Performance

Measured 2026-08-22 against a production build (`next build` + `next start`),
not a dev server. Every number below came from an actual run; where something is
inferred rather than measured it says so.

The headline finding was that **none of this project's performance problems are
JavaScript**. Route splitting is already near-optimal and the shared bundle is
essentially all React and the Next runtime. The costs were one pathological
upstream API, one line of image markup, and one cache flag.

## Baseline

| | |
|---|---|
| Shared JS on every page | 178 KB gz (620 KB raw), 9 chunks, identical across all 6 pages |
| Per-route unique JS | 2–10 KB gz |
| CSS | 12.3 KB gz (73 KB raw) |
| Fonts | 6 woff2, 1 preloaded — `next/font` handling it correctly |
| HTML (gz) | `/` 50 KB · `/research` 37 KB · `/positioning` 35 KB · rest 6–9 KB |
| Static route TTFB | 3–6 ms |

## Done — 2026-08-22

- **Treasury yields moved from treasury.gov to FRED.** The CSV endpoint measured
  18.2s / 19.5s / 18.4s TTFB across three consecutive runs for 13 KB. It sat in
  the root layout, so it gated every static regeneration in the app. FRED
  answers in ~0.30s. Values verified identical on the dates both sources
  publish. See the caveat in DEPENDENCIES.md — FRED trails by one business day.
- **Third-party thumbnails resized at the CDN.** The news and Substack rails
  render 56x56 boxes and were fetching press-release originals to fill them —
  one CNBC photo at `w=1920&h=1080` was 234 KB. Home page image weight went from
  **1,046 KB to 119 KB (927 KB saved, 8.8x)**, and 107 KB of what remains is a
  single un-resizable source logo that is now lazy-loaded. See `lib/thumbnails.ts`.
- **`/` made static.** A `cache: "no-store"` in `lib/substack.ts` was opting the
  whole home page out of static rendering — it was the only non-`/portfolio`
  dynamic route. **157–290 ms → 5–7 ms**, and it can now be CDN cached.

## Not worth doing

Recorded so it does not get re-investigated:

- **Shrinking the shared JS baseline.** 178 KB gz is React plus the Next
  runtime. There is no application fat in it.
- **CSS.** 12.3 KB gz for the entire design system.
- **Fonts.** Five weights declared, one preloaded, none render-blocking.
  Dropping weight 300 if it is unused would save ~20 KB that never blocks.
- **`revalidate` tuning.** Every route already floors at 5m via `MarketBanner`'s
  300s index quotes in the root layout, which is right for this data.

## Deferred — worth doing, more involved

Scoped concretely enough to pick up without re-deriving the analysis. Neither is
urgent; both are real.

### 1. TradingView widget: defer the load, and stop rebuilding the iframe

`components/TickerChart.tsx`. Measured at **~32 MB of heap**, against ~6 MB for
everything else on the home page combined. Two separable problems:

- [ ] **It loads eagerly on mount.** The `useEffect` injects TradingView's script
      immediately, so a third-party iframe competes with hydration of the rest of
      the page. Deferring to `requestIdleCallback` — or an `IntersectionObserver`
      so it loads when scrolled to — would let the watchlist table become
      interactive first.
      **Tradeoff to decide before implementing:** the chart is the thing Ben
      actually looks at on this page. A deliberate delay before it appears may
      be a worse experience than the hydration contention it fixes. Measure both
      before committing; this is not obviously a win.
- [ ] **Every symbol or preset change tears the iframe down and reloads it.**
      `outer.innerHTML = ""` followed by a fresh `<script>` injection, on every
      change to `symbol` or `studies`. The range row already avoids this — that
      was a deliberate fix, and the comment at `TickerChart.tsx:38-44` explains
      why the built-in range strip is used instead of custom buttons. Symbol
      switching should be reachable the same way, through the widget's
      `postMessage` API, without a rebuild.
      **Known obstacle:** changing *studies* at runtime is a different and
      harder problem than changing the symbol, and may genuinely require a
      rebuild. Doing the symbol half alone is still worthwhile — it is the far
      more frequent interaction.

### 2. The 130 KB RSC payload on `/` and `/research`

- [ ] Both pages ship a single **130 KB** React flight chunk carrying all 130
      stocks plus 358 earnings rows serialized into the HTML. Gzip takes it to
      ~37 KB on the wire, so bandwidth is not the problem — the cost is that
      React parses and hydrates all of it on the client.

      **This is a deliberate trade, not an oversight.** Sending every ticker's
      earnings is what makes changing the selected stock cost zero network, and
      that is documented in `lib/watchlist.ts`. The lever, if it is ever wanted,
      is to send only the *next* report per ticker and fetch full history on
      selection.

      **Do not do this speculatively.** It trades a guaranteed network round
      trip on every selection change for a hydration cost that has not yet been
      shown to matter. Measure hydration time first; if it is not visibly
      dragging, leave it alone.
