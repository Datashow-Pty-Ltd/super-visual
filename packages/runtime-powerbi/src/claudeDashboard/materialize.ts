import type { MetricPoint, WidgetDataset } from "../model";

export interface ClaudeDimensionBinding { column: string; dimensionIndex: number; use?: "key" | "label"; valueType?: "string" | "number"; }
export interface ClaudeMeasureBinding { column: string; seriesKey: string; }
export interface ClaudeDatasetBinding { id: string; dimensions: ClaudeDimensionBinding[]; measures: ClaudeMeasureBinding[]; includeAxisKeyAs?: string; includeLabelAs?: string; }

function groupKey(point: MetricPoint): string {
  return JSON.stringify({ axisKey: point.axisKey, dimensions: point.dimensions.map((dimension) => dimension.key) });
}

function dimensionValue(source: MetricPoint["dimensions"][number] | undefined, binding: ClaudeDimensionBinding): string | number | null {
  if (!source) return null;
  const value = source[binding.use ?? "label"];
  if (binding.valueType !== "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function materializeClaudeRows(dataset: WidgetDataset | null, binding: ClaudeDatasetBinding): Array<Record<string, string | number | null>> {
  if (!dataset) return [];
  const rows = new Map<string, Record<string, string | number | null>>();
  const measureBySeries = new Map(binding.measures.map((measure) => [measure.seriesKey, measure.column]));
  for (const point of dataset.points) {
    const key = groupKey(point);
    let row = rows.get(key);
    if (!row) {
      row = {};
      for (const dimension of binding.dimensions) row[dimension.column] = dimensionValue(point.dimensions[dimension.dimensionIndex], dimension);
      if (binding.includeAxisKeyAs) row[binding.includeAxisKeyAs] = point.axisKey;
      if (binding.includeLabelAs) row[binding.includeLabelAs] = point.label;
      for (const measure of binding.measures) row[measure.column] = null;
      rows.set(key, row);
    }
    const measureColumn = measureBySeries.get(point.seriesKey) ?? (binding.measures.length === 1 ? binding.measures[0]?.column : undefined);
    if (measureColumn) row[measureColumn] = point.value;
  }
  return [...rows.values()];
}

export function materializedColumns(binding: ClaudeDatasetBinding): string[] {
  return [...binding.dimensions.map((dimension) => dimension.column), ...(binding.includeAxisKeyAs ? [binding.includeAxisKeyAs] : []), ...(binding.includeLabelAs ? [binding.includeLabelAs] : []), ...binding.measures.map((measure) => measure.column)];
}
