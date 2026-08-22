# Deferred UI Improvements

Findings from a `ui-ux-pro-max` review (2026-07-14), evaluated against
`design-system/bl-investment-dashboard/MASTER.md`. Categories 1, 2, 4, and 6
from that review were implemented directly. The rest are recorded here as
concrete, scoped changes to pick up later — not vague ideas, but specific
enough to implement without re-deriving the plan.

## Priority 3 — Performance

- [x] ~~Convert `<img>` to `next/image` in `components/ResearchFeed.tsx` and
      `app/ai-summary/page.tsx`~~ — **resolved 2026-08-22, but not with
      `next/image`.** The open question below turned out to be a false
      dichotomy: the answer was neither the wildcard nor the silent fallback.

      Rewriting the image URL asks the CDN that already hosts the file to
      resize it, so we allow-list nothing, proxy nothing, add no dependency and
      consume no Vercel image-optimization quota. Home page image weight went
      from 1,046 KB to 119 KB. See `lib/thumbnails.ts` and `PERFORMANCE.md`.

      The limitation, recorded honestly: it only works for hosts the helper
      knows about (currently CNBC and Substack's Cloudinary delivery). Unknown
      hosts pass through untouched. The universal half of the fix is the
      `loading="lazy"` added alongside it, which helps every host including the
      ones that cannot be resized.
- ~~**Open question**: these images come from unpredictable external hosts
      (Substack authors' custom domains, whatever Finnhub scrapes for news
      thumbnails). `next/image` requires allow-listing hosts via
      `images.remotePatterns` in `next.config.ts` — either accept a broad
      wildcard (weakens the domain-allowlist safety `next/image` is meant to
      provide) or accept that unlisted-domain images silently fall back to
      unoptimized. Decide this before implementing.~~ — answered above.

Further performance work, including the measured baseline and the deferred
TradingView and RSC-payload items, now lives in `PERFORMANCE.md`.

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

## Priority 10 — Charts

- [ ] `components/FredChart.tsx`: distinguish a genuinely empty data range
      from a failed fetch. Add an `error` state set in the `.catch()` of the
      observations fetch, and render "Failed to load — Retry" (button
      re-triggers the same fetch) instead of collapsing into the same
      "No data for this range" text used for real empty ranges.
- [x] ~~Add `role="img"` + `aria-label` chart summary for screen readers~~ —
      done as part of the category-1 keyboard-accessibility work, since an
      unlabeled `role="img"` would have been a regression, not a deferral.
