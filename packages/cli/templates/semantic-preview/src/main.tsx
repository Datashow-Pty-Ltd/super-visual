import { createElement } from "react";
import { createRoot } from "react-dom/client";
import "../../solution/Visual/style/visual.less";
import { ReportApplication } from "../../solution/Visual/src/reportApplication";
import { materializeBrokerRows } from "../../solution/Visual/src/brokerRows";
import { dependentWidgets } from "../../solution/Visual/src/dependency";
import { filterValueFromLabel } from "../../solution/Visual/src/filter";
import { DATASET_KEYS, emptyDatasets, emptyStatuses, type ActiveSelections, type DashboardModel, type DatasetKey, type MetricPoint, type WidgetStatus } from "../../solution/Visual/src/model";
import type { ClaudeParams } from "../../solution/Visual/src/claudeDashboard/types";
import { PREVIEW_TOKEN } from "./config";

const COLORS = ["#167d6c", "#315d9b", "#cc7a29", "#7b5ea7", "#a94442", "#4f7f52", "#955f75", "#4f788e"];
const DATASET_SET = new Set<string>(DATASET_KEYS);

type Snapshot = {
  status: "loading" | "ready" | "error";
  requestSequence: number;
  receivedWidgets: DatasetKey[];
  receivedRowCount: number;
  rowCounts: Record<DatasetKey, number>;
  activeSelections: Record<string, string>;
  context: string;
  error: string | null;
};

declare global {
  interface Window { __SUPERVISUAL_PREVIEW__: { snapshot: () => Snapshot } }
}

class SemanticPreviewHost {
  private readonly root = createRoot(document.getElementById("root")!);
  private readonly datasets = emptyDatasets();
  private readonly statuses: Record<DatasetKey, WidgetStatus> = emptyStatuses();
  private readonly selections: ActiveSelections = {};
  private readonly parameters: ClaudeParams = {};
  private visible: DatasetKey[] = [...DATASET_KEYS];
  private context = "";
  private warnings: string[] = [];
  private requestSequence = 0;
  private receivedRowCount = 0;
  private error: string | null = null;
  private controller: AbortController | null = null;
  private scheduled: number | null = null;
  private readonly handleSelect = (widget: DatasetKey, point: MetricPoint): void => this.select(widget, point);
  private readonly handleClear = (widget: DatasetKey): void => this.clear(widget);
  private readonly handleVisibleDatasets = (datasets: DatasetKey[]): void => this.schedule(datasets);
  private readonly handleClaudeParams = (changes: ClaudeParams): void => this.applyClaudeParams(changes);
  private readonly handleClaudeRefresh = (): void => this.schedule(this.visible);
  private readonly handleClaudeLink = (): void => undefined;

  constructor() {
    for (const key of DATASET_KEYS) this.statuses[key] = "loading";
    window.__SUPERVISUAL_PREVIEW__ = { snapshot: () => this.snapshot() };
    this.render();
    this.schedule(this.visible);
  }

  private schedule(datasets: DatasetKey[]): void {
    this.visible = [...new Set(datasets)].filter((key) => DATASET_SET.has(key));
    if (this.scheduled !== null) window.clearTimeout(this.scheduled);
    this.scheduled = window.setTimeout(() => { this.scheduled = null; void this.request(); }, 0);
  }

  private async request(): Promise<void> {
    const requested = [...this.visible];
    if (!requested.length) return;
    this.controller?.abort();
    this.controller = new AbortController();
    const sequence = ++this.requestSequence;
    this.error = null;
    for (const key of requested) this.statuses[key] = this.datasets[key] ? "stale" : "loading";
    this.render();
    try {
      const response = await fetch("/__supervisual/query", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Supervisual-Preview-Token": PREVIEW_TOKEN },
        body: JSON.stringify({
          widgets: requested,
          selections: Object.fromEntries(Object.entries(this.selections).map(([key, selection]) => [key, selection?.value])),
          parameters: this.parameters,
        }),
        signal: this.controller.signal,
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || `Semantic preview query failed (${response.status})`);
      if (sequence !== this.requestSequence) return;
      const materialized = materializeBrokerRows(result.rows, (label) => COLORS[Math.abs([...label].reduce((sum, character) => sum + character.charCodeAt(0), 0)) % COLORS.length]);
      for (const key of requested) {
        this.datasets[key] = materialized.datasets[key] ?? { key, categoryDisplayName: "Label", measureDisplayName: "Widget Value", series: [], points: [] };
        this.statuses[key] = "fresh";
      }
      this.context = materialized.context || this.context;
      this.receivedRowCount = materialized.receivedRowCount;
      this.warnings = materialized.warnings;
      this.render();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (sequence !== this.requestSequence) return;
      this.error = error instanceof Error ? error.message : String(error);
      for (const key of requested) this.statuses[key] = "error";
      this.render();
    }
  }

  private select(widget: DatasetKey, point: MetricPoint): void {
    const value = filterValueFromLabel(point.dimensions.at(-1)?.key || point.axisKey);
    this.selections[widget] = { widget, pointKey: point.key, label: point.label, value };
    for (const key of dependentWidgets(widget)) this.statuses[key] = "stale";
    this.schedule(this.visible);
  }

  private clear(widget: DatasetKey): void {
    delete this.selections[widget];
    this.schedule(this.visible);
  }

  private applyClaudeParams(changes: ClaudeParams): void {
    for (const [name, value] of Object.entries(changes)) {
      if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) delete this.parameters[name];
      else this.parameters[name] = value;
    }
    this.schedule(this.visible);
  }

  private snapshot(): Snapshot {
    const rowCounts = Object.fromEntries(DATASET_KEYS.map((key) => [key, this.datasets[key]?.points.length ?? 0])) as Record<DatasetKey, number>;
    return {
      status: this.error ? "error" : this.visible.some((key) => ["loading", "stale"].includes(this.statuses[key])) ? "loading" : "ready",
      requestSequence: this.requestSequence,
      receivedWidgets: DATASET_KEYS.filter((key) => Boolean(this.datasets[key])),
      receivedRowCount: this.receivedRowCount,
      rowCounts,
      activeSelections: Object.fromEntries(Object.entries(this.selections).map(([key, value]) => [key, value?.label ?? ""])),
      context: this.context,
      error: this.error,
    };
  }

  private model(): DashboardModel {
    const snapshot = this.snapshot();
    const valueSums = Object.fromEntries(DATASET_KEYS.map((key) => [key, this.datasets[key]?.points.reduce((sum, point) => sum + point.value, 0) ?? 0])) as Record<DatasetKey, number>;
    return { datasets: this.datasets, status: this.statuses, warnings: [...this.warnings, ...(this.error ? [this.error] : [])], diagnostics: {
      dataViewCount: 0, updateSequence: this.requestSequence, dataUpdateSequence: this.requestSequence, requestSequence: this.requestSequence,
      receivedWidgets: snapshot.receivedWidgets, receivedRowCount: snapshot.receivedRowCount, widgetStatus: this.statuses,
      rowCounts: snapshot.rowCounts, valueSums,
      selectionCandidates: Object.fromEntries(DATASET_KEYS.map((key) => [key, (this.datasets[key]?.points ?? []).map((point) => ({ key: point.key, label: point.label }))])) as DashboardModel["diagnostics"]["selectionCandidates"],
      activeSelections: snapshot.activeSelections, activeRequest: this.visible, context: this.context, lastRequestMs: null, events: [],
    } };
  }

  private render(): void {
    const snapshot = this.snapshot();
    const status = document.getElementById("supervisual-preview-status")!;
    status.dataset.state = snapshot.status;
    status.textContent = snapshot.status === "error" ? `Semantic preview error: ${snapshot.error}` : snapshot.status === "loading" ? "Querying the live semantic model…" : `Live semantic model · ${snapshot.receivedRowCount} broker rows`;
    this.root.render(createElement(ReportApplication, {
      model: this.model(), selections: this.selections,
      onSelect: this.handleSelect,
      onClear: this.handleClear,
      onVisibleDatasetsChange: this.handleVisibleDatasets,
      onClaudeParamsChange: this.handleClaudeParams,
      onClaudeRefresh: this.handleClaudeRefresh,
      onClaudeLinkChange: this.handleClaudeLink,
    }));
  }
}

document.documentElement.style.height = "100%";
document.body.style.cssText = "height:100%;margin:0";
const banner = document.getElementById("supervisual-preview-status")!;
banner.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:7px 10px;border-radius:5px;background:#173c36;color:white;font:12px/1.3 system-ui;box-shadow:0 2px 10px #0003";
new SemanticPreviewHost();
