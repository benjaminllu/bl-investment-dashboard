export interface ChartPreset {
  label: string;
  studies: string[];
  studiesOverrides?: Record<string, number | string>;
}

export const CHART_PRESETS: ChartPreset[] = [
  {
    label: "Momentum",
    studies: ["MASimple@tv-basicstudies", "MACD@tv-basicstudies"],
    studiesOverrides: { "moving average.length": 200 },
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
