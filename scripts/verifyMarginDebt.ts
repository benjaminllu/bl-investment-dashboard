/**
 * Checks the hand-rolled xlsx reading in lib/marginDebt.ts against FINRA's live
 * workbook and against the twelve-month HTML table on the same FINRA page,
 * which is a second rendering of the same numbers. Exits non-zero on failure.
 *
 *   npx tsc -p tsconfig.verify.json && node .verify-out/scripts/verifyMarginDebt.js
 */
import assert from "node:assert/strict";
import { parseMarginSheet, readZipEntry } from "../lib/marginDebt";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

async function main() {
  const xlsx = Buffer.from(
    await (await fetch("https://www.finra.org/sites/default/files/2021-03/margin-statistics.xlsx", { headers: { "User-Agent": UA } })).arrayBuffer(),
  );
  const sheet = readZipEntry(xlsx, "xl/worksheets/sheet1.xml");
  assert.ok(sheet, "sheet1.xml extracted from the workbook");
  assert.equal(readZipEntry(xlsx, "no/such/entry.xml"), null, "a missing entry returns null");

  const months = parseMarginSheet(sheet.toString("utf8"));
  assert.equal(months[0].month, "1997-01", "history starts January 1997");
  for (let i = 1; i < months.length; i++) {
    const [y, m] = months[i - 1].month.split("-").map(Number);
    const expected = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    assert.equal(months[i].month, expected, `months contiguous at ${months[i].month}`);
    assert.ok(months[i].debit > 0 && months[i].freeCash > 0, `positive balances at ${months[i].month}`);
  }

  // The page's own table, newest row first: "Sep-26 | 1,480,054 | 215,328 | 218,581".
  const html = await (await fetch("https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics", { headers: { "User-Agent": UA } })).text();
  const firstRow = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)][1][1];
  const cells = [...firstRow.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => Number(c[1].replace(/<[^>]+>|,|\s/g, "")));
  const latest = months[months.length - 1];
  assert.deepEqual(
    [latest.debit, latest.freeCash, latest.freeMargin],
    cells.slice(1, 4),
    "newest month matches the HTML table",
  );

  console.log(`verifyMarginDebt: ${months.length} months ${months[0].month} → ${latest.month}, newest matches FINRA's table`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
