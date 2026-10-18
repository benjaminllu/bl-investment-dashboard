import { inflateRawSync } from "node:zlib";
import { trimFloats } from "./precision";
import { rankLatest, signed, UNAVAILABLE, type PositioningSource } from "./positioning";

/**
 * FINRA margin statistics, month-end, $ millions.
 *
 * FINRA publishes this only as an Excel file ("data feeds are not available"):
 * finra.org/sites/default/files/2021-03/margin-statistics.xlsx. The folder name
 * is from 2021 but the file is replaced in place each month (last-modified
 * 2026-10-16 when checked) and holds every month since 1997-01, newest first,
 * as `YYYY-MM | debit balances | free credit (cash) | free credit (margin)`.
 * The page's HTML table only shows the last twelve months.
 *
 * An .xlsx is a zip of XML parts. Only one part is needed, so it is read with
 * the ~30-line reader below and Node's own inflate rather than a spreadsheet
 * dependency.
 */
const XLSX_URL = "https://www.finra.org/sites/default/files/2021-03/margin-statistics.xlsx";

/** One entry out of an in-memory zip. Stored or deflated entries only; no zip64, which a 60KB file never needs. */
export function readZipEntry(zip: Buffer, name: string): Buffer | null {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  let p = zip.readUInt32LE(eocd + 16);
  for (let n = zip.readUInt16LE(eocd + 10); n > 0; n--) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(p + 10);
    const compressedSize = zip.readUInt32LE(p + 20);
    const nameLength = zip.readUInt16LE(p + 28);
    const extraLength = zip.readUInt16LE(p + 30);
    const commentLength = zip.readUInt16LE(p + 32);
    const localHeader = zip.readUInt32LE(p + 42);
    if (zip.toString("utf8", p + 46, p + 46 + nameLength) === name) {
      // The local header repeats name and extra, with lengths that may differ from the central copy.
      const start = localHeader + 30 + zip.readUInt16LE(localHeader + 26) + zip.readUInt16LE(localHeader + 28);
      const data = zip.subarray(start, start + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      return null;
    }
    p += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

export interface MarginMonth {
  month: string;
  debit: number;
  freeCash: number;
  freeMargin: number | null;
}

/** Rows out of sheet1.xml, oldest first. Cells are read by column letter, so a missing column D stays null. */
export function parseMarginSheet(xml: string): MarginMonth[] {
  const out: MarginMonth[] = [];
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Record<string, string> = {};
    for (const c of row[1].matchAll(/<c r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)) {
      cells[c[1]] = (c[2].match(/<(?:v|t)>([^<]*)<\/(?:v|t)>/)?.[1] ?? "").trim();
    }
    const debit = Number(cells.B);
    const freeCash = Number(cells.C);
    if (!/^\d{4}-\d{2}$/.test(cells.A ?? "") || !(debit > 0) || !(freeCash > 0)) continue;
    const freeMargin = cells.D ? Number(cells.D) : NaN;
    out.push({ month: cells.A, debit, freeCash, freeMargin: freeMargin > 0 ? freeMargin : null });
  }
  return out.sort((a, b) => a.month.localeCompare(b.month));
}

function monthLabel(ym: string): string {
  return new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function fetchMarginDebt(): Promise<PositioningSource> {
  let months: MarginMonth[];
  try {
    const res = await fetch(XLSX_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      console.error(`[margin] HTTP ${res.status}`);
      return UNAVAILABLE;
    }
    const sheet = readZipEntry(Buffer.from(await res.arrayBuffer()), "xl/worksheets/sheet1.xml");
    if (!sheet) {
      console.error("[margin] sheet1.xml not found in workbook");
      return UNAVAILABLE;
    }
    months = parseMarginSheet(sheet.toString("utf8"));
  } catch (e) {
    console.error("[margin] threw:", e);
    return UNAVAILABLE;
  }
  if (months.length < 36) return UNAVAILABLE;

  // Year-on-year rather than the level: the level rises with the market and
  // sits near a record most of the time, so its percentile says little.
  const yoy = months.slice(12).map((m, i) => ({ date: m.month, value: (m.debit / months[i].debit - 1) * 100 }));
  // Borrowed money against idle cash in the same accounts: scale-free, so 1997
  // and 2026 compare directly.
  const leverage = months
    .filter((m) => m.freeMargin !== null)
    .map((m) => ({ date: m.month, value: m.debit / (m.freeCash + (m.freeMargin as number)) }));

  const last = months[months.length - 1];
  const yLast = yoy[yoy.length - 1];
  const lLast = leverage[leverage.length - 1];

  return trimFloats({
    asOf: monthLabel(last.month),
    unavailable: false,
    readings: [
      {
        id: "margin-yoy",
        label: "Margin debt, year on year",
        value: `${signed(yLast.value)}%`,
        detail: `$${(last.debit / 1e6).toFixed(2)}tn in debit balances`,
        ...rankLatest(yoy),
        history: yoy.slice(-120).map((o) => o.value),
        read: "Growth in money borrowed against securities. Surges past +50% have marked past manias; the first sustained fall after a peak has been the warning.",
      },
      {
        id: "margin-vs-cash",
        label: "Margin debt ÷ free credit",
        value: `${lLast.value.toFixed(2)}×`,
        detail: "debit balances over cash idle in cash and margin accounts",
        ...rankLatest(leverage),
        history: leverage.slice(-120).map((o) => o.value),
        read: "How much investors have borrowed relative to the cash they hold at their brokers. High means leverage is outrunning cash.",
      },
    ],
  });
}
