import type { ActiveSelections, DashboardModel, DatasetKey, MetricPoint } from "./model";
import type { ClaudeParams } from "./claudeDashboard/types";

export interface ReportApplicationProps {
  model: DashboardModel;
  selections: ActiveSelections;
  onSelect: (widget: DatasetKey, point: MetricPoint) => void;
  onClear: (widget: DatasetKey) => void;
  onVisibleDatasetsChange?: (datasets: DatasetKey[]) => void;
  onClaudeParamsChange?: (changes: ClaudeParams, allParams: ClaudeParams) => void;
  onClaudeRefresh?: (dataset: string) => void;
  onClaudeLinkChange?: (name: string) => void;
  initialRoute?: string;
}

export function uniqueDatasetKeys(values: readonly string[]): DatasetKey[] {
  return [...new Set(values.filter(Boolean))] as DatasetKey[];
}
