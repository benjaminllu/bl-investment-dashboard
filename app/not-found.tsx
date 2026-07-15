import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-2xl p-4">
        <h1 className="mb-4 text-2xl font-bold text-foreground">Page not found</h1>
        <div className="rounded-xl bg-card p-4">
          <p className="text-muted-foreground">
            This page doesn&apos;t exist.{" "}
            <Link href="/" className="text-accent hover:underline">
              Go back home
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
