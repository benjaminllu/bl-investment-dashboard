"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationButton from "./NotificationButton";

const NAV_ITEMS = [
  { label: "Home", href: "/" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Research", href: "/research" },
  { label: "AI Summary", href: "/ai-summary" },
  { label: "Markets", href: "/markets" },
  { label: "Analytics", href: "/analytics" },
];

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
                className={`shrink-0 rounded-t px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
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
