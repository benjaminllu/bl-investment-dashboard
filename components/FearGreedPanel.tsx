import type { FearGreedIndex } from "@/lib/fearGreed";

function ratingColor(rating: string | null): string {
  if (!rating) return "text-muted-foreground";
  if (rating.includes("fear")) return "text-destructive";
  if (rating.includes("greed")) return "text-accent";
  return "text-warning";
}

function formatScore(score: number | null): string {
  return score === null ? "—" : score.toFixed(0);
}

type Props = {
  data: FearGreedIndex;
};

export default function FearGreedPanel({ data }: Props) {
  const historicals = [
    { label: "Prior Close", value: data.previousClose },
    { label: "1 Week Ago", value: data.previous1Week },
    { label: "1 Month Ago", value: data.previous1Month },
    { label: "1 Year Ago", value: data.previous1Year },
  ];

  return (
    <div className="flex h-full flex-col rounded-xl bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Fear &amp; Greed Index</h2>
        {data.rating && (
          <span className={`text-xs font-medium uppercase tracking-wide ${ratingColor(data.rating)}`}>
            {data.rating}
          </span>
        )}
      </div>

      <p className={`text-4xl font-semibold tabular-nums ${ratingColor(data.rating)}`}>
        {formatScore(data.score)}
      </p>

      <div className="mt-3 grid grid-cols-4 gap-2 border-t border-border pt-3">
        {historicals.map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold tabular-nums text-foreground">{formatScore(value)}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1.5 border-t border-border pt-3">
        {data.components.map((component) => (
          <div key={component.id} className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{component.label}</p>
            <p className={`text-xs font-medium tabular-nums ${ratingColor(component.rating)}`}>
              {formatScore(component.score)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
