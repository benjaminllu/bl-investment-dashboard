const DEFAULT_TITLE = "Work in progress — this feature is not finished yet.";

/**
 * Marks a surface as unfinished, so a half-built feature reads as deliberate
 * rather than broken. Deliberately muted: DESIGN.md reserves emerald for
 * "active, positive, or worth your attention", and amber is spent on the
 * pre/after-hours market dot — neither is what "not done yet" means.
 *
 * Sizing and case follow the existing meta-label convention
 * (`uppercase tracking-wide text-muted-foreground`, e.g. the broker label in
 * PortfolioSection) rather than introducing a smaller type step.
 */
export default function WipBadge({
  title = DEFAULT_TITLE,
  className = "",
}: {
  /** Override to say what specifically is unfinished. */
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={`shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground ${className}`}
    >
      <span className="sr-only">Work in progress: </span>
      WIP
    </span>
  );
}
