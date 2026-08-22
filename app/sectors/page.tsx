import { fetchSectors } from "@/lib/sectors";
import SectorTable from "@/components/SectorTable";

/**
 * Prices move all day, but this page is about relative standing over weeks and
 * its shortest window is a full session — an hour is finer than the question it
 * answers. The nineteen Yahoo calls behind it carry the same window, so a page
 * rebuild reuses them rather than re-fetching.
 */
export const revalidate = 3600;

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function SectorsPage() {
  const sectors = await fetchSectors();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-3xl space-y-4 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold text-foreground">Sectors</h1>
          <p className="text-xs text-muted-foreground">
            Total return via sector ETFs · Yahoo Finance
            {sectors.asOf ? ` · close ${formatDate(sectors.asOf)}` : ""}
          </p>
        </div>

        <SectorTable data={sectors} />
      </div>
    </main>
  );
}
