---
name: BL Investment Dashboard
description: A dense, dark, terminal-like personal research dashboard for tracking watchlists, macro data, and portfolio positions.
colors:
  background: "#020617"
  card: "#0f172a"
  muted: "#1e293b"
  muted-foreground: "#94a3b8"
  border: "#1e293b"
  foreground: "#ffffff"
  accent: "#34d399"
  destructive: "#f87171"
  warning: "#fbbf24"
  ring: "#34d399"
typography:
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  title:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "8px"
  md: "12px"
spacing:
  xs: "2px"
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "24px"
  3xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.background}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: BL Investment Dashboard

## 1. Overview

**Creative North Star: "The Signal Room"**

Everything in this system sits quiet until something moves. The surface is OLED-dark, dense, and unadorned — a room built for one purpose: letting the single emerald signal (a gain, an active tab, a focused field) be the only thing that draws the eye. There is no chrome, no gradient, no glass; the dark isn't atmosphere, it's the resting state a dense trading-hours layout returns to between signals.

This is a personal tool built around one person's own tickers, macro indicators, and research process — not a product for strangers. Precision reads as trustworthiness here: correct numbers, tight spacing, and instant legibility carry more weight than any visual flourish. The design explicitly rejects glassmorphism, ambient glow, blur, and any decorative motion; those were evaluated and declined for this product (see `design-system/bl-investment-dashboard/MASTER.md`) as noise with no functional gain in a data-dense dashboard.

**Key Characteristics:**
- OLED-black background, used as the permanent resting state, not a "dark mode" toggle
- One accent color (emerald) carries all positive/active meaning; red carries all negative meaning; nothing else competes for attention
- Dense (8/10) spacing scale — tight padding, small type, high information density per screen
- Flat by default; shadow appears only at the sticky header edge and on card hover, never as ambient decoration

## 2. Colors: The Signal Room Palette

A near-black stage with exactly two meaningful signal colors; everything else is neutral scaffolding.

### Primary
- **Signal Green** (`#34d399`): The one accent. Marks gains, active nav tab (and any other tab-row active state — the underline-tab pattern is used consistently across NavBar, watchlist list-tabs, and the research feed tabs), focus rings, primary buttons, and links on hover. Its scarcity is what makes it legible — it never appears as pure decoration.

### Semantic
- **Alert Amber** (`#fbbf24`): The one warning-level state color, distinct from Signal Green (positive/active) and Alert Red (negative/error). Used for the pre-market/after-hours market-status dot and the WIP badge (`components/WipBadge.tsx`), which marks a feature as unfinished; reach for it anywhere else a state is "notable but not good or bad" rather than inventing a new hue.

### Neutral
- **Void Black** (`#020617`): App background. The OLED-dark resting state, not a theme toggle — this product has no light mode.
- **Slate Panel** (`#0f172a`): Card, table, and panel backgrounds — one step up from the void, enough to read as a surface without introducing a border everywhere.
- **Muted Slate** (`#1e293b`): Table headers, input backgrounds, dividers, borders. Same value doubles as both `--muted` and `--border` — a deliberate reuse, not an oversight.
- **Muted Foreground** (`#94a3b8`): Secondary text — timestamps, table headers, placeholder copy, inactive nav labels.
- **Pure White** (`#ffffff`): Primary text and headings — maximum contrast against Void Black.

### Named Rules
**The One Signal Rule.** Emerald is the only color that means "this is active, positive, or worth your attention." It is never used decoratively — if it's green, something moved or is selected.

**The No Ambient Light Rule.** No glow, no blur, no gradient, no glassmorphism, anywhere. Depth comes from flat tonal layering (Void → Slate Panel → Muted Slate), not from light effects. This was explicitly evaluated and declined for this product.

## 3. Typography

**Body Font:** IBM Plex Sans (with system-ui, sans-serif fallback)

**Character:** A single sans-serif family in multiple weights carries the whole system — financial, trustworthy, and serious without reaching for a second display face. Weight and size do the hierarchy work, not font-pairing.

### Hierarchy
- **Title** (600, 1.25rem, 1.3 line-height): Section and panel headings (e.g. "Add Stock").
- **Label** (500, 0.875rem, 1.4 line-height): Nav items, button text, table headers — the workhorse weight for anything interactive or structural.
- **Body** (400, 14px, 1.5 line-height): Table cell content, form inputs, article text. Tabular figures (`tabular-nums`) are used wherever numbers stack in a column, so digits align.
- **Muted label** (400, 14px, `--color-muted-foreground`): Timestamps, placeholder text, secondary metadata — always at full 14px, never shrunk further, since this is already a dense layout.

### Named Rules
**The One Family Rule.** IBM Plex Sans, in five weights (300–700), is the entire type system. No second face, no mono override for numbers — tabular-nums handles digit alignment without switching fonts. One documented exception: the app masthead ("Ben's Investment Research" in the header) is set in an italic serif as a deliberate wordmark, not a drift — it names the product once and doesn't recur anywhere else in the UI. Don't extend the serif to any other heading, label, or component.

## 4. Elevation

Flat by default. This system conveys depth through tonal layering (Void Black → Slate Panel → Muted Slate), not light or shadow. Shadow exists in exactly two places: separating the sticky header from scrolling content, and signaling interactivity on card hover. Nowhere else.

### Shadow Vocabulary
- **Header separation** (`shadow-md shadow-black/40`): Applied once, to the sticky header, so it reads as pinned above scrolling content.
- **Card resting** (`--shadow-md` / `0 4px 6px rgba(0,0,0,0.1)`): Default card elevation.
- **Card hover** (`--shadow-lg` / `0 10px 15px rgba(0,0,0,0.1)`): Cards lift slightly on hover as the only shadow-based interactive feedback in the system.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadow is never ambient or decorative — it appears only as a direct response to structure (the sticky header) or state (hover).

## 5. Components

Dense and functional, no ornamentation. Every component exists to hold or organize data, not to decorate the page — this is the throughline of buttons, cards, tables, and inputs alike.

### Buttons
- **Shape:** 8px radius (`rounded-lg`).
- **Primary:** Solid emerald background (`bg-accent`), void-black text for contrast, `8px 16px` padding, `font-semibold`, `text-sm`.
- **Hover / Focus:** Opacity fade to 90% on hover (`hover:opacity-90`), disabled state at 50% opacity. Focus-visible gets a 2px accent ring with background-offset (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`).

### Cards / Containers
- **Corner Style:** 12px radius (`rounded-xl`).
- **Background:** Slate Panel (`bg-card`).
- **Shadow Strategy:** Flat at rest, `shadow-md → shadow-lg` on hover (see Elevation).
- **Internal Padding:** 16px (`p-4`), the dense-scale standard.

### Inputs / Fields
- **Style:** Muted Slate background (`bg-muted`), 8px radius, `8px 12px` padding, no visible border at rest — the tonal shift from Slate Panel to Muted Slate is what defines the field.
- **Focus:** 2px accent ring, no border-color change — same ring token as buttons and links, so focus reads consistently across every interactive element.
- **Placeholder:** Muted foreground at 60% opacity, kept legible rather than faded to near-invisibility.

### Navigation
- **Style:** Horizontal tab row under the sticky market banner. Inactive tabs are muted-foreground text; the active tab gets a 2px bottom border in Signal Green plus green text — an underline-tab pattern, not a pill or background-fill pattern.
- **States:** Inactive → hover shifts text to full foreground white. Active → persistent green underline + green text, `aria-current="page"` for accessibility.
- **Overflow:** Horizontally scrollable (`overflow-x-auto`) rather than wrapping, so the tab row never breaks to a second line on narrow viewports.

### Data Tables
- **Header row:** Muted Slate background, muted-foreground text, uppercase not applied (sentence case) — kept quiet relative to the data below it.
- **Rows:** Bordered top-only (`border-t border-border`) between rows, not boxed individually. Selected row gets `bg-muted/60`, a translucent tint rather than a full-opacity fill or a colored stripe.
- **Numeric cells:** `tabular-nums` throughout so price and % columns align vertically. Gain/loss % uses Signal Green or destructive red directly on the number — no separate icon or badge.

## 6. Do's and Don'ts

### Do:
- **Do** keep the OLED-dark background as the permanent resting state — this product has no light mode and none should be added.
- **Do** reserve Signal Green (`#34d399`) exclusively for gains, active/selected state, and focus — never as a decorative accent.
- **Do** use `tabular-nums` on every column of stacked numbers (price, %, yields) so digits align.
- **Do** keep the dense 8/10 spacing scale (`--space-xs` through `--space-3xl`) — this is a deliberate dashboard density choice, not a default to loosen.
- **Do** respect `prefers-reduced-motion` on any transition added.

### Don't:
- **Don't** add glassmorphism, blur, or ambient glow effects — explicitly evaluated and declined for this product as visual noise with no functional gain.
- **Don't** add GSAP or choreographed page-transition motion — declined for the same reason; the existing 150–300ms CSS color/opacity transitions are sufficient.
- **Don't** use `border-left`/`border-right` colored stripes on cards or list items as an accent.
- **Don't** use emoji as icons — SVG icon sets (Heroicons/Lucide) only.
- **Don't** let muted-gray text drop below 4.5:1 contrast against Void Black or Slate Panel; if it's close, bump it toward white rather than toward gray.
- **Don't** cap table or chart width like prose content — data surfaces stay full-width within their panel.
