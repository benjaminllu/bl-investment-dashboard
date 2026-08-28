"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import NotificationButton from "@/components/NotificationButton";
import { Icon, NAV_ICONS, Rail, type NavItem } from "./parts";

/**
 * The app's chrome: a 52px icon rail and a one-line tape, wrapping every page.
 *
 * Replaces the sticky header this app used to carry — a two-line market banner
 * stacked over a nine-item tab row, about 100px before any content. The rail
 * costs 52px of width instead, which the ten-column watchlist can spare more
 * easily than it could spare the height, and ⌘K makes the destination list
 * something you type at rather than something that has to fit on one line.
 *
 * The rail holds the same nine destinations the tab row did. Nothing was
 * removed; only how you reach them changed.
 */

const NAV: NavItem[] = [
  { label: "Home", href: "/", icon: "home" },
  { label: "Portfolio", href: "/portfolio", icon: "brief" },
  { label: "Research", href: "/research", icon: "doc" },
  { label: "AI Summary", href: "/ai-summary", icon: "spark" },
  { label: "Macro", href: "/macro", icon: "line" },
  { label: "Sectors", href: "/sectors", icon: "grid" },
  { label: "Positioning", href: "/positioning", icon: "compass" },
  { label: "Risk", href: "/risk", icon: "shield" },
  { label: "Analytics", href: "/analytics", icon: "bars" },
];

export default function AppShell({
  tape,
  children,
}: {
  tape: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  const openPalette = useCallback(() => {
    setQuery("");
    dialogRef.current?.showModal();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialogRef.current?.open) dialogRef.current.close();
        else openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette]);

  // Pages only. The root layout has no watchlist to search, and fetching one
  // here would make every route pay for it — so ticker search stays on the
  // screens that already hold the data.
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? NAV.filter((n) => n.label.toLowerCase().includes(q)) : NAV;
  }, [query]);

  const go = (href: string) => {
    dialogRef.current?.close();
    router.push(href);
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Rail items={NAV} activeHref={pathname} onSearch={openPalette} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center border-b border-border">
          <div className="min-w-0 flex-1">{tape}</div>
          <div className="shrink-0 px-2">
            <NotificationButton />
          </div>
        </div>

        {/* The one scroll container. Pages inside it size to h-full and manage
            their own scrolling, or simply overflow and scroll here. */}
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setQuery("")}
        className="mt-[12vh] w-[min(30rem,92vw)] rounded-xl bg-card p-0 text-foreground backdrop:bg-black/60"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) {
              e.preventDefault();
              go(hits[0].href);
            }
          }}
          placeholder="Go to…"
          aria-label="Go to a page"
          className="w-full bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none"
        />
        <div className="max-h-80 overflow-auto py-1">
          {hits.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              No page matches “{query}”.
            </p>
          ) : (
            hits.map((n) => (
              <button
                key={n.href}
                type="button"
                onClick={() => go(n.href)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
              >
                <Icon path={NAV_ICONS[n.icon]} className="h-4 w-4 text-muted-foreground" />
                {n.label}
              </button>
            ))
          )}
        </div>
      </dialog>
    </div>
  );
}
