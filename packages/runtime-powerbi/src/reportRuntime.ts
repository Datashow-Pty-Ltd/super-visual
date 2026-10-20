import type { ActiveSelections, DashboardModel, DatasetKey, MetricPoint } from "./model.js";

export interface ReportApplicationProps {
  model: DashboardModel;
  selections: ActiveSelections;
  onSelect: (widget: DatasetKey, point: MetricPoint) => void;
  onClear: (widget: DatasetKey) => void;
  onVisibleDatasetsChange?: (datasets: DatasetKey[]) => void;
  initialRoute?: string;
}

export function uniqueDatasetKeys(values: readonly string[]): DatasetKey[] {
  return [...new Set(values.filter(Boolean))] as DatasetKey[];
}
