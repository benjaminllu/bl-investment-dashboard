# App Wide Page Overrides

> **PROJECT:** BL Investment Dashboard
> **Generated:** 2026-07-09 04:38:13 (corrected 2026-07-09)
> **Page Type:** Dashboard / Data View

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

> The generator's first draft of this file described an app-store/mobile-download
> landing page (device mockups, screenshot carousel, App Store/Play Store CTAs) —
> completely mismatched to this project, a data-dense web dashboard. Replaced below
> with what's actually true for this app.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** `max-w-screen-2xl`, existing app shell — no landing-page sections (no hero, no carousel, no CTAs)
- **Structure:** Sticky header (market banner + nav) + per-route content area

### Spacing Overrides

- **Content Density:** High (8/10) — applied via the dense spacing scale in `MASTER.md`

### Typography Overrides

- IBM Plex Sans (adopted app-wide via `next/font/google` in `app/layout.tsx`), no per-page override

### Color Overrides

- No overrides — use Master color tokens throughout (`bg-background`, `bg-card`, `text-muted-foreground`, `text-accent`, etc.)

### Component Overrides

- No glassmorphism/blur, no GSAP motion — see `MASTER.md` "declined" notes

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Row/tab hover highlighting and 150-300ms CSS transitions are sufficient; no additional effects needed
- Keep data tables and charts full-width within their panel; don't cap line-length like prose content
