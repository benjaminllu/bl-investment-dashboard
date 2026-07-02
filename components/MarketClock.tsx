"use client";

import { useState, useEffect } from "react";

type MarketStatus = "open" | "pre" | "after" | "closed";

function getMarketStatus(now: Date): MarketStatus {
  // Convert to ET by re-parsing in that timezone
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return "closed";

  const mins = et.getHours() * 60 + et.getMinutes();
  if (mins < 4 * 60) return "closed";          // before 4:00 AM
  if (mins < 9 * 60 + 30) return "pre";        // 4:00–9:30 AM
  if (mins < 16 * 60) return "open";           // 9:30 AM–4:00 PM
  if (mins < 20 * 60) return "after";          // 4:00–8:00 PM
  return "closed";
}

const STATUS_LABEL: Record<MarketStatus, string> = {
  open: "Open",
  pre: "Pre-Market",
  after: "After Hours",
  closed: "Closed",
};

const STATUS_COLOR: Record<MarketStatus, string> = {
  open: "bg-green-500",
  pre: "bg-yellow-400",
  after: "bg-yellow-400",
  closed: "bg-red-500",
};

export default function MarketClock() {
  const [now, setNow] = useState<Date | null>(null);

// Start a timer when the component loads, update the clock every second, and stop the timer when the component unmounts

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return (
    <span className="invisible text-sm text-slate-400">
      Wednesday, January 01, 2026 &nbsp;•&nbsp; 00:00:00 AM EST
    </span>
  );

// toLocaleDateString and toLocaleTimeString condense this info which is then held under the strings "date" and "time" respectively.
// The timeZone is set to New York time since that's where the stock market is based.

  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });

  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });

  const status = getMarketStatus(now);

  return (
    <div className="flex items-center gap-3">
      <span className="text-base font-bold text-white">
        {date} &nbsp;•&nbsp; {time}
      </span>
      <span className="flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-white">
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[status]}`} />
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}
