import { createContext, useContext } from "react";
import type { DashboardMeasure } from "./types";

/** The dashboard's DAX measures and the datasets they may read, for tiles that show a measure. */
export const MeasuresContext = createContext<{ measures: DashboardMeasure[]; datasetIds: string[] }>({ measures: [], datasetIds: [] });
export const useMeasures = () => useContext(MeasuresContext);

/** The measure a DAX tile shows when its expression is just `[Name]`. */
export function measureOf(expression: string | undefined, measures: DashboardMeasure[]): DashboardMeasure | undefined {
  const match = /^\s*\[([^\]]+)\]\s*$/.exec(expression ?? "");
  return match ? measures.find((measure) => measure.name.toLowerCase() === match[1].trim().toLowerCase()) : undefined;
}
