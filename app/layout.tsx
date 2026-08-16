import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { Suspense } from "react";
import MarketBanner from "@/components/MarketBanner";
import NavBar from "@/components/NavBar";
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
 * into dynamic rendering, and the gate does not need it: the nav shows the same
 * links either way, so only /portfolio itself has to be request-scoped.
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
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <header className="sticky top-0 z-50 bg-background shadow-md shadow-black/40">
          <div className="mx-auto max-w-screen-2xl px-4 py-2">
            <Suspense fallback={
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="h-5 w-72 animate-pulse rounded bg-muted" />
                <div className="flex flex-wrap items-center gap-4">
                  {["S&P 500", "NASDAQ", "DOW", "Russell 2000", "Gold", "Oil", "Copper"].map((label) => (
                    <div key={label} className="text-center">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <div className="mt-1 h-4 w-12 animate-pulse rounded bg-muted" />
                    </div>
                  ))}
                </div>
              </div>
            }>
              <MarketBanner />
            </Suspense>
          </div>
          <NavBar />
        </header>
        {children}
      </body>
    </html>
  );
}
