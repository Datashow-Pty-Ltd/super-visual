import powerbi from "powerbi-visuals-api";
import { DATASET_KEYS, type DatasetKey, type MetricPoint, type WidgetDataset } from "./model";
import { WIDGET_MANIFEST } from "./widgetManifest";

const ROLE = {
  widgetId: "widgetId",
  axisKey: "axisKey",
  label: "label",
  sort: "sort",
  seriesKey: "seriesKey",
  seriesLabel: "seriesLabel",
  value: "value",
  context: "context",
} as const;

const DATASET_SET = new Set<string>(DATASET_KEYS);
const DIMENSION_SEPARATOR = "\u241f";

export interface BrokerAdapterResult {
  datasets: Partial<Record<DatasetKey, WidgetDataset>>;
  context: string;
  dataViewCount: number;
  receivedWidgets: DatasetKey[];
  receivedRowCount: number;
  warnings: string[];
}

export function completeRequestedDatasets(adapter: BrokerAdapterResult, requestedWidgets: readonly DatasetKey[]): Partial<Record<DatasetKey, WidgetDataset>> {
  const datasets = { ...adapter.datasets };
  for (const key of requestedWidgets) datasets[key] ??= { key, categoryDisplayName: "Label", measureDisplayName: "Widget Value", series: [], points: [] };
  return datasets;
}

function roleIndex(columns: powerbi.DataViewMetadataColumn[], role: string): number {
  return columns.findIndex((column) => column.roles?.[role] === true);
}

function textValue(value: powerbi.PrimitiveValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function numberValue(value: powerbi.PrimitiveValue | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function datasetKey(value: powerbi.PrimitiveValue | undefined): DatasetKey | null {
  const key = textValue(value).toLowerCase();
  return DATASET_SET.has(key) ? key as DatasetKey : null;
}

export function buildBrokerAdapter(dataViews: powerbi.DataView[] | undefined, host: powerbi.extensibility.visual.IVisualHost): BrokerAdapterResult {
  host.colorPalette.reset();
  const views = dataViews ?? [];
  const warnings: string[] = [];
  const points = new Map<DatasetKey, MetricPoint[]>();
  let context = "";
  let receivedRowCount = 0;

  for (const dataView of views) {
    const table = dataView.table;
    if (!table) { warnings.push("Power BI returned a non-table DataView to the broker visual."); continue; }
    const columns = table.columns ?? dataView.metadata.columns;
    const indexes = Object.fromEntries(Object.entries(ROLE).map(([name, role]) => [name, roleIndex(columns, role)])) as Record<keyof typeof ROLE, number>;
    const required = ["widgetId", "axisKey", "label", "sort", "value", "context"] as const;
    const missing = required.filter((role) => indexes[role] < 0);
    if (missing.length) { warnings.push(`Broker DataView is missing roles: ${missing.join(", ")}.`); continue; }

    for (const row of table.rows ?? []) {
      const key = datasetKey(row[indexes.widgetId]);
      if (!key) { warnings.push(`Unknown broker WidgetId: ${textValue(row[indexes.widgetId]) || "(blank)"}.`); continue; }
      const value = numberValue(row[indexes.value]);
      if (value === null) continue;
      const axisKey = textValue(row[indexes.axisKey]);
      const dimensionKeys = axisKey.split(DIMENSION_SEPARATOR);
      const dimensionLabels = textValue(row[indexes.label]).split(DIMENSION_SEPARATOR);
      const dimensions = dimensionKeys.map((dimensionKey, index) => ({ key: dimensionKey, label: dimensionLabels[index] || dimensionKey || "(Blank)" }));
      const label = dimensions.at(-1)?.label || axisKey || "(Blank)";
      const seriesKey = indexes.seriesKey >= 0 ? textValue(row[indexes.seriesKey]) : "value";
      const seriesLabel = indexes.seriesLabel >= 0 ? textValue(row[indexes.seriesLabel]) || seriesKey || "Widget Value" : columns[indexes.value]?.displayName || "Widget Value";
      const point: MetricPoint = {
        key: `${key}:${seriesKey}:${axisKey}`,
        axisKey,
        seriesKey,
        seriesLabel,
        label,
        sort: numberValue(row[indexes.sort]) ?? 0,
        value,
        color: host.colorPalette.getColor(label).value,
        dimensions,
      };
      const widgetPoints = points.get(key) ?? [];
      widgetPoints.push(point);
      points.set(key, widgetPoints);
      receivedRowCount += 1;
      if (!context) context = textValue(row[indexes.context]);
    }
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
  return { datasets, context, dataViewCount: views.length, receivedWidgets: DATASET_KEYS.filter((key) => Boolean(datasets[key])), receivedRowCount, warnings };
}
