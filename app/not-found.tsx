import Link from "next/link";

export default function NotFound() {
  return (
    // Centred in the shell's content area rather than pinned to the top-left of
    // a padded page. The rail and tape are still there around it, so this reads
    // as one empty room in the app, not as the app having fallen over.
    <main className="flex h-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn&apos;t exist.{" "}
          <Link href="/" className="text-accent hover:underline">
            Go back home
          </Link>
          , or press <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">⌘K</kbd> to jump
          anywhere.
        </p>
      </div>
    </main>
  );
}
