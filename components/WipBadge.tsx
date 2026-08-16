const DEFAULT_TITLE = "Work in progress — this feature is not finished yet.";

/**
 * Marks a surface as unfinished, so a half-built feature reads as deliberate
 * rather than broken.
 *
 * Alert Amber, which is the token DESIGN.md nominates for a state that is
 * "notable but not good or bad" — unfinished is exactly that. Not emerald,
 * which means active or positive, and not red, which would read as an error.
 * The market-status dot is the only other amber on the site.
 *
 * Sizing and case follow the existing meta-label convention
 * (`uppercase tracking-wide`, e.g. the broker label in PortfolioSection)
 * rather than introducing a smaller type step.
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
      className={`shrink-0 rounded border border-warning/30 bg-warning/15 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-warning ${className}`}
    >
      <span className="sr-only">Work in progress: </span>
      WIP
    </span>
  );
}
