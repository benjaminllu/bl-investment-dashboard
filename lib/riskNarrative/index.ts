// Deterministic interpretation paragraphs for the risk tab.
//
// Each metric has a catalog of 50+ hand-written entries; selection is a pure
// function of statistics computed from history the page already fetches. No
// model call happens on render — the paragraph is looked up, not generated.
//
// Entry counts: Fear & Greed 52, VIX 54, VIXEQ − VIX 53.

export { interpretFearGreed, FEAR_GREED_CATALOG, classifyFgLevel } from "./fearGreed";
export type { FearGreedContext, FgAnchors, FgComponent, FgLevel } from "./fearGreed";

export { interpretVix, VIX_CATALOG, buildVixContext } from "./vix";
export type { VixContext } from "./vix";

export { interpretSpread, SPREAD_CATALOG, buildSpreadContext } from "./spread";
export type { SpreadContext } from "./spread";

export {
  buildVocab,
  classifyPercentileLevel,
  classifyTrend,
  ordinal,
  selectNarrative,
} from "./types";
export type {
  BaseContext,
  Interpretation,
  NarrativeEntry,
  PercentileLevel,
  TrendBucket,
  Vocab,
} from "./types";
