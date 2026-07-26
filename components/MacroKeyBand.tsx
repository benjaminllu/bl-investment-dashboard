import type { FedDotPlot } from "@/lib/fedDotPlot";
import type { MacroKeyDates } from "@/lib/keyDates";
import { nextMajorOptionExpiry } from "@/lib/optionsExpiry";

function formatPct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function formatRange(low: number | null, high: number | null): string {
  if (low === null || high === null) return "—";
  return `${low.toFixed(1)}–${high.toFixed(1)}%`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type Props = {
  dotPlot: FedDotPlot;
  keyDates: MacroKeyDates;
};

export default function MacroKeyBand({ dotPlot, keyDates }: Props) {
  const expiry = nextMajorOptionExpiry();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-4">
        {dotPlot.years.map((y) => (
          <div key={y.year} className="text-center">
            <p className="text-xs text-muted-foreground">{y.year}</p>
            <p className="text-sm font-semibold tabular-nums text-foreground">{formatPct(y.median)}</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatRange(y.rangeLow, y.rangeHigh)}
            </p>
          </div>
        ))}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Longer Run</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {formatPct(dotPlot.longerRun.median)}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatRange(dotPlot.longerRun.rangeLow, dotPlot.longerRun.rangeHigh)}
          </p>
        </div>
      </div>

      <div className="h-6 w-px bg-border" />

      <div className="flex flex-wrap items-center gap-4">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Next FOMC (SEP)</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">{formatDate(keyDates.nextFomc)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Next CPI</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">{formatDate(keyDates.nextCpi)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Next Jobs Report</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {formatDate(keyDates.nextJobsReport)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Next Major Option Expiry</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {expiry.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        </div>
      </div>
    </div>
  );
}
