"use client";

import { useEffect, useState, type KeyboardEvent, type PointerEvent } from "react";
import { FRED_RANGES, type FredRange, type FredObservation } from "@/lib/fred";

interface Props {
  seriesId: string;
  label: string;
  unit: string;
}

const WIDTH = 800;
const HEIGHT = 220;
const PADDING_X = 4;
const PADDING_Y = 12;
const BASELINE_Y = HEIGHT - 1;
const TICK_COUNT = 5;

function formatDate(iso: string, short = false): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(
    "en-US",
    short ? { month: "short", year: "numeric" } : { year: "numeric", month: "short", day: "numeric" }
  );
}

function xForIndex(i: number, n: number): number {
  return PADDING_X + (i / Math.max(n - 1, 1)) * (WIDTH - PADDING_X * 2);
}

function buildPaths(observations: FredObservation[]) {
  const values = observations.map((o) => o.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = observations.map((o, i) => {
    const x = xForIndex(i, observations.length);
    const y = PADDING_Y + (1 - (o.value - min) / range) * (BASELINE_Y - PADDING_Y * 2);
    return [x, y] as const;
  });

  const line = `M${coords.map(([x, y]) => `${x},${y}`).join(" L")}`;
  const area = `${line} L${coords[coords.length - 1][0]},${BASELINE_Y} L${coords[0][0]},${BASELINE_Y} Z`;

  return { line, area, min, max, coords };
}

function tickIndices(n: number): number[] {
  if (n <= 1) return [0];
  const count = Math.min(TICK_COUNT, n);
  const set = new Set<number>();
  for (let k = 0; k < count; k++) {
    set.add(Math.round((k / (count - 1)) * (n - 1)));
  }
  return Array.from(set).sort((a, b) => a - b);
}

export default function FredChart({ seriesId, label, unit }: Props) {
  const [range, setRange] = useState<FredRange>("5Y");
  const [observations, setObservations] = useState<FredObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHoverIndex(null);
    fetch(`/api/fred/observations?series=${seriesId}&range=${range}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setObservations(data.observations ?? []);
      })
      .catch(() => {
        if (!cancelled) setObservations([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [seriesId, range]);

  const { line, area, min, max, coords } =
    observations.length > 0
      ? buildPaths(observations)
      : { line: "", area: "", min: 0, max: 0, coords: [] as readonly (readonly [number, number])[] };

  function handlePointerMove(e: PointerEvent<SVGSVGElement>) {
    if (observations.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fracX = (e.clientX - rect.left) / rect.width;
    const svgX = fracX * WIDTH;
    const i = Math.round(((svgX - PADDING_X) / (WIDTH - PADDING_X * 2)) * (observations.length - 1));
    setHoverIndex(Math.min(Math.max(i, 0), observations.length - 1));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (observations.length === 0) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHoverIndex((prev) => (prev === null ? observations.length - 1 : Math.max(prev - 1, 0)));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setHoverIndex((prev) =>
        prev === null ? observations.length - 1 : Math.min(prev + 1, observations.length - 1)
      );
    } else if (e.key === "Escape") {
      setHoverIndex(null);
    }
  }

  const hovered = hoverIndex !== null ? observations[hoverIndex] : null;
  const hoveredCoord = hoverIndex !== null ? coords[hoverIndex] : null;

  return (
    <div className="rounded-xl bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>
        <div className="flex gap-1">
          {FRED_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                range === r
                  ? "bg-accent text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : observations.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          No data for this range.
        </div>
      ) : (
        <div
          className="relative rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          tabIndex={0}
          role="img"
          aria-label={`Line chart of ${label} from ${formatDate(observations[0].date)} to ${formatDate(observations[observations.length - 1].date)}. Use arrow keys to inspect individual points.`}
          onKeyDown={handleKeyDown}
        >
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-64 w-full touch-none"
            preserveAspectRatio="none"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id={`fred-fill-${seriesId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.25} className="text-accent" />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} className="text-accent" />
              </linearGradient>
            </defs>

            <path d={area} fill={`url(#fred-fill-${seriesId})`} stroke="none" />
            <path
              d={line}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="text-accent"
            />

            {/* x-axis */}
            <line
              x1={0}
              y1={BASELINE_Y}
              x2={WIDTH}
              y2={BASELINE_Y}
              stroke="currentColor"
              strokeWidth={1}
              className="text-border"
            />
            {tickIndices(observations.length).map((i) => {
              const x = xForIndex(i, observations.length);
              return (
                <line
                  key={i}
                  x1={x}
                  y1={BASELINE_Y}
                  x2={x}
                  y2={BASELINE_Y + 5}
                  stroke="currentColor"
                  strokeWidth={1}
                  className="text-border"
                />
              );
            })}

            {hoveredCoord && (
              <>
                <line
                  x1={hoveredCoord[0]}
                  y1={PADDING_Y}
                  x2={hoveredCoord[0]}
                  y2={BASELINE_Y}
                  stroke="currentColor"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  className="text-muted-foreground"
                />
                <circle
                  cx={hoveredCoord[0]}
                  cy={hoveredCoord[1]}
                  r={5}
                  fill="currentColor"
                  className="text-accent"
                />
              </>
            )}
          </svg>

          {hovered && hoveredCoord && (
            <div
              className="pointer-events-none absolute whitespace-nowrap rounded-lg border border-border bg-background px-2 py-1 text-xs shadow-lg"
              style={{
                left: `${(hoveredCoord[0] / WIDTH) * 100}%`,
                top: `${(hoveredCoord[1] / HEIGHT) * 100}%`,
                transform: `translate(${
                  hoveredCoord[0] / WIDTH < 0.15 ? "0%" : hoveredCoord[0] / WIDTH > 0.85 ? "-100%" : "-50%"
                }, -120%)`,
              }}
            >
              <p className="font-semibold tabular-nums text-foreground">
                {hovered.value.toFixed(2)}
                {unit}
              </p>
              <p className="text-muted-foreground">{formatDate(hovered.date)}</p>
            </div>
          )}

          {hovered && (
            <span className="sr-only" aria-live="polite">
              {formatDate(hovered.date)}: {hovered.value.toFixed(2)}
              {unit}
            </span>
          )}
        </div>
      )}

      {!loading && observations.length > 0 && (
        <div className="relative mt-1 h-4 text-xs text-muted-foreground">
          {tickIndices(observations.length).map((i) => {
            const xPercent = (xForIndex(i, observations.length) / WIDTH) * 100;
            const isFirst = i === 0;
            const isLast = i === observations.length - 1;
            return (
              <span
                key={i}
                className={`absolute whitespace-nowrap ${
                  isFirst ? "" : isLast ? "-translate-x-full" : "-translate-x-1/2"
                }`}
                style={{ left: `${xPercent}%` }}
              >
                {formatDate(observations[i].date, true)}
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-2 text-xs tabular-nums text-muted-foreground">
        Range: {min.toFixed(2)}
        {unit} – {max.toFixed(2)}
        {unit}
      </div>
    </div>
  );
}
