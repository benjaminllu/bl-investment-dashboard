// A study is either a bare id (widget defaults apply) or an id plus inputs.
//
// Inputs go HERE rather than through the widget's `studies_overrides` setting.
// That setting is documented and is transmitted correctly, but the free embed
// widget does not honour it: any studies_overrides key silently causes the
// widget to discard the whole `studies` list and drop the top toolbar, and a
// numeric value additionally drops `theme: "dark"`. Verified by rendering each
// preset headless and reading the chart legend — the Momentum preset carried
// `{ "moving average.length": 200 }` and was showing neither the MA nor the
// MACD because of it. Do not reintroduce studies_overrides.
export type ChartStudy =
  | string
  | { id: string; inputs: Record<string, number | string | boolean> };

export interface ChartPreset {
  label: string;
  studies: ChartStudy[];
}

export const CHART_PRESETS: ChartPreset[] = [
  {
    label: "Momentum",
    studies: [
      // Both render in the same blue: MASimple's colour is a style property,
      // and styling is only reachable through studies_overrides, which breaks
      // the widget (see above). They are told apart by the legend and slope.
      { id: "MASimple@tv-basicstudies", inputs: { length: 50 } },
      { id: "MASimple@tv-basicstudies", inputs: { length: 200 } },
      "MACD@tv-basicstudies",
      // NOTE: MACD is written as a bare string here, but TickerChart converts
      // every entry to object form before handing the list to the widget.
      // Mixing the two forms in one array makes the widget silently drop the
      // bare strings — MACD vanished exactly this way during testing.
    ],
  },
  {
    label: "Volatility",
    studies: ["BB@tv-basicstudies", "ATR@tv-basicstudies"],
  },
  {
    label: "Volume",
    studies: ["OBV@tv-basicstudies", "ACCD@tv-basicstudies"],
  },
];
