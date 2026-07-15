type PlaceholderPageProps = {
  title: string;
  description?: string;
};

export default function PlaceholderPage({
  title,
  description = "This page hasn't been built yet — check back soon.",
}: PlaceholderPageProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-2xl p-4">
        <h1 className="mb-4 text-2xl font-bold text-foreground">{title}</h1>
        <div className="rounded-xl bg-card p-4">
          <p className="text-muted-foreground">{description}</p>
        </div>
      </div>
    </main>
  );
}
