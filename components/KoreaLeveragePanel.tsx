"use client";

import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  KOREA_LEVERAGE_RANGES,
  type KoreaLeverageAnchor,
  type KoreaLeverageData,
  type KoreaLeverageMetric,
  type KoreaLeveragePoint,
  type KoreaLeverageRange,
} from "@/lib/koreaLeverage";
import { ordinal } from "@/lib/riskNarrative";

const WIDTH = 800;
const HEIGHT = 200;
const PADDING_X = 4;
const PADDING_Y = 10;
const BASELINE_Y = HEIGHT - 1;
const TICK_COUNT = 5;

const METRICS: { id: KoreaLeverageMetric; label: string }[] = [
  { id: "ratio", label: "% of cap" },
  { id: "level", label: "₩ level" },
];

/**
 * Trillions of won in, a readable string out.
 *
 * Forced sales are three orders smaller than the margin balance they come out
 * of — 0.006tn reads as a rounding error next to 31.10tn — so anything under a
 * trillion drops to billions rather than growing leading zeros.
 */
function krw(tn: number | null, digits = 2): string {
  if (tn === null || !Number.isFinite(tn)) return "—";
  if (Math.abs(tn) < 1) return `₩${(tn * 1000).toFixed(digits === 2 ? 1 : digits)}bn`;
  return `₩${tn.toFixed(digits)}tn`;
}

function pct(value: number | null, digits = 3): string {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)}%`;
}

function formatDate(iso: string | null, short = false): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString(
    "en-GB",
    short
      ? { month: "short", year: "numeric" }
      : { day: "numeric", month: "short", year: "numeric" },
  );
}

function valueOf(point: KoreaLeveragePoint, metric: KoreaLeverageMetric): number | null {
  return metric === "ratio" ? point.ratio : point.level;
}

function formatMetric(value: number, metric: KoreaLeverageMetric): string {
  return metric === "ratio" ? pct(value) : krw(value);
}

function xForIndex(i: number, n: number): number {
  return PADDING_X + (i / Math.max(n - 1, 1)) * (WIDTH - PADDING_X * 2);
}

function tickIndices(n: number): number[] {
  if (n <= 1) return [0];
  const count = Math.min(TICK_COUNT, n);
  const set = new Set<number>();
  for (let k = 0; k < count; k++) set.add(Math.round((k / (count - 1)) * (n - 1)));
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * The headline pair. Both anchors are shown because they disagree: measured in
 * won the balance sits near its record, and measured against a market
 * capitalisation that has roughly doubled it does not. Showing only one of them
 * would be picking a conclusion rather than reporting the data.
 */
function Anchor({
  label,
  sublabel,
  anchor,
  metric,
  emphasis,
}: {
  label: string;
  sublabel: string;
  anchor: KoreaLeverageAnchor | null;
  metric: KoreaLeverageMetric;
  emphasis: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-semibold tabular-nums text-foreground ${
          emphasis ? "text-3xl" : "text-2xl"
        }`}
      >
        {anchor ? formatMetric(anchor.value, metric) : "—"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {anchor ? (
          <>
            <span className="tabular-nums text-foreground">{ordinal(anchor.percentile)}</span>{" "}
            percentile since {anchor.since}
          </>
        ) : (
          sublabel
        )}
      </p>
      {anchor && (
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          record {formatMetric(anchor.high.value, metric)} · {formatDate(anchor.high.date)} ·{" "}
          <span className={anchor.fromHighPct < 0 ? "text-destructive" : "text-accent"}>
            {anchor.fromHighPct >= 0 ? "+" : "−"}
            {Math.abs(anchor.fromHighPct).toFixed(1)}%
          </span>
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted-foreground" title={label}>
        {label}
      </p>
      <p
        className={`mt-0.5 text-sm font-medium tabular-nums ${
          tone === "warning" ? "text-warning" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {/* Not truncated, unlike the label above it: the forced-sale hint carries
          the 60-day high, which is the whole reason that stat is here, and at
          two columns on a phone `truncate` cut it off mid-word. */}
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function KoreaLeveragePanel({ data }: { data: KoreaLeverageData }) {
  // The ratio needs both market-cap screens, and either can be dropped on its
  // own — by a network failure or by the column guard. When it is missing the
  // panel falls back to the won level rather than defaulting to a metric it
  // cannot draw and showing an empty chart under a populated header.
  const hasRatio = data.ratio !== null;

  const [range, setRange] = useState<KoreaLeverageRange>("5Y");
  const [metric, setMetric] = useState<KoreaLeverageMetric>(hasRatio ? "ratio" : "level");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // The ratio has no value before KOSDAQ market capitalisation starts in Nov 2000, so
  // on MAX the two metrics do not cover the same span. Dropping the empty points
  // rather than zeroing them lets the line simply begin later.
  const points = useMemo(
    () => data.series[range].filter((p) => valueOf(p, metric) !== null),
    [data.series, range, metric],
  );

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => valueOf(p, metric) as number);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const coords = points.map((p, i) => {
      const x = xForIndex(i, points.length);
      const y =
        PADDING_Y + (1 - ((valueOf(p, metric) as number) - min) / span) * (BASELINE_Y - PADDING_Y * 2);
      return [x, y] as const;
    });
    const line = `M${coords.map(([x, y]) => `${x},${y}`).join(" L")}`;
    return {
      min,
      max,
      coords,
      line,
      area: `${line} L${coords[coords.length - 1][0]},${BASELINE_Y} L${coords[0][0]},${BASELINE_Y} Z`,
    };
  }, [points, metric]);

  function handlePointerMove(e: PointerEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const i = Math.round(((svgX - PADDING_X) / (WIDTH - PADDING_X * 2)) * (points.length - 1));
    setHoverIndex(Math.min(Math.max(i, 0), points.length - 1));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (points.length === 0) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHoverIndex((p) => (p === null ? points.length - 1 : Math.max(p - 1, 0)));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setHoverIndex((p) => (p === null ? points.length - 1 : Math.min(p + 1, points.length - 1)));
    } else if (e.key === "Escape") {
      setHoverIndex(null);
    }
  }

  const hoverAt = hoverIndex !== null && hoverIndex < points.length ? hoverIndex : null;
  const hovered = hoverAt !== null ? points[hoverAt] : null;
  const hoveredCoord = hoverAt !== null && geometry ? geometry.coords[hoverAt] : null;

  if (data.unavailable) {
    return (
      <div className="rounded-xl bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Korean Retail Leverage</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          KOFIA FreeSIS did not return data. The panel will fill in on the next hourly refresh.
        </p>
      </div>
    );
  }

  return (
    /* @container, so everything below sizes against the PANEL rather than the
       viewport. This panel now renders at a third of the page width beside the
       placeholder column, where viewport-based breakpoints would still have
       reported "extra large" and kept the stat strip six across inside a 640px
       box. Container queries are core Tailwind v4, no plugin needed. */
    <div className="@container rounded-xl bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Korean Retail Leverage
          <span className="ml-2 font-normal text-muted-foreground">신용거래융자</span>
        </h2>
        <p className="text-xs text-muted-foreground">
          KOFIA FreeSIS · settlement basis · {formatDate(data.asOf)}
        </p>
      </div>

      {/* Flex rather than a two-column grid: on a 1920px display the grid put
          half the panel's width between the two figures that are meant to be
          read against each other. */}
      <div className="flex flex-wrap gap-x-6 gap-y-4 border-b border-border pb-3 @2xl:gap-x-12">
        <Anchor
          label="Margin loans / market cap"
          sublabel="No market-cap data"
          anchor={data.ratio}
          metric="ratio"
          emphasis
        />
        <Anchor
          label="Margin loan balance"
          sublabel="No data"
          anchor={data.level}
          metric="level"
          emphasis={false}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {/* Toggle only when there is something to toggle between. */}
        <div className="flex gap-1" role="group" aria-label="Chart metric">
          {(hasRatio ? METRICS : []).map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setMetric(m.id);
                setHoverIndex(null);
              }}
              aria-pressed={metric === m.id}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                metric === m.id
                  ? "bg-accent text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1" role="group" aria-label="Chart range">
          {KOREA_LEVERAGE_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => {
                setRange(r);
                setHoverIndex(null);
              }}
              aria-pressed={range === r}
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

      {!geometry ? (
        <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
          No data for this range.
        </div>
      ) : (
        <div
          className="relative mt-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          tabIndex={0}
          role="img"
          aria-label={`Line chart of Korean margin loans, ${
            metric === "ratio" ? "as a percentage of market capitalisation" : "in trillions of won"
          }, from ${formatDate(points[0].date)} to ${formatDate(points[points.length - 1].date)}. Use arrow keys to inspect individual points.`}
          onKeyDown={handleKeyDown}
        >
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-52 w-full touch-none"
            preserveAspectRatio="none"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id="korea-leverage-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.25} className="text-accent" />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} className="text-accent" />
              </linearGradient>
            </defs>

            <path d={geometry.area} fill="url(#korea-leverage-fill)" stroke="none" />
            <path
              d={geometry.line}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="text-accent"
            />

            <line
              x1={0}
              y1={BASELINE_Y}
              x2={WIDTH}
              y2={BASELINE_Y}
              stroke="currentColor"
              strokeWidth={1}
              className="text-border"
            />
            {tickIndices(points.length).map((i) => {
              const x = xForIndex(i, points.length);
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
                  hoveredCoord[0] / WIDTH < 0.15
                    ? "0%"
                    : hoveredCoord[0] / WIDTH > 0.85
                      ? "-100%"
                      : "-50%"
                }, -120%)`,
              }}
            >
              <p className="font-semibold tabular-nums text-foreground">
                {formatMetric(valueOf(hovered, metric) as number, metric)}
              </p>
              <p className="text-muted-foreground">{formatDate(hovered.date)}</p>
            </div>
          )}

          {hovered && (
            <span className="sr-only" aria-live="polite">
              {formatDate(hovered.date)}:{" "}
              {formatMetric(valueOf(hovered, metric) as number, metric)}
            </span>
          )}
        </div>
      )}

      {geometry && (
        <div className="relative mt-1 h-4 text-xs text-muted-foreground">
          {tickIndices(points.length).map((i, k) => (
            <span
              key={i}
              // Five "Aug 2026"-width labels need about 300px of run. That fits
              // when the panel has the page to itself, but not at a third of the
              // width, where they overlapped into "Aug 2021Nov 2022". Every
              // other label drops below @xl, leaving first/middle/last — the
              // ends are what the axis is actually read from.
              className={`absolute whitespace-nowrap ${k % 2 === 1 ? "hidden @xl:inline" : ""} ${
                i === 0 ? "" : i === points.length - 1 ? "-translate-x-full" : "-translate-x-1/2"
              }`}
              style={{ left: `${(xForIndex(i, points.length) / WIDTH) * 100}%` }}
            >
              {formatDate(points[i].date, true)}
            </span>
          ))}
        </div>
      )}

      {geometry && (
        <p className="mt-1 text-xs tabular-nums text-muted-foreground">
          Range: {formatMetric(geometry.min, metric)} – {formatMetric(geometry.max, metric)}
        </p>
      )}

      {/* The breakdown. KOSDAQ carries proportionally more leverage than its
          share of the market and tends to unwind first, so the split is kept
          beside the total rather than folded into it. */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3 @lg:grid-cols-3 @4xl:grid-cols-6">
        <Stat label="KOSPI margin" value={krw(data.marginKospi)} />
        <Stat label="KOSDAQ margin" value={krw(data.marginKosdaq)} />
        <Stat
          label="Collateral loans"
          value={krw(data.collateralLoans)}
          hint="예탁증권담보융자"
        />
        <Stat label="Investor deposits" value={krw(data.deposits)} hint="투자자예탁금" />
        <Stat label="Unpaid receivables" value={krw(data.receivables)} hint="위탁매매 미수금" />
        <Stat
          label="Forced sales"
          value={krw(data.forcedSales)}
          // The ratio is the part worth watching: the won amount is small on any
          // ordinary day, and it is the jump in the share of receivables that
          // liquidate which marks a session where leverage actually broke.
          //
          // "prior-day" is load-bearing, not padding. KOFIA's published 비중
          // divides today's forced sales by the PREVIOUS session's receivables —
          // 미수금 arising on D is liquidated on D+1 — which is exactly the
          // figure shown one cell to the left of this one. Tested across the
          // whole history: a one-day lag reproduces KOFIA's own ratio on all
          // 7,176 rows to within rounding, while same-day division disagrees on
          // 57% of them by up to 17pp. Labelling it "of receivables" invited the
          // reader to divide the two numbers on screen and get a third answer.
          hint={
            data.forcedSaleRatio === null
              ? undefined
              : `${data.forcedSaleRatio.toFixed(1)}% of prior-day receivables${
                  data.forcedSaleRatio60dHigh !== null
                    ? ` · 60d high ${data.forcedSaleRatio60dHigh.toFixed(1)}%`
                    : ""
                }`
          }
          tone={
            data.forcedSaleRatio !== null &&
            data.forcedSaleRatio60dHigh !== null &&
            data.forcedSaleRatio >= data.forcedSaleRatio60dHigh
              ? "warning"
              : "default"
          }
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Credit balances to {formatDate(data.asOf)}; deposits and forced sales to{" "}
        {formatDate(data.fundsAsOf)}; market capitalisation to {formatDate(data.marketAsOf)}. KOFIA
        publishes credit on a settlement-date basis, so it trails the index by a session.
      </p>
    </div>
  );
}
