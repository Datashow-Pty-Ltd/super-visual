import powerbi from "powerbi-visuals-api";
import { DATASET_KEYS, type DatasetKey, type WidgetDataset } from "./model";
import { materializeBrokerRows, type BrokerRow } from "./brokerRows";

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

export function buildBrokerAdapter(dataViews: powerbi.DataView[] | undefined, host: powerbi.extensibility.visual.IVisualHost): BrokerAdapterResult {
  host.colorPalette.reset();
  const views = dataViews ?? [];
  const warnings: string[] = [];
  const brokerRows: BrokerRow[] = [];

  for (const dataView of views) {
    const table = dataView.table;
    if (!table) { warnings.push("Power BI returned a non-table DataView to the broker visual."); continue; }
    const columns = table.columns ?? dataView.metadata.columns;
    const indexes = Object.fromEntries(Object.entries(ROLE).map(([name, role]) => [name, roleIndex(columns, role)])) as Record<keyof typeof ROLE, number>;
    const required = ["widgetId", "axisKey", "label", "sort", "value", "context"] as const;
    const missing = required.filter((role) => indexes[role] < 0);
    if (missing.length) { warnings.push(`Broker DataView is missing roles: ${missing.join(", ")}.`); continue; }

    for (const row of table.rows ?? []) brokerRows.push({
      WidgetId: row[indexes.widgetId],
      AxisKey: row[indexes.axisKey],
      Label: row[indexes.label],
      Sort: row[indexes.sort],
      SeriesKey: indexes.seriesKey >= 0 ? row[indexes.seriesKey] : "value",
      SeriesLabel: indexes.seriesLabel >= 0 ? row[indexes.seriesLabel] : columns[indexes.value]?.displayName || "Widget Value",
      WidgetValue: row[indexes.value],
      BrokerContext: row[indexes.context],
    });
  }
  const result = materializeBrokerRows(brokerRows, (label) => host.colorPalette.getColor(label).value);
  return { ...result, dataViewCount: views.length, warnings: [...warnings, ...result.warnings] };
}
