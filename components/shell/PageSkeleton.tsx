/**
 * The placeholder a route shows while its server components fetch.
 *
 * Exists so navigation feels immediate. Without a loading boundary, clicking a
 * rail icon leaves you on the old page until the new one's data has landed —
 * which on Macro or Positioning is a second or more of nothing happening, and
 * reads as a dropped click rather than as loading.
 *
 * `rows` should roughly match the destination's shape. It does not have to be
 * exact; it has to avoid the page visibly rearranging itself when data arrives.
 */
export default function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex h-full flex-col gap-3 p-3" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-32 animate-pulse rounded bg-card" />
      <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="animate-pulse border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
