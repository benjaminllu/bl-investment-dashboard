"use client";

import { useState, useEffect } from "react";

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

  return (
    <span className="text-sm text-slate-400">
      {date} &nbsp;•&nbsp; {time}
    </span>
  );
}
