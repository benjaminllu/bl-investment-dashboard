import type { VixSpreadData } from "@/lib/cboeVix";

function formatValue(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

function formatDate(mmddyyyy: string | null): string {
  if (!mmddyyyy) return "No data";
  const [month, day, year] = mmddyyyy.split("/");
  return new Date(`${year}-${month}-${day}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Delta({ value, previousValue }: { value: number | null; previousValue: number | null }) {
  if (value === null || previousValue === null) return null;
  const delta = value - previousValue;
  return (
    <span
      className={
        delta > 0 ? "text-accent" : delta < 0 ? "text-destructive" : "text-muted-foreground"
      }
    >
      {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}
    </span>
  );
}

// Exported separately rather than as one fragment so the risk page can pair each
// metric card with its own description block in a column.

export function VixCard({ data }: { data: VixSpreadData }) {
  return (
    <div className="flex h-full flex-col rounded-xl bg-card p-4">
      <p className="text-sm font-medium text-muted-foreground">VIX</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
        {formatValue(data.vix.value)}
      </p>
      <div className="mt-1 flex items-center justify-between text-xs tabular-nums">
        <span className="text-muted-foreground">{formatDate(data.vix.date)}</span>
        <Delta value={data.vix.value} previousValue={data.vix.previousValue} />
      </div>
    </div>
  );
}

export function SpreadCard({ data }: { data: VixSpreadData }) {
  return (
    <div className="flex h-full flex-col rounded-xl bg-card p-4">
      <p className="text-sm font-medium text-muted-foreground">VIXEQ − VIX</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
        {data.spread === null ? "—" : `${data.spread >= 0 ? "+" : ""}${data.spread.toFixed(2)}`}
      </p>
      <div className="mt-1 flex items-center justify-between text-xs tabular-nums">
        <span className="text-muted-foreground">{formatDate(data.vixEq.date)}</span>
        <Delta value={data.spread} previousValue={data.previousSpread} />
      </div>

      <div className="mt-3 space-y-1 border-t border-border pt-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">VIXEQ</span>
          <span className="tabular-nums text-foreground">{formatValue(data.vixEq.value)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">VIX</span>
          <span className="tabular-nums text-foreground">{formatValue(data.vix.value)}</span>
        </div>
      </div>
    </div>
  );
}
