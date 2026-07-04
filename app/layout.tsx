import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import MarketBanner from "@/components/MarketBanner";
import NavBar from "@/components/NavBar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Investment Dashboard",
  description: "Personal stock watchlist and investment tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-white">
        <header className="sticky top-0 z-50 bg-slate-950 shadow-md shadow-black/40">
          <div className="mx-auto max-w-screen-2xl px-6 py-3">
            <Suspense fallback={
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="h-5 w-72 animate-pulse rounded bg-slate-800" />
                <div className="flex flex-wrap items-center gap-6">
                  {["S&P 500", "NASDAQ", "DOW", "Russell 2000", "Gold", "Oil", "Copper"].map((label) => (
                    <div key={label} className="text-center">
                      <p className="text-xs text-slate-400">{label}</p>
                      <div className="mt-1 h-4 w-12 animate-pulse rounded bg-slate-800" />
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
