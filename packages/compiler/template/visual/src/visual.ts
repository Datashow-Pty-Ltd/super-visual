"use strict";

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import powerbi from "powerbi-visuals-api";
import "./../style/visual.less";
import { ReportApplication } from "./reportApplication";
import { buildBrokerAdapter, completeRequestedDatasets } from "./dataView";
import { dependentWidgets } from "./dependency";
import { buildBasicFilter, filterValueFromLabel } from "./filter";
import { FILTER_TARGETS } from "./filterTargets";
import { DATASET_KEYS, emptyDatasets, emptyStatuses, type ActiveSelections, type DashboardModel, type DatasetKey, type MetricPoint, type WidgetStatus } from "./model";

import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

const BROKER_TARGET = { table: "Widget Axis", column: "WidgetId" };
const DATASET_SET = new Set<string>(DATASET_KEYS);

export class Visual implements IVisual {
  private readonly host: IVisualHost;
  private readonly root: Root;
  private readonly datasets = emptyDatasets();
  private readonly status: Record<DatasetKey, WidgetStatus> = emptyStatuses();
  private readonly selections: ActiveSelections = {};
  private visible: DatasetKey[] = [...DATASET_KEYS];
  private context = "";
  private warnings: string[] = [];
  private sequence = 0;

  constructor(options: VisualConstructorOptions | undefined) {
    if (!options) throw new Error("Power BI did not provide visual constructor options");
    this.host = options.host;
    options.element.replaceChildren();
    options.element.dataset.reportScrollRoot = "";
    options.element.style.height = "100%";
    options.element.style.overflowY = "auto";
    this.root = createRoot(options.element);
    this.render();
  }

  update(options: VisualUpdateOptions): void {
    this.sequence += 1;
    this.host.eventService.renderingStarted(options);
    try {
      const adapter = buildBrokerAdapter(options.dataViews, this.host);
      const completed = completeRequestedDatasets(adapter, this.visible);
      for (const key of DATASET_KEYS) {
        if (completed[key]) {
          this.datasets[key] = completed[key]!;
          this.status[key] = "fresh";
        }
      }
      this.context = adapter.context || this.context;
      this.warnings = adapter.warnings;
      this.render();
      this.host.eventService.renderingFinished(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.host.eventService.renderingFailed(options, message);
    }
  }

  destroy(): void { this.root.unmount(); }
  getFormattingModel(): powerbi.visuals.FormattingModel { return { cards: [] }; }

  private request(datasets: DatasetKey[]): void {
    this.visible = [...new Set(datasets)].filter((key) => DATASET_SET.has(key));
    for (const key of this.visible) if (!this.datasets[key]) this.status[key] = "loading";
    const filter = buildBasicFilter(BROKER_TARGET, ...this.visible);
    this.host.applyJsonFilter(filter, "general", "selfFilter", powerbi.FilterAction.merge);
    this.render();
  }

  private select(widget: DatasetKey, point: MetricPoint): void {
    const value = filterValueFromLabel(point.dimensions.at(-1)?.key || point.axisKey);
    this.selections[widget] = { widget, pointKey: point.key, label: point.label, value };
    for (const key of dependentWidgets(widget)) this.status[key] = "stale";
    this.host.applyJsonFilter(buildBasicFilter(FILTER_TARGETS[widget], value), "general", "filter", powerbi.FilterAction.merge);
    this.render();
  }

  private clear(widget: DatasetKey): void {
    delete this.selections[widget];
    this.host.applyJsonFilter(buildBasicFilter(FILTER_TARGETS[widget], this.selections[widget]?.value ?? ""), "general", "filter", powerbi.FilterAction.remove);
    this.render();
  }

  private model(): DashboardModel {
    const rowCounts = Object.fromEntries(DATASET_KEYS.map((key) => [key, this.datasets[key]?.points.length ?? 0])) as Record<DatasetKey, number>;
    const valueSums = Object.fromEntries(DATASET_KEYS.map((key) => [key, this.datasets[key]?.points.reduce((sum, point) => sum + point.value, 0) ?? 0])) as Record<DatasetKey, number>;
    return { datasets: this.datasets, status: this.status, warnings: this.warnings, diagnostics: {
      dataViewCount: 0, updateSequence: this.sequence, dataUpdateSequence: this.sequence, requestSequence: 0,
      receivedWidgets: DATASET_KEYS.filter((key) => Boolean(this.datasets[key])), receivedRowCount: Object.values(rowCounts).reduce((sum, value) => sum + value, 0),
      widgetStatus: this.status, rowCounts, valueSums, selectionCandidates: Object.fromEntries(DATASET_KEYS.map((key) => [key, (this.datasets[key]?.points ?? []).map((point) => ({ key: point.key, label: point.label }))])) as DashboardModel["diagnostics"]["selectionCandidates"],
      activeSelections: Object.fromEntries(Object.entries(this.selections).map(([key, value]) => [key, value?.label ?? ""])), activeRequest: this.visible,
      context: this.context, lastRequestMs: null, events: [],
    } };
  }

  private render(): void {
    this.root.render(createElement(ReportApplication, {
      model: this.model(), selections: this.selections,
      onSelect: (widget: DatasetKey, point: MetricPoint) => this.select(widget, point),
      onClear: (widget: DatasetKey) => this.clear(widget),
      onVisibleDatasetsChange: (datasets: DatasetKey[]) => this.request(datasets),
    }));
  }
}
