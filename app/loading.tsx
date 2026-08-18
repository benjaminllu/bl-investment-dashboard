export default function Loading() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-3xl p-6">
        <div className="flex gap-6 items-start">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-64 animate-pulse rounded-xl bg-card" />
            <div className="h-96 animate-pulse rounded-xl bg-card" />
          </div>
          <div className="w-1/4 shrink-0 space-y-3">
            <div className="h-8 animate-pulse rounded-lg bg-card" />
            <div className="h-[500px] animate-pulse rounded-xl bg-card" />
          </div>
        </div>
      </div>
    </main>
  );
}
