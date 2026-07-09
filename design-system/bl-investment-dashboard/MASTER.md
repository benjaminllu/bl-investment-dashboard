# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** BL Investment Dashboard
**Generated:** 2026-07-09 04:38:13
**Category:** Financial Dashboard
**Design Dials:** Variance 4/10 (Balanced / Modern) | Motion 5/10 (Standard) | Density 8/10 (Dense / Dashboard)

**Adopted vs. declined (decided 2026-07-09):**
- ✅ Density 8/10 spacing scale — applied across NavBar, tables, cards, panels.
- ✅ IBM Plex Sans typography — replaces Geist app-wide.
- ❌ Glassmorphism / blur / ambient glow effects — declined. Adds visual noise and perf cost for a data-dense trading dashboard with no clear functional gain.
- ❌ GSAP page-transition motion — declined, same reasoning; not worth a new dependency for this product.
- Colors below were already adopted in an earlier pass and are accurate; see git history for the corrected palette this generator run produced (this one is internally consistent, unlike the first generation).

---

## Global Rules

### Color Palette

> This run's generated palette (Primary/Secondary naming) doesn't match the token
> names actually wired into `app/globals.css`. Table below is the real, implemented
> set — same dark-bg-plus-green-accent direction the generator suggested, kept in
> sync with the earlier corrected palette rather than replaced again.

| Role | Hex | Tailwind | CSS Variable |
|------|-----|----------|--------------|
| Background | `#020617` | `slate-950` | `--color-background` |
| Foreground | `#FFFFFF` | `white` | `--color-foreground` |
| Card | `#0F172A` | `slate-900` | `--color-card` |
| Muted | `#1E293B` | `slate-800` | `--color-muted` |
| Muted Foreground | `#94A3B8` | `slate-400` | `--color-muted-foreground` |
| Border | `#1E293B` | `slate-800` | `--color-border` |
| Accent/Primary | `#34D399` | `emerald-400` | `--color-accent` |
| Destructive | `#F87171` | `red-400` | `--color-destructive` |
| Ring | `#34D399` | `emerald-400` | `--color-ring` |

**Color Notes:** Deep-black OLED background with emerald for gains/active state, red for losses.

### Typography

- **Heading Font:** IBM Plex Sans
- **Body Font:** IBM Plex Sans
- **Mood:** financial, trustworthy, professional, corporate, banking, serious
- **Google Fonts:** [IBM Plex Sans + IBM Plex Sans](https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap');
```

### Spacing Variables

*Density: 8/10 — Dense / Dashboard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `2px` / `0.125rem` | Tight gaps |
| `--space-sm` | `4px` / `0.25rem` | Icon gaps, inline spacing |
| `--space-md` | `8px` / `0.5rem` | Standard padding |
| `--space-lg` | `12px` / `0.75rem` | Section padding |
| `--space-xl` | `16px` / `1rem` | Large gaps |
| `--space-2xl` | `24px` / `1.5rem` | Section margins |
| `--space-3xl` | `32px` / `2rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: var(--color-accent); /* emerald-400 */
  color: #020617;
  padding: 8px 16px; /* dense scale: --space-md / --space-xl */
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: var(--color-accent);
  border: 2px solid var(--color-accent);
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: var(--color-card); /* slate-900 */
  border-radius: 12px;
  padding: 16px; /* dense scale: --space-xl, not the generator's 24px default */
  box-shadow: var(--shadow-md);
  transition: box-shadow 200ms ease;
}

.card:hover {
  box-shadow: var(--shadow-lg);
}
```

### Inputs

```css
.input {
  background: var(--color-card);
  color: var(--color-foreground);
  padding: 8px 12px; /* dense scale */
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: var(--color-accent);
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 20%, transparent);
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.modal {
  background: var(--color-card);
  color: var(--color-foreground);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 24px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Modern Dark (Cinema Mobile) — **⚠️ DECLINED, reference only, not implemented**

The generator suggested this style (glassmorphism, ambient glow, haptics), but it was
explicitly turned down for this product: too much visual noise and perf cost for a
data-dense trading dashboard, and several of its effects (haptics, Reanimated) are
React Native-specific and don't apply to this Next.js web app anyway. Kept here so a
future session doesn't re-suggest it without knowing it was already considered.

**Keywords:** dark mode, cinematic, ambient light, glassmorphism, deep black, indigo, glow, blur, atmospheric, reanimated, haptic, premium, layered, frosted glass, linear gradient

**Key Effects (not applied):** Expo.out Bezier(0.16,1,0.3,1) easing; spring modals; haptic-linked press; animated ambient light blobs; BlurView glassmorphism headers/nav; scale press 0.97 → 1.0

### Page Pattern

**Pattern Name:** Real-Time / Operations Landing — **not applicable**

This is a marketing/landing-page pattern (hero, features, CTA, download buttons). This
product is an internal dashboard with no such sections; ignore this pattern entirely.

---

## Motion — **⚠️ DECLINED, reference only, not implemented**

GSAP page-transition overlay was suggested and turned down (new dependency, no clear
functional gain for this product). Existing hover/focus transitions (150-300ms,
CSS-only) are sufficient. Kept here for the same reason as the style section above.

```js
const tl = gsap.timeline(); tl.to('.transition-overlay', { yPercent: 0, duration: 0.4, ease: 'power2.inOut' }).call(navigate).to('.transition-overlay', { yPercent: -100, duration: 0.4, ease: 'power2.inOut', delay: 0.1 });
```

---

## Anti-Patterns (Do NOT Use)

- ❌ Light mode default
- ❌ Slow rendering

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
