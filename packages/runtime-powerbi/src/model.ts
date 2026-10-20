import { DATASET_KEYS, type DatasetKey } from "./datasetRegistry";

export { DATASET_KEYS, type DatasetKey } from "./datasetRegistry";

export type WidgetStatus = "empty" | "fresh" | "stale" | "loading" | "error";

export interface DimensionValue {
  key: string;
  label: string;
}

export interface MetricPoint {
  key: string;
  axisKey: string;
  seriesKey: string;
  seriesLabel: string;
  label: string;
  sort: number;
  value: number;
  color: string;
  dimensions: DimensionValue[];
}

export interface ActiveSelection {
  widget: DatasetKey;
  pointKey: string;
  label: string;
  value: string | number;
}

export type ActiveSelections = Partial<Record<DatasetKey, ActiveSelection>>;

export interface WidgetDataset {
  key: DatasetKey;
  categoryDisplayName: string;
  measureDisplayName: string;
  series: Array<{ key: string; label: string }>;
  points: MetricPoint[];
}

export interface ProductProfileRecord {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  revenue: number;
  growth: number;
  margin: number;
  contribution: number;
}

export interface ProductProfile {
  initialQuery?: string;
  records: ProductProfileRecord[];
  activeProductCount: number;
  grossMargin: number;
  growth: number;
}

export interface BrokerEvent {
  sequence: number;
  kind: "bootstrap" | "external" | "business" | "business-wait" | "widget" | "widget-wait";
  requestedWidgets: DatasetKey[];
  receivedWidgets: DatasetKey[];
  rows: number;
  elapsedMs: number;
  context: string;
}

export interface DashboardDiagnostics {
  dataViewCount: number;
  updateSequence: number;
  dataUpdateSequence: number;
  requestSequence: number;
  receivedWidgets: DatasetKey[];
  receivedRowCount: number;
  widgetStatus: Record<DatasetKey, WidgetStatus>;
  rowCounts: Record<DatasetKey, number>;
  valueSums: Record<DatasetKey, number>;
  selectionCandidates: Record<DatasetKey, Array<{ key: string; label: string }>>;
  activeSelections: Record<DatasetKey, string>;
  activeRequest: DatasetKey[] | null;
  context: string;
  lastRequestMs: number | null;
  events: BrokerEvent[];
}

export interface DashboardModel {
  datasets: Record<DatasetKey, WidgetDataset | null>;
  status: Record<DatasetKey, WidgetStatus>;
  diagnostics: DashboardDiagnostics;
  warnings: string[];
  /**
   * Optional report-specific detail used only by fixture previews. Live report
   * rows are always projected from the governed product broker dataset.
   */
  productProfile?: ProductProfile;
}

export function emptyDatasets(): Record<DatasetKey, WidgetDataset | null> {
  return Object.fromEntries(DATASET_KEYS.map((key) => [key, null])) as Record<DatasetKey, WidgetDataset | null>;
}

export function emptyStatuses(): Record<DatasetKey, WidgetStatus> {
  return Object.fromEntries(DATASET_KEYS.map((key) => [key, "empty"])) as Record<DatasetKey, WidgetStatus>;
}
