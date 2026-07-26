// Standard monthly options expiration is the 3rd Friday of any month.
// "Major" expiry (triple/quadruple witching -- stock options, index
// options, and index futures all expiring together) falls on the 3rd
// Friday of March, June, September, and December specifically. Pure date
// math, no external data source, so this never goes stale.
const MAJOR_EXPIRY_MONTHS = [2, 5, 8, 11]; // 0-indexed: Mar, Jun, Sep, Dec

function thirdFriday(year: number, monthIndex: number): Date {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const firstFriday = 1 + ((5 - firstOfMonth.getDay() + 7) % 7);
  return new Date(year, monthIndex, firstFriday + 14);
}

export function nextMajorOptionExpiry(from: Date = new Date()): Date {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  for (let yearOffset = 0; yearOffset <= 1; yearOffset++) {
    const year = from.getFullYear() + yearOffset;
    for (const monthIndex of MAJOR_EXPIRY_MONTHS) {
      const candidate = thirdFriday(year, monthIndex);
      if (candidate >= today) return candidate;
    }
  }

  // Unreachable in practice (the loop above always finds one within a year).
  return thirdFriday(from.getFullYear() + 1, MAJOR_EXPIRY_MONTHS[0]);
}
