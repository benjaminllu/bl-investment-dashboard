"use client";

import { useState } from "react";
import type { Slice } from "@/lib/portfolioAnalytics";

/**
 * A composition donut, drawn as plain SVG.
 *
 * No charting dependency: two donuts do not justify pulling one in, and every
 * option would have dragged far more of the page into the client bundle than
 * the hover state here does.
 *
 * On colour: DESIGN.md specifies exactly two signal colours, and a categorical
 * palette is a deliberate exception to that, scoped to these charts — nine
 * slices distinguished only by opacity were not readable. Two rules keep it
 * from fighting the rest of the app:
 *
 *   - Nothing sits on the exact `destructive` red (#f87171). Red means "loss"
 *     on every other surface here, and a sector slice in that colour would read
 *     as a judgement about the sector rather than a label.
 *   - Unclassified is outside the palette entirely, in neutral grey. It is
 *     absent data, not a category, and should never look like one.
 */

const RADIUS = 36;
const STROKE = 14;
const HOVER_STROKE = 18;
/** How far a hovered slice slides out along its own mid-angle. */
const POP = 3.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Ordered so neighbouring slices never land on adjacent hues — slices are drawn
 * in descending size, so consecutive palette entries are always touching.
 */
const PALETTE = [
  "#34d399", // emerald — the house accent, so the largest slice stays on-brand
  "#a78bfa", // violet
  "#fbbf24", // amber
  "#38bdf8", // sky
  "#f472b6", // pink
  "#a3e635", // lime
  "#fb923c", // orange
  "#818cf8", // indigo
  "#2dd4bf", // teal
  "#e879f9", // fuchsia
];

const UNCLASSIFIED = "Unclassified";
const UNCLASSIFIED_COLOR = "#475569"; // slate-600: visible on card, clearly not a hue

export default function DonutChart({
  title,
  slices,
  footnote,
  emptyMessage = "No data",
}: {
  title: string;
  slices: Slice[];
  footnote?: string;
  emptyMessage?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);

  if (slices.length === 0 || total <= 0) {
    return (
      <div className="rounded-xl bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-xs text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  // Rank ignores Unclassified so it never consumes a palette entry.
  const ranked = slices.filter((s) => s.label !== UNCLASSIFIED);
  const arcLength = (s: Slice) => (s.pct / 100) * CIRCUMFERENCE;

  const arcs = slices.map((slice, i) => {
    const rank = ranked.indexOf(slice);
    // Prefix sum rather than accumulating into a captured variable, which the
    // React compiler rejects as unsafe to repeat across renders.
    const offset = slices.slice(0, i).reduce((sum, s) => sum + arcLength(s), 0);
    // Mid-angle of this arc, used to pop it outward. Measured in the arc
    // group's own frame; the group's -90° rotation preserves radial direction,
    // so the slice always slides away from the centre on screen.
    const midRad = ((offset + arcLength(slice) / 2) / CIRCUMFERENCE) * 2 * Math.PI;
    return {
      slice,
      dash: arcLength(slice),
      offset,
      color: rank >= 0 ? PALETTE[rank % PALETTE.length] : UNCLASSIFIED_COLOR,
      dx: Math.cos(midRad) * POP,
      dy: Math.sin(midRad) * POP,
    };
  });

  const activeSlice = active === null ? null : arcs[active];

  return (
    <div className="rounded-xl bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>

      <div className="mt-3 flex items-center gap-4">
        <svg
          viewBox="0 0 100 100"
          className="h-28 w-28 shrink-0"
          role="img"
          aria-label={`${title}: ${slices
            .slice(0, 3)
            .map((s) => `${s.label} ${s.pct.toFixed(1)} percent`)
            .join(", ")}`}
        >
          {/* Only the arcs are rotated, so the centre readout stays upright. */}
          <g transform="rotate(-90 50 50)">
            {arcs.map((a, i) => {
              const isActive = active === i;
              const dimmed = active !== null && !isActive;
              return (
                <circle
                  key={a.slice.label}
                  cx="50"
                  cy="50"
                  r={RADIUS}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={isActive ? HOVER_STROKE : STROKE}
                  // Slice length first, then the full circumference as the gap,
                  // so only this arc paints and the rest of the ring stays empty.
                  strokeDasharray={`${a.dash} ${CIRCUMFERENCE}`}
                  strokeDashoffset={-a.offset}
                  opacity={dimmed ? 0.35 : 1}
                  transform={isActive ? `translate(${a.dx} ${a.dy})` : undefined}
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                />
              );
            })}
          </g>

          {/* The hole is dead space otherwise; on hover it carries the number,
              so the eye never has to travel to the legend to read a slice. */}
          {activeSlice && (
            <text
              x="50"
              y="50"
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-foreground font-semibold tabular-nums"
              fontSize="14"
            >
              {activeSlice.slice.pct.toFixed(1)}%
            </text>
          )}
        </svg>

        <ul className="min-w-0 flex-1 space-y-0.5 text-xs">
          {arcs.map((a, i) => {
            const isActive = active === i;
            return (
              <li
                key={a.slice.label}
                tabIndex={0}
                // Hovering either side highlights both, so the legend is a way
                // into the chart and not just a caption for it.
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className={`flex cursor-pointer items-baseline gap-2 rounded-sm px-1 transition-colors duration-150 outline-none ${
                  isActive ? "bg-muted" : ""
                } ${active !== null && !isActive ? "opacity-50" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: a.color }}
                />
                <span
                  className={`truncate ${
                    a.slice.label === UNCLASSIFIED ? "text-muted-foreground" : "text-foreground"
                  }`}
                  title={a.slice.label}
                >
                  {a.slice.label}
                </span>
                <span
                  className={`ml-auto shrink-0 tabular-nums ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {a.slice.pct.toFixed(1)}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {footnote && <p className="mt-3 text-xs text-muted-foreground">{footnote}</p>}
    </div>
  );
}
