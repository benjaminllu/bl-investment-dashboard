"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationButton from "./NotificationButton";

const NAV_ITEMS = [
  { label: "Home", href: "/" },
  { label: "Research", href: "/research" },
  { label: "AI Summary", href: "/ai-summary" },
  { label: "Markets", href: "/markets" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Analytics", href: "/analytics" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="border-t border-slate-800 bg-slate-950">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6">
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map(({ label, href }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-b-2 border-emerald-400 text-emerald-400"
                    : "text-slate-400 hover:text-white"
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
