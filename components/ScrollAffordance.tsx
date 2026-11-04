"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// Moved from WatchlistPanel.tsx so the home board's category tabs can scroll
// the same way.

export function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={direction === "left" ? "M15.75 19.5 8.25 12l7.5-7.5" : "M8.25 4.5l7.5 7.5-7.5 7.5"}
      />
    </svg>
  );
}

/**
 * Tracks how far a horizontally scrollable element can still travel, so the
 * scroll arrows can be hidden when there is nothing to scroll and dimmed at
 * each end. Without this the category strip has no affordance at all — the
 * native scrollbar is deliberately suppressed, which is exactly why the row
 * reads as a complete list rather than a scrollable one.
 */
export function useScrollAffordance(itemCount: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 1px of tolerance: fractional layout widths leave scrollLeft a hair short
    // of its true maximum, which would strand the right arrow enabled forever.
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // Catches viewport resizes; itemCount in the deps catches the tab list
    // itself changing, which alters scrollWidth without resizing the element.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, itemCount]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    // The global reduced-motion rule sets scroll-behavior in CSS, which a JS
    // `behavior` option overrides — so the preference has to be read here too.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({
      left: direction * el.clientWidth * 0.8,
      behavior: reduced ? "auto" : "smooth",
    });
  };

  return { ref, canLeft, canRight, scrollByPage };
}
