"use client";

import { useMemo, useState } from "react";
import {
  QUADRANT_LABEL,
  RRG_TAILS,
  type Quadrant,
  type RrgGroup,
  type RrgSeries,
} from "@/lib/rotation";

/**
 * The Relative Rotation Graph.
 *
 * Each fund is a dot: how strong it is against the benchmark on the horizontal,
 * whether that strength is building or fading on the vertical. The tail behind
 * it is where it has been over the selected number of weeks. Both axes are in
 * cross-sectional standard deviations with zero at the group average — see the
 * long note in `lib/rotation.ts` for why that is the normalisation, and for the
 * fact that this is a reconstruction of the published method rather than a copy
 * of it.
 *
 *
 * COLOUR
 *
 * Four quadrants, but only three colours exist in this design system, and
 * inventing a fourth hue for "improving" was the wrong trade. So: leading takes
 * the accent (it is the positive state and the accent is what positive means
 * here), weakening takes amber, lagging takes red, and improving is left
 * neutral — which is also the honest reading of it, since improving is
 * "not bad yet" rather than good. Position on the graph carries the rest.
 *
 *
 * THE LEGEND IS NOT DECORATION
 *
 * Eleven labelled dots on one square is at the edge of readable, and the answer
 * most readers want — "who is in which quadrant" — is a list, not a picture.
 * The list beside the graph is that answer, and it is also the keyboard and
 * screen-reader path to everything the dots encode.
 */

const SIZE = 420;
const PAD = 26;
/** Never zoom in past this, or a quiet week fills the square with noise. */
const MIN_DOMAIN = 2.4;

const QUADRANT_STROKE: Record<Quadrant, string> = {
  leading: "var(--color-accent)",
  weakening: "var(--color-warning)",
  lagging: "var(--color-destructive)",
  improving: "var(--color-muted-foreground)",
};

const QUADRANT_TEXT: Record<Quadrant, string> = {
  leading: "text-accent",
  weakening: "text-warning",
  lagging: "text-destructive",
  improving: "text-muted-foreground",
};

const QUADRANT_ORDER: Quadrant[] = ["leading", "weakening", "lagging", "improving"];

const QUADRANT_MEANING: Record<Quadrant, string> = {
  leading: "Strong and still strengthening",
  weakening: "Still strong, but losing it",
  lagging: "Weak and still weakening",
  improving: "Weak, but turning up",
};

function formatWeek(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export default function RotationGraph({ groups }: { groups: RrgGroup[] }) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "sector");
  const [weeks, setWeeks] = useState<number>(RRG_TAILS[1]);
  const [focused, setFocused] = useState<string | null>(null);

  const group = groups.find((g) => g.id === groupId) ?? groups[0];

  const trimmed = useMemo<RrgSeries[]>(() => {
    if (!group) return [];
    return group.series.map((s) => ({ ...s, tail: s.tail.slice(-weeks) }));
  }, [group, weeks]);

  const domain = useMemo(() => {
    let max = MIN_DOMAIN;
    for (const s of trimmed) {
      for (const p of s.tail) max = Math.max(max, Math.abs(p.x), Math.abs(p.y));
    }
    return max * 1.08;
  }, [trimmed]);

  if (!group) {
    return (
      <div className="border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Not enough aligned history to place the sectors. The graph will fill in on the next
          refresh.
        </p>
      </div>
    );
  }

  const scaleX = (v: number) => PAD + ((v + domain) / (2 * domain)) * (SIZE - PAD * 2);
  // SVG y grows downward and the axis does not, so this inverts.
  const scaleY = (v: number) => PAD + ((domain - v) / (2 * domain)) * (SIZE - PAD * 2);
  const mid = PAD + (SIZE - PAD * 2) / 2;

  // Terminal labels, nudged apart where two funds land on nearly the same spot.
  // A greedy single pass, not a solver: it fixes the common case of two dots
  // stacking and leaves a genuine three-way pile-up slightly overlapped, which
  // is the right amount of effort for something the legend already answers.
  const labels = trimmed
    .map((s) => {
      const p = s.tail[s.tail.length - 1];
      return { ticker: s.ticker, quadrant: s.quadrant, x: scaleX(p.x), y: scaleY(p.y) };
    })
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    const gap = labels[i].y - labels[i - 1].y;
    if (gap < 11 && Math.abs(labels[i].x - labels[i - 1].x) < 34) {
      labels[i].y = labels[i - 1].y + 11;
    }
  }
  const labelY = Object.fromEntries(labels.map((l) => [l.ticker, l.y]));

  const byQuadrant = QUADRANT_ORDER.map((q) => ({
    quadrant: q,
    members: trimmed.filter((s) => s.quadrant === q),
  }));

  const firstWeek = group.dates[Math.max(0, group.dates.length - weeks)];
  const lastWeek = group.dates[group.dates.length - 1];

  return (
    <div className="border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Rotation graph</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{group.note}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {groups.length > 1 && (
            <div className="flex gap-1" role="group" aria-label="Tier">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    setGroupId(g.id);
                    setFocused(null);
                  }}
                  aria-pressed={g.id === groupId}
                  className={`rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    g.id === groupId
                      ? "bg-accent text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1" role="group" aria-label="Tail length">
            {RRG_TAILS.map((t) => (
              <button
                key={t}
                onClick={() => setWeeks(t)}
                aria-pressed={t === weeks}
                className={`rounded px-2 py-1 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  t === weeks
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}w
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="mx-auto block h-auto w-full max-w-[540px]"
            role="img"
            aria-label={`Rotation graph, ${group.label}, ${weeks} weeks to ${lastWeek}. The list beside it gives each fund's quadrant.`}
          >
            {/* Quadrant washes. Four percent opacity: enough to tell the reader
                which corner is which without the fills competing with the dots. */}
            {(
              [
                ["leading", mid, PAD],
                ["weakening", mid, mid],
                ["lagging", PAD, mid],
                ["improving", PAD, PAD],
              ] as const
            ).map(([q, x, y]) => (
              <rect
                key={q}
                x={x}
                y={y}
                width={(SIZE - PAD * 2) / 2}
                height={(SIZE - PAD * 2) / 2}
                fill={QUADRANT_STROKE[q]}
                opacity={0.04}
              />
            ))}

            {/* One line per standard deviation. Without them the graph shows
                order but not distance, and "XLK is far ahead" and "XLK is
                marginally ahead" look identical — which on an auto-scaled
                square is exactly the mistake to protect against. */}
            {[-2, -1, 1, 2]
              .filter((sigma) => Math.abs(sigma) < domain)
              .map((sigma) => (
                <g key={sigma}>
                  <line
                    x1={scaleX(sigma)}
                    x2={scaleX(sigma)}
                    y1={PAD}
                    y2={SIZE - PAD}
                    stroke="var(--color-border)"
                    strokeDasharray="2 4"
                    opacity={0.7}
                  />
                  <line
                    x1={PAD}
                    x2={SIZE - PAD}
                    y1={scaleY(sigma)}
                    y2={scaleY(sigma)}
                    stroke="var(--color-border)"
                    strokeDasharray="2 4"
                    opacity={0.7}
                  />
                </g>
              ))}

            <line x1={PAD} x2={SIZE - PAD} y1={mid} y2={mid} stroke="var(--color-border)" />
            <line x1={mid} x2={mid} y1={PAD} y2={SIZE - PAD} stroke="var(--color-border)" />

            {(
              [
                ["leading", SIZE - PAD - 6, PAD + 13, "end"],
                ["weakening", SIZE - PAD - 6, SIZE - PAD - 6, "end"],
                ["lagging", PAD + 6, SIZE - PAD - 6, "start"],
                ["improving", PAD + 6, PAD + 13, "start"],
              ] as const
            ).map(([q, x, y, anchor]) => (
              <text
                key={q}
                x={x}
                y={y}
                textAnchor={anchor}
                fill={QUADRANT_STROKE[q]}
                opacity={q === "improving" ? 0.85 : 0.55}
                fontSize={11}
                fontWeight={600}
              >
                {QUADRANT_LABEL[q]}
              </text>
            ))}

            <text x={SIZE - PAD} y={SIZE - 8} textAnchor="end" fill="var(--color-muted-foreground)" fontSize={9}>
              relative strength →
            </text>
            <text
              x={10}
              y={PAD}
              textAnchor="end"
              fill="var(--color-muted-foreground)"
              fontSize={9}
              transform={`rotate(-90 10 ${PAD})`}
            >
              momentum of that strength →
            </text>

            {trimmed.map((s) => {
              const dimmed = focused !== null && focused !== s.ticker;
              const active = focused === s.ticker;
              const colour = QUADRANT_STROKE[s.quadrant];
              const d = s.tail
                .map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(p.x).toFixed(1)},${scaleY(p.y).toFixed(1)}`)
                .join(" ");
              const head = s.tail[s.tail.length - 1];
              return (
                <g
                  key={s.ticker}
                  opacity={dimmed ? 0.18 : 1}
                  className="transition-opacity duration-200"
                  onPointerEnter={() => setFocused(s.ticker)}
                  onPointerLeave={() => setFocused(null)}
                >
                  <path
                    d={d}
                    fill="none"
                    stroke={colour}
                    strokeWidth={active ? 2 : 1.25}
                    strokeOpacity={active ? 0.9 : 0.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {/* The oldest point, so the direction of travel is readable
                      without animating anything. */}
                  <circle
                    cx={scaleX(s.tail[0].x)}
                    cy={scaleY(s.tail[0].y)}
                    r={1.6}
                    fill={colour}
                    opacity={0.5}
                  />
                  <circle
                    cx={scaleX(head.x)}
                    cy={scaleY(head.y)}
                    r={active ? 5 : 3.6}
                    fill={colour}
                    stroke="var(--color-card)"
                    strokeWidth={1}
                  />
                  <text
                    x={scaleX(head.x) + 7}
                    y={labelY[s.ticker] + 3}
                    fill={active ? "var(--color-foreground)" : "var(--color-muted-foreground)"}
                    fontSize={10}
                    fontWeight={active ? 600 : 500}
                  >
                    {s.ticker}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {formatWeek(firstWeek)} → {formatWeek(lastWeek)} · weekly · zero is the{" "}
            {group.label.toLowerCase()} average, gridlines every standard deviation
          </p>
        </div>

        <div className="min-w-0 space-y-3">
          {byQuadrant.map(({ quadrant, members }) => (
            <div key={quadrant}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className={`text-xs font-semibold ${QUADRANT_TEXT[quadrant]}`}>
                  {QUADRANT_LABEL[quadrant]}
                </h3>
                <p className="text-xs text-muted-foreground">{QUADRANT_MEANING[quadrant]}</p>
              </div>
              {members.length === 0 ? (
                <p className="text-xs text-muted-foreground/70">—</p>
              ) : (
                <ul className="mt-0.5">
                  {members.map((s) => (
                    <li key={s.ticker}>
                      <button
                        onPointerEnter={() => setFocused(s.ticker)}
                        onPointerLeave={() => setFocused(null)}
                        onFocus={() => setFocused(s.ticker)}
                        onBlur={() => setFocused(null)}
                        className={`flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          focused === s.ticker ? "bg-muted/60 text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        <span className="w-10 shrink-0 font-medium text-foreground">{s.ticker}</span>
                        <span className="truncate">{s.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
        The idealised path is clockwise — improving, leading, weakening, lagging — and on this
        universe it genuinely tends that way, at about a full circuit every fifty weeks. Individual
        tails cut corners and reverse constantly; a graph that always rotated cleanly would be a
        graph with too much smoothing in it. Position here says nothing about direction: in a
        falling market the leading quadrant is where the smallest losses are.
      </p>
    </div>
  );
}
