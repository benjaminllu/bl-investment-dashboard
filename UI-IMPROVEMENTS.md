# Deferred UI Improvements

Findings from a `ui-ux-pro-max` review (2026-07-14), evaluated against
`design-system/bl-investment-dashboard/MASTER.md`. Categories 1, 2, 4, and 6
from that review were implemented directly. The rest are recorded here as
concrete, scoped changes to pick up later — not vague ideas, but specific
enough to implement without re-deriving the plan.

## Priority 3 — Performance

- [ ] Convert `<img>` to `next/image` in `components/ResearchFeed.tsx` (lines
      ~30, ~112) and `app/ai-summary/page.tsx` (~line 77).
- **Open question**: these images come from unpredictable external hosts
      (Substack authors' custom domains, whatever Finnhub scrapes for news
      thumbnails). `next/image` requires allow-listing hosts via
      `images.remotePatterns` in `next.config.ts` — either accept a broad
      wildcard (weakens the domain-allowlist safety `next/image` is meant to
      provide) or accept that unlisted-domain images silently fall back to
      unoptimized. Decide this before implementing.

## Priority 5 — Layout & Responsive

- [ ] `app/page.tsx` (~lines 49-55): home page layout has zero responsive
      breakpoints. Change `flex gap-4 items-start` to
      `flex flex-col gap-4 items-start lg:flex-row`, and the news sidebar's
      `w-1/4 shrink-0` to `w-full shrink-0 lg:w-1/4`, so it stacks below the
      watchlist on narrow screens instead of squeezing both into slivers.
- [ ] Wrap `StockTable` and the Portfolio table in `overflow-x-auto` as a
      defensive fallback so a 6-column table degrades to horizontal scroll
      on narrow viewports rather than breaking layout.

## Priority 7 — Animation (low severity)

- [ ] Add the standard reduced-motion boilerplate to `app/globals.css`:
      ```css
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
        }
      }
      ```
      Low risk, low urgency — existing motion is already just
      `transition-colors` color fades, nothing transform-heavy.

## Priority 8 — Forms

- [ ] `components/AddStockForm.tsx`: add a visible `<label htmlFor>` above
      each of the 5 fields (Ticker, Company, Priority, Latest Update,
      Thesis), with paired `id`s on the inputs, and a required-indicator
      (e.g. asterisk) next to Ticker/Company since those are the two
      `required` fields. Placeholder text can stay as a shorter secondary
      hint once a label exists. (A first pass at this was drafted and then
      reverted during the 2026-07-14 session to keep that session's scope to
      categories 1/2/4/6 — the labeled-input JSX pattern is straightforward
      to redo when this is picked up.)

## Priority 10 — Charts

- [ ] `components/FredChart.tsx`: distinguish a genuinely empty data range
      from a failed fetch. Add an `error` state set in the `.catch()` of the
      observations fetch, and render "Failed to load — Retry" (button
      re-triggers the same fetch) instead of collapsing into the same
      "No data for this range" text used for real empty ranges.
- [x] ~~Add `role="img"` + `aria-label` chart summary for screen readers~~ —
      done as part of the category-1 keyboard-accessibility work, since an
      unlabeled `role="img"` would have been a regression, not a deferral.
