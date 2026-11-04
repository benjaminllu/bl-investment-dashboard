// Run: node --test lib/tickerSymbol.test.mjs
// .mjs rather than .ts: importing "./x.ts" needs a tsconfig flag Next does not set.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeListName, normalizeTicker } from "./tickerSymbol.ts";

test("normalizeTicker accepts real symbol shapes", () => {
  assert.equal(normalizeTicker("nvda"), "NVDA");
  assert.equal(normalizeTicker("  aapl "), "AAPL");
  assert.equal(normalizeTicker("BRK.B"), "BRK.B");
  assert.equal(normalizeTicker("brk b"), "BRK.B");
  assert.equal(normalizeTicker("BF-B"), "BF-B");
  assert.equal(normalizeTicker("017670.KS"), "017670.KS");
});

test("normalizeTicker rejects what cannot be a symbol", () => {
  assert.equal(normalizeTicker(""), null);
  assert.equal(normalizeTicker("   "), null);
  assert.equal(normalizeTicker("$CASH"), null);
  assert.equal(normalizeTicker("DPRO 01/15/2027 10.00 C"), null);
  assert.equal(normalizeTicker("NVDA&token=x"), null);
  assert.equal(normalizeTicker(".B"), null);
  assert.equal(normalizeTicker("ABCDEFGHIJKLM"), null);
});

test("normalizeListName bounds free text and reserves All", () => {
  assert.equal(normalizeListName("  AI   Infra "), "AI Infra");
  assert.equal(normalizeListName("I<3MINERS"), "I<3MINERS");
  assert.equal(normalizeListName(""), null);
  assert.equal(normalizeListName("All"), null);
  assert.equal(normalizeListName("x".repeat(41)), null);
});
