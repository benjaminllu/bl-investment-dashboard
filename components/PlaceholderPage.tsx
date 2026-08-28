import WipBadge from "./WipBadge";

type PlaceholderPageProps = {
  title: string;
  description?: string;
};

export default function PlaceholderPage({
  title,
  description = "This page hasn't been built yet — check back soon.",
}: PlaceholderPageProps) {
  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-screen-3xl p-4">
        {/* Unconditional: this component exists only to stand in for a page
            that has not been built, so it is always work in progress. */}
        <div className="mb-4 flex items-center gap-2">
          <h1 className="text-sm font-semibold text-foreground">{title}</h1>
          <WipBadge title={`The ${title} page has not been built yet.`} />
        </div>
        <div className="border border-border bg-card p-4">
          <p className="text-muted-foreground">{description}</p>
        </div>
      </div>
    </main>
  );
}
