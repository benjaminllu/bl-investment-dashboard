/**
 * A line, no axes, no labels — the shape of a series next to the number that
 * says where it ended up.
 *
 * Deliberately not a chart. There is no scale, so it cannot be read off; its
 * whole job is to answer "is this a level or a trend, and how did it get here"
 * in the width of a table cell. Anything that needs to be read precisely gets a
 * number beside it instead.
 *
 * `preserveAspectRatio="none"` lets the same 100×28 viewBox stretch to whatever
 * the cell gives it. That distorts the line's slope, which would be wrong on a
 * real chart and is fine here for the same reason: the slope is not being
 * measured, only compared with the one above and below it, and every sparkline
 * in a column is stretched identically.
 */

const W = 100;
const H = 28;
const PAD = 2;

export default function Sparkline({
  values,
  tone = "neutral",
  baseline,
  className = "",
  title,
}: {
  values: number[];
  /** Colour of the line. "auto" takes it from the first-to-last direction. */
  tone?: "neutral" | "accent" | "destructive" | "auto";
  /** Draw a reference line at this value — the level the series is measured against. */
  baseline?: number;
  className?: string;
  title?: string;
}) {
  if (values.length < 2) {
    return <div className={`h-7 ${className}`} aria-hidden="true" />;
  }

  const lo = Math.min(...values, ...(baseline !== undefined ? [baseline] : []));
  const hi = Math.max(...values, ...(baseline !== undefined ? [baseline] : []));
  const range = hi - lo || 1;

  const x = (i: number) => PAD + (i / (values.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - lo) / range) * (H - PAD * 2);

  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");

  const resolved =
    tone === "auto"
      ? values[values.length - 1] >= values[0]
        ? "accent"
        : "destructive"
      : tone;
  const stroke =
    resolved === "accent"
      ? "var(--color-accent)"
      : resolved === "destructive"
        ? "var(--color-destructive)"
        : "var(--color-muted-foreground)";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`h-7 w-full ${className}`}
      role={title ? "img" : "presentation"}
      aria-label={title}
    >
      {baseline !== undefined && (
        <line
          x1={0}
          x2={W}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="var(--color-border)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
