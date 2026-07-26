# Product

## Register

product

## Platform

web

## Users

Primary user is Ben, tracking his own stock watchlist, macro indicators, curated research feeds, and live IBKR portfolio positions. A secondary audience of family and friends checks in occasionally out of casual curiosity — they're not making trading decisions from it, so the design should stay legible to a glance without needing to design new flows around their needs.

## Product Purpose

A personal investment research dashboard that serves two modes at different times of day: fast situational awareness (a glance that immediately surfaces what moved, what needs attention, what changed) and deeper research sessions (reading news, checking charts, forming a thesis before acting). Success is the dashboard supporting both without either mode getting in the way of the other.

## Positioning

Fully customized to Ben's own research process — his specific tickers, macro indicators, curated Substack/news sources, and real portfolio, assembled the way he actually works rather than the generic one-size-fits-all shape of a retail finance app or broker portal.

## Brand Personality

Precise and analytical: numbers-first, terse, no fluff, closer to a terminal than a consumer app. Paired with a sharp, modern fintech polish — crisp and current rather than sterile. Confidence comes from density done well (an already-adopted 8/10 density scale), not from decoration.

## Anti-references

None named explicitly. Generic AI-template look is already guarded against by the project's own design-system rules (design-system/bl-investment-dashboard/MASTER.md) — no glassmorphism/blur, no ambient glow, no gradient decoration.

## Design Principles

- Density with clarity: an 8/10 dense information layout is a deliberate choice for this product, not a flaw to soften — but every added element must earn its place against legibility.
- Two speeds, one surface: layouts should serve a fast glance and a deep-dive session without forcing a redesign between them (e.g. summary-first, detail-on-demand).
- It's Ben's tool, not a product for strangers: optimize for his specific tickers, sources, and workflow over generic flexibility or broad audience accommodation.
- Numbers-first, decoration-last: precision and trustworthiness come from accurate, well-hierarchied data, not visual flourish.
- Respect the standing design system: color, spacing, and motion decisions already recorded in `design-system/bl-investment-dashboard/MASTER.md` are adopted, not defaults to reconsider per task.

## Accessibility & Inclusion

Standard WCAG AA: 4.5:1 minimum text contrast, visible keyboard focus states, `prefers-reduced-motion` respected. No additional personal accommodations specified.
