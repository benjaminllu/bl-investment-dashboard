import WipBadge from "./WipBadge";

type Block = {
  label: string;
  description?: string;
};

type PlaceholderBlocksProps = {
  title: string;
  description?: string;
  blocks: Block[];
  columns?: 3 | 4;
};

const GRID_COLS: Record<3 | 4, string> = {
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

function BlockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0 text-muted-foreground"
      aria-hidden="true"
    >
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
    </svg>
  );
}

function PlaceholderCard({ block }: { block: Block }) {
  return (
    <div className="rounded-xl bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{block.label}</h2>
        <BlockIcon />
      </div>
      <p className="text-xs text-muted-foreground">{block.description ?? "Coming soon"}</p>
    </div>
  );
}

/**
 * Just the blocks, without the page chrome around them.
 *
 * Split out so a page that is partly built — Positioning, which pairs a real
 * Korean-leverage panel with blocks that are still empty — can show the
 * remaining stubs in the same shape as a page that is entirely unbuilt, instead
 * of growing a second placeholder style.
 *
 * `stacked` turns the grid into a single full-height column of equal rows, for
 * sitting beside a built panel rather than under one. The row count is the
 * block count, so the column always divides evenly however many are left; that
 * is a runtime value, hence the inline `gridTemplateRows` rather than a
 * `grid-rows-*` utility, which Tailwind can only emit for a literal it sees at
 * build time.
 */
export function PlaceholderGrid({
  blocks,
  columns = 4,
  stacked = false,
}: {
  blocks: Block[];
  columns?: 3 | 4;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div
        className="grid h-full gap-3"
        style={{ gridTemplateRows: `repeat(${blocks.length}, minmax(0, 1fr))` }}
      >
        {blocks.map((block) => (
          <PlaceholderCard key={block.label} block={block} />
        ))}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 gap-3 ${GRID_COLS[columns]}`}>
      {blocks.map((block) => (
        <PlaceholderCard key={block.label} block={block} />
      ))}
    </div>
  );
}

export default function PlaceholderBlocks({
  title,
  description,
  blocks,
  columns = 4,
}: PlaceholderBlocksProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-3xl p-4">
        <div className="mb-4">
          {/* The blocks below carry chart icons and read as real modules that
              failed to load. The badge on the title is what tells you they are
              unbuilt rather than broken. */}
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <WipBadge title={`The ${title} page has not been built yet — the blocks below are empty placeholders.`} />
          </div>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        <PlaceholderGrid blocks={blocks} columns={columns} />
      </div>
    </main>
  );
}
