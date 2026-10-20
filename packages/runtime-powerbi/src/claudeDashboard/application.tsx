import { useEffect, useMemo, useRef, type ReactElement } from "react";
import type { DatasetKey, WidgetStatus } from "../model";
import type { ReportApplicationProps } from "../reportRuntime";
import { materializeClaudeRows, materializedColumns, type ClaudeDatasetBinding } from "./materialize";
import { createClaudeDashboardRuntime } from "./runtime";
import { ClaudeDashboardSurface, type ClaudeDashboardBundle } from "./surface";
import type { ClaudeDataStatus, ClaudeParams } from "./types";

export interface ClaudeDashboardApplicationProps extends ReportApplicationProps { bundle: ClaudeDashboardBundle; bindings: readonly ClaudeDatasetBinding[]; defaultParams?: ClaudeParams; }
function claudeStatus(status: WidgetStatus, hasDataset: boolean): ClaudeDataStatus { if (status === "error") return "error"; return hasDataset ? "ok" : "loading"; }

export function ClaudeDashboardApplication(props: ClaudeDashboardApplicationProps): ReactElement {
  const callbacks = useRef({ onVisibleDatasetsChange: props.onVisibleDatasetsChange, onClaudeParamsChange: props.onClaudeParamsChange, onClaudeRefresh: props.onClaudeRefresh, onClaudeLinkChange: props.onClaudeLinkChange });
  callbacks.current = { onVisibleDatasetsChange: props.onVisibleDatasetsChange, onClaudeParamsChange: props.onClaudeParamsChange, onClaudeRefresh: props.onClaudeRefresh, onClaudeLinkChange: props.onClaudeLinkChange };
  const readDatasets = useRef(new Set<DatasetKey>());
  const runtime = useMemo(() => createClaudeDashboardRuntime({
    defaults: props.defaultParams,
    bridge: {
      onDatasetRead: (id) => { readDatasets.current.add(id); callbacks.current.onVisibleDatasetsChange?.([...readDatasets.current]); },
      onRefresh: (id) => callbacks.current.onClaudeRefresh?.(id),
      onParamsChanged: (changes, allParams) => callbacks.current.onClaudeParamsChange?.(changes, allParams),
      onLinkChanged: (name) => callbacks.current.onClaudeLinkChange?.(name),
    },
  }), []);
  useEffect(() => () => runtime.destroy(), [runtime]);
  useEffect(() => {
    runtime.updateDatasets(props.bindings.map((binding) => {
      const dataset = props.model.datasets[binding.id] ?? null;
      const status = props.model.status[binding.id] ?? "empty";
      return { id: binding.id, status: claudeStatus(status, dataset !== null), data: materializeClaudeRows(dataset, binding), columns: materializedColumns(binding), refreshing: status === "stale" || status === "loading" && dataset !== null, message: status === "error" ? `Power BI could not load ${binding.id}.` : "" };
    }));
  }, [props.bindings, props.model, runtime]);
  return <ClaudeDashboardSurface bundle={props.bundle} runtime={runtime} />;
}
