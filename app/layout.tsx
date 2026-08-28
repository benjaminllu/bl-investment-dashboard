import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { Suspense } from "react";
import AppShell from "@/components/shell/AppShell";
import TapeServer from "@/components/shell/TapeServer";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Investment Dashboard",
  description: "Personal stock watchlist and investment tracker",
};

/**
 * Deliberately does not read the unlock cookie. Doing so would opt every route
 * into dynamic rendering, and the gate does not need it: the rail shows the same
 * links either way, so only /portfolio itself has to be request-scoped.
 *
 * The shell owns the viewport: h-dvh with one scroll container inside it, rather
 * than a sticky header over a scrolling document. That is what lets a page hand
 * its full remaining height to a table instead of measuring around a header.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} h-full antialiased`}
    >
      <body className="h-full bg-background text-foreground font-sans">
        <AppShell
          tape={
            // Streamed like the old banner was: awaiting the quotes in the
            // layout body would block every route's first byte on them.
            <Suspense
              fallback={
                <div className="flex h-8 items-center gap-4 px-2">
                  <span className="font-serif text-sm italic">Ben&rsquo;s Investment Research</span>
                  <div className="h-3 w-72 animate-pulse rounded bg-muted" />
                </div>
              }
            >
              <TapeServer />
            </Suspense>
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
