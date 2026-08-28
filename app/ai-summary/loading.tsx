import PageSkeleton from "@/components/shell/PageSkeleton";

// Overrides the root app/loading.tsx, which is shaped like the home board and
// would otherwise be what every route flashes on the way in.
export default function Loading() {
  return <PageSkeleton rows={2} />;
}
