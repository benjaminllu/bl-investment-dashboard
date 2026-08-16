"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationButton from "./NotificationButton";

const NAV_ITEMS = [
  { label: "Home", href: "/" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Research", href: "/research" },
  { label: "AI Summary", href: "/ai-summary" },
  { label: "Macro", href: "/macro" },
  { label: "Positioning", href: "/positioning" },
  { label: "Risk", href: "/risk" },
  { label: "Analytics", href: "/analytics" },
];

/**
 * Portfolio stays in the nav whether or not it is unlocked, and the lock
 * control lives on the page itself rather than here. Hiding the tab would
 * strand you: leave the page while locked and there is no way back to the
 * unlock form short of typing the URL. Keeping it also means this component
 * needs no knowledge of the cookie, which is what lets the root layout stay
 * static — see app/layout.tsx.
 */
export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4">
        <div className="flex items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.map(({ label, href }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 shrink-0 items-center rounded-t px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  active
                    ? "border-b-2 border-accent text-accent"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
        <NotificationButton />
      </div>
    </nav>
  );
}
