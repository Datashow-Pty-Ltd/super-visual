import { DATASET_KEYS, type DatasetKey, type MetricPoint, type WidgetDataset } from "./model";
import { WIDGET_MANIFEST } from "./widgetManifest";

const DATASET_SET = new Set<string>(DATASET_KEYS);
const DIMENSION_SEPARATOR = "\u241f";

export interface BrokerRow {
  WidgetId: unknown;
  AxisKey: unknown;
  Label: unknown;
  Sort: unknown;
  SeriesKey?: unknown;
  SeriesLabel?: unknown;
  WidgetValue: unknown;
  BrokerContext: unknown;
}

export interface BrokerRowsResult {
  datasets: Partial<Record<DatasetKey, WidgetDataset>>;
  context: string;
  receivedWidgets: DatasetKey[];
  receivedRowCount: number;
  warnings: string[];
}

function textValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function datasetKey(value: unknown): DatasetKey | null {
  const key = textValue(value).toLowerCase();
  return DATASET_SET.has(key) ? key as DatasetKey : null;
}

export function materializeBrokerRows(rows: readonly BrokerRow[], colorForLabel: (label: string) => string): BrokerRowsResult {
  const warnings: string[] = [];
  const points = new Map<DatasetKey, MetricPoint[]>();
  let context = "";
  let receivedRowCount = 0;

  for (const row of rows) {
    const key = datasetKey(row.WidgetId);
    if (!key) {
      warnings.push(`Unknown broker WidgetId: ${textValue(row.WidgetId) || "(blank)"}.`);
      continue;
    }
    const value = numberValue(row.WidgetValue);
    if (value === null) continue;
    const axisKey = textValue(row.AxisKey);
    const dimensionKeys = axisKey.split(DIMENSION_SEPARATOR);
    const dimensionLabels = textValue(row.Label).split(DIMENSION_SEPARATOR);
    const dimensions = dimensionKeys.map((dimensionKey, index) => ({ key: dimensionKey, label: dimensionLabels[index] || dimensionKey || "(Blank)" }));
    const label = dimensions.at(-1)?.label || axisKey || "(Blank)";
    const seriesKey = textValue(row.SeriesKey) || "value";
    const seriesLabel = textValue(row.SeriesLabel) || seriesKey || "Widget Value";
    const point: MetricPoint = {
      key: `${key}:${seriesKey}:${axisKey}`,
      axisKey,
      seriesKey,
      seriesLabel,
      label,
      sort: numberValue(row.Sort) ?? 0,
      value,
      color: colorForLabel(label),
      dimensions,
    };
    const widgetPoints = points.get(key) ?? [];
    widgetPoints.push(point);
    points.set(key, widgetPoints);
    receivedRowCount += 1;
    if (!context) context = textValue(row.BrokerContext);
  }

  const datasets: Partial<Record<DatasetKey, WidgetDataset>> = {};
  for (const key of DATASET_KEYS) {
    const widgetPoints = points.get(key);
    if (!widgetPoints) continue;
    widgetPoints.sort(WIDGET_MANIFEST[key]?.order === "axis"
      ? (left, right) => left.sort - right.sort || left.label.localeCompare(right.label)
      : (left, right) => right.value - left.value || left.sort - right.sort || left.label.localeCompare(right.label));
    datasets[key] = {
      key,
      categoryDisplayName: "Label",
      measureDisplayName: [...new Set(widgetPoints.map((point) => point.seriesLabel))].join(" · ") || "Widget Value",
      series: [...new Map(widgetPoints.map((point) => [point.seriesKey, { key: point.seriesKey, label: point.seriesLabel }])).values()],
      points: widgetPoints,
    };
  }
  return { datasets, context, receivedWidgets: DATASET_KEYS.filter((key) => Boolean(datasets[key])), receivedRowCount, warnings };
}
