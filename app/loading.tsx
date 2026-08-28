/**
 * Mirrors HomeBoard's grid, not the old two-column card page.
 *
 * A skeleton that does not match the layout it precedes is worse than none:
 * the page visibly rearranges itself the moment data lands. Same rows, same
 * columns, same hairline gaps — only the contents are pending.
 */
export default function Loading() {
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_20rem] grid-rows-[21rem_19rem_minmax(0,1fr)] gap-px bg-border">
      <div className="col-span-2 col-start-1 row-start-1 grid grid-cols-[minmax(0,1fr)_13rem] gap-px bg-border">
        <div className="animate-pulse bg-card" />
        <div className="animate-pulse bg-card" />
      </div>

      <div className="col-start-1 row-start-2 grid grid-cols-[minmax(0,1fr)_22rem] gap-px bg-border">
        <div className="animate-pulse bg-card" />
        <div className="animate-pulse bg-card" />
      </div>

      <div className="col-start-2 row-span-2 row-start-2 animate-pulse bg-card" />

      <div className="col-start-1 row-start-3 animate-pulse bg-card" />
    </div>
  );
}
