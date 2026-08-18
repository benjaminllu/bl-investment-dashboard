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

        <div className={`grid grid-cols-1 gap-3 ${GRID_COLS[columns]}`}>
          {blocks.map((block) => (
            <div key={block.label} className="rounded-xl bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">{block.label}</h2>
                <BlockIcon />
              </div>
              <p className="text-xs text-muted-foreground">
                {block.description ?? "Coming soon"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
