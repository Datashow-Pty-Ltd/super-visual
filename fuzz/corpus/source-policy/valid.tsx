import type { ReportApplicationProps } from "./reportRuntime";
export function ReportApplication({ model, onVisibleDatasetsChange }: ReportApplicationProps) {
  onVisibleDatasetsChange(["sales"]);
  return <main>{model.datasets.sales?.points.length}</main>;
}
