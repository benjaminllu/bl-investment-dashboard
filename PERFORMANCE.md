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

## Done — 2026-08-28

- **Float precision trimmed at the serialisation boundary.** Every number a
  server component hands a client component is written twice into the response:
  into the rendered HTML, and into the inline RSC flight payload React replays
  to hydrate. `/sectors` and `/positioning` were shipping ~2,000 doubles each at
  full 17-digit precision and displaying them to one decimal. `lib/precision.ts`
  rounds to six significant digits — the widest value this app renders is four
  integer digits at two decimals, which *is* six significant digits, so nothing
  displayed can change. Applied to the finished return objects of
  `computeRotation`, `computeSectorTable` and `fetchKoreaLeverage`, never to
  values still being computed with.

  | | RSC payload (gz) | HTML (gz) |
  |---|---|---|
  | `/sectors` | 46.1 KB → 33.6 KB (**−27%**) | 75.8 KB → 63.5 KB (−16%) |
  | `/positioning` | 23.5 KB → 16.5 KB (**−30%**) | 36.3 KB → 29.9 KB (−18%) |

  Verified by replaying `scripts/verifyRotation.ts` and
  `scripts/verifyKoreaLeverage.ts` against trimmed and untrimmed builds of the
  same fetched universe: **output byte-identical** in both, and the KOFIA column
  invariants still pass. The sector table was diffed the same way at its own
  `toFixed(1)` display precision. `/` and `/research` moved 1–6% between the two
  builds, which is upstream data drift, not this change — neither page touches
  these three functions.
## Not worth doing

Recorded so it does not get re-investigated:

- **Shrinking the shared JS baseline.** 178 KB gz is React plus the Next
  runtime. There is no application fat in it.
- **CSS.** 12.3 KB gz for the entire design system.
- **Fonts.** Five weights declared, one preloaded, none render-blocking.
  Dropping weight 300 if it is unused would save ~20 KB that never blocks.
- **`revalidate` tuning.** Every route already floors at 5m via the tape's 300s
  index quotes in the root layout, which is right for this data.

  **Amended 2026-08-28.** Still true, and still not worth doing, but the reason
  is now narrower than it was. `/sectors` and `/positioning` both declare
  `revalidate = 3600` and both are reported as **5m** in the build table — the
  floor applies to them too, so the segment config is not doing what its comment
  says. The bars themselves carry `next: { revalidate: 3600 }` and are *not*
  refetched, so the only repeated cost is recomputation: `computeRotation`
  measures **~110ms**, running twelve times an hour instead of once. That is too
  small to chase. The note at `lib/marketBars.ts:35` claiming the fetch happens
  "once an hour on a background revalidation" is the part that is wrong.

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

### 2. The RSC payload on `/`, `/research` and `/sectors`

**Re-measured 2026-08-28.** `/sectors` did not exist when this was written and
is now the heaviest route in the app; the float trim above took the worst of it
off, and what remains is the deliberate trade described below. Current payloads,
gzipped: `/sectors` 33.6 KB · `/` 31.4 KB · `/research` 24.4 KB ·
`/positioning` 16.5 KB · everything else 2–3 KB.

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

### 3. The rail prefetches all nine routes on every page load

- [ ] `components/shell/parts.tsx:126` renders nine `<Link>`s that are
      *permanently* in the viewport, so Next prefetches every route on every
      page load. Summing the full prefetch responses comes to **139 KB gz**
      before the float trim, ~118 KB after.

      **That number is an upper bound, not a measurement of what the browser
      actually does.** Next 16's segment cache fetches incrementally — its tree
      requests measured 216–510 bytes each — so real traffic is lower and split
      across more requests. Nobody has captured a browser waterfall here yet,
      and that is the thing to do before touching this. If it does turn out to
      matter, the fix is `prefetch={false}` on the rail with a hover-triggered
      `prefetch={null}`, which the Next docs describe under Hover-triggered
      prefetch — but the rail prefetch is also *why* navigation feels instant,
      so this is a trade, not a cleanup.

### 4. `HomeBoard` puts the client boundary at the top of `/`

- [ ] `components/HomeBoard.tsx:1` is `"use client"`, which pulls
      `MarketDigestPanel`, `MoversPanel`, `EarningsPanel`, `ResearchFeed` and
      `StockTable` into the client bundle with it — several of which carry no
      directive of their own and were server-rendered before the board landed.
      It holds three pieces of state (`activeList`, `selected`, `presetIndex`),
      so the boundary could sit lower, with the static panels passed through as
      `children`.

      **Unsized.** Per-route JS could not be measured on 2026-08-28 — see the
      note on `next dev` below — so there is no number here yet, only a shape
      that looks wrong. Get the number before doing the work.

## Ruled out — measured, not a problem

Recorded so these do not get re-investigated:

- **Server render time.** Warm TTFB on a production build: `/` 9ms, `/sectors`
  8ms, `/research` 8ms, `/positioning` 5ms, `/macro` 3ms, `/portfolio` 13ms.
  Nothing here is slow.
- **Cold upstream fetches.** Measured directly: Yahoo's 27 tickers at 10y
  **311ms** (the 1.9s recorded on 2026-08-22 was not reproducible), FreeSIS
  0.8–1.25s, Supabase 0.12–0.86s, FRED 0.43s, Cboe 0.22s. A cache miss costs
  roughly 0.5–2s and only on a miss.
- **`loading.tsx` harming prefetch.** The Next 16 prefetching guide's table says
  a `loading.js` truncates prefetch to the loading boundary and disables the
  client cache. Measured, it does not do that here: prefetch responses equal the
  full payloads, and every route but `/portfolio` is static, so
  `staleTimes.static` (5 min) applies rather than `staleTimes.dynamic` (0).

## A trap when measuring this app

`next dev` writes into the same `.next/` directory a production build uses. With
a dev server running, `next build` produces prerendered HTML referencing static
chunks that dev has already replaced, and they 404 — which looks exactly like a
broken deploy and is not one. On 2026-08-28 there was also a `next dev` plus
**eight** orphaned `next start` servers on ports 3111–3115, 3120 and 3130 left
over from earlier sessions. Kill everything before trusting a bundle measurement;
route timings and `.rsc` sizes taken from `.next/server/app/` are unaffected.
