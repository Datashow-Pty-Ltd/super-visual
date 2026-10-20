import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/500.css";
import "@fontsource/source-serif-4/600.css";
import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from "react";
import { MemoryRouter, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ResponsiveBar, type BarCustomLayerProps } from "@nivo/bar";
import { ResponsiveLine, type LineCustomSvgLayerProps } from "@nivo/line";
import { ResponsivePie } from "@nivo/pie";
import { ResponsiveSankey } from "@nivo/sankey";
import { ResponsiveTree } from "@nivo/tree";
import { PAGE_SET_MANIFEST } from "./pageSetManifest";
import type { ActiveSelections, DashboardModel, DatasetKey, MetricPoint, WidgetDataset } from "./model";
import { conciseMeasureLabel, isPercentageMetric } from "./metricSemantics";
import type { ReportApplicationProps } from "./reportRuntime";
import { WIDGET_MANIFEST } from "./widgetManifest";

export type DashboardProps = ReportApplicationProps;

type Primitive = "line" | "bar" | "pie" | "sankey" | "tree" | "small-multiples" | "ranked-table" | "ticker" | "kpi-ledger";
interface Binding { dataset: string; field: string; aggregation: string | null }
interface Theme {
  background: string; surface: string; text: string; mutedText: string; rule: string; accent: string; positive: string; negative: string;
  dataColors: string[]; displayFont: string; bodyFont: string; contentWidth: number | string; density: string;
  typography: { findingMin: number; findingMax: number; sectionTitle: number; kpiValue: number; body: number; chart: number; table: number; metadata: number };
}
interface WidgetSettings {
  orientation: "horizontal" | "vertical" | null;
  curve: "linear" | "monotoneX" | "step" | null;
  showLegend: boolean | null;
  showLabels: boolean | null;
  sort: "ascending" | "descending" | "none" | null;
  limit: number | null;
  emphasis: "area" | "line" | "bars" | "nodes" | "composition" | null;
}
interface Widget { id: string; primitive: Primitive; title: string; subtitle: string | null; dataset: string; layout: { columns: number; minHeight: number }; settings: WidgetSettings }
interface DashboardLineSeries { id: string; data: Array<{ x: string; y: number }> }
interface Page {
  id: string; title: string; eyebrow: string;
  summary: { headline: string; body: string; emphasisBinding: Binding | null };
  search: { placeholder: string; dataset: string; filterTarget: string } | null;
  kpis: Array<{ id: string; label: string; binding: Binding; format: string; comparison: string | null }>;
  widgets: Widget[];
}
interface PageSet {
  contractVersion: 1;
  shell: { id: string; title: string; defaultPage: string; designSystem: { id: string; sha256: string }; governanceLabel: string; locale: string; currencyCode: string; filterContext: ReadonlyArray<{ label: string; visible: boolean; required: boolean; defaultValue: string | number | null }>; navigation: Array<{ page: string; label: string }>; theme: Theme };
  pages: Page[];
  interactions: readonly unknown[];
  designRationale: Record<string, unknown>;
}

export function pageDatasetKeys(page: {
  summary: { emphasisBinding: { dataset: string } | null };
  search: { dataset: string } | null;
  kpis: ReadonlyArray<{ binding: { dataset: string } }>;
  widgets: ReadonlyArray<{ dataset: string }>;
}): DatasetKey[] {
  const candidates = [
    page.summary.emphasisBinding?.dataset,
    page.search?.dataset,
    ...page.kpis.map((kpi) => kpi.binding.dataset),
    ...page.widgets.map((widget) => widget.dataset),
  ];
  return [...new Set(candidates.filter((candidate): candidate is DatasetKey => Boolean(candidate)))] as DatasetKey[];
}

export function isDatasetSelectable(dataset: DatasetKey): boolean {
  return WIDGET_MANIFEST[dataset]?.selectable === true;
}

function VisibleDatasetReporter({ pageSet, onChange }: { pageSet: PageSet; onChange?: (datasets: DatasetKey[]) => void }): null {
  const location = useLocation();
  useEffect(() => {
    if (!onChange) return;
    const pageId = location.pathname.replace(/^\//, "") || pageSet.shell.defaultPage;
    const page = pageSet.pages.find((candidate) => candidate.id === pageId)
      ?? pageSet.pages.find((candidate) => candidate.id === pageSet.shell.defaultPage);
    if (page) onChange(pageDatasetKeys(page));
  }, [location.pathname, onChange, pageSet]);
  return null;
}

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const chartNumberFormat = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

function compact(value: number, format: string, currencyCode: string): string {
  if (format === "currency-compact") return new Intl.NumberFormat(undefined, {
    style: "currency", currency: currencyCode || "USD", notation: "compact", maximumFractionDigits: 1,
  }).format(value);
  if (format === "percent") return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(Math.abs(value) > 1 ? value / 100 : value);
  return chartNumberFormat.format(value);
}

function metricFormat(value: number, ...hints: Array<string | null | undefined>): string {
  return compact(value, isPercentageMetric(...hints) ? "percent" : "number", "");
}

function cssFontStack(value: string, fallbacks: string[]): string {
  const genericFamilies = new Set(["serif", "sans-serif", "monospace", "system-ui", "cursive", "fantasy"]);
  const configured = value.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const unquoted = entry.replace(/^['\"]|['\"]$/g, "");
    return genericFamilies.has(unquoted.toLowerCase()) || !/\s/.test(unquoted) ? unquoted : `"${unquoted}"`;
  });
  return [...configured, ...fallbacks.filter((fallback) => !configured.includes(fallback))].join(", ");
}

function valueFor(dataset: WidgetDataset | null, field: string, aggregation: string | null): number {
  const points = dataset?.points ?? [];
  if (field !== "value") return aggregation === "distinct-count" ? new Set(points.map((point) => point.label)).size : points.length;
  if (!points.length) return 0;
  const total = points.reduce((sum, point) => sum + point.value, 0);
  return aggregation === "average" ? total / points.length : total;
}

function chartTheme(theme: PageSet["shell"]["theme"]) {
  return {
    text: { fill: theme.mutedText, fontFamily: theme.bodyFont, fontSize: theme.typography.chart },
    axis: { domain: { line: { stroke: theme.rule } }, ticks: { line: { stroke: theme.rule }, text: { fill: theme.mutedText } } },
    grid: { line: { stroke: theme.rule, strokeWidth: 1 } },
  };
}

function chartColors(theme: PageSet["shell"]["theme"]): string[] {
  return theme.dataColors;
}

function SelectionControls({ dataset, datasetKey, selections, onSelect, onClear }: {
  dataset: WidgetDataset | null;
  datasetKey: DatasetKey;
  selections: ActiveSelections;
  onSelect: DashboardProps["onSelect"];
  onClear: DashboardProps["onClear"];
}): ReactElement | null {
  const uniquePoints = new Map<string, MetricPoint>();
  for (const point of dataset?.points ?? []) if (!uniquePoints.has(point.axisKey)) uniquePoints.set(point.axisKey, point);
  const points = [...uniquePoints.values()].slice(0, 12);
  if (!points.length) return null;
  return <label className="chart-selection" aria-label="Chart selection">
    <span>Filter by {dataset?.categoryDisplayName ?? "selection"}</span>
    <select data-filter-widget={datasetKey} value={selections[datasetKey]?.pointKey ?? ""} onChange={(event) => {
      const point = points.find((candidate) => candidate.key === event.currentTarget.value);
      if (point) onSelect(datasetKey, point);
      else onClear(datasetKey);
    }}>
      <option value="">All</option>
      {points.map((point) => <option key={point.key} value={point.key}>{pointAxisLabel(point)}</option>)}
    </select>
  </label>;
}

function axisLabel(value: string | number): string {
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}/.exec(text);
  if (date) return text.slice(0, 7);
  if (text.length <= 18) return text;
  const suffix = text.match(/(?:\s|[-_/])(\d{1,3})$/)?.[1];
  return suffix ? `${text.slice(0, 12)}… ${suffix}` : `${text.slice(0, 16)}…`;
}

export function sparseLinearTicks(values: number[]): number[] {
  if (!values.length) return [0];
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  if (minimum === maximum) return [minimum];
  if (minimum < 0 && maximum > 0) {
    const smallerMagnitude = Math.min(Math.abs(minimum), Math.abs(maximum));
    const largerMagnitude = Math.max(Math.abs(minimum), Math.abs(maximum));
    // A tiny signed tail should not create two labels almost on top of the
    // zero baseline. The outlier still has its direct value label.
    if (smallerMagnitude / largerMagnitude < 0.08) {
      return minimum < -maximum
        ? [Number(minimum.toPrecision(4)), 0]
        : [0, Number(maximum.toPrecision(4))];
    }
    return [...new Set([minimum, 0, maximum].map((value) => Number(value.toPrecision(4))))];
  }
  const middle = minimum + ((maximum - minimum) / 2);
  return [...new Set([minimum, middle, maximum].map((value) => Number(value.toPrecision(4))))];
}

export function sparseCategoricalTicks(values: readonly string[], maximumTicks = 6): string[] {
  const unique = [...new Set(values)];
  if (unique.length <= maximumTicks) return unique;
  const lastIndex = unique.length - 1;
  const indexes = new Set<number>([0, lastIndex]);
  for (let index = 1; index < maximumTicks - 1; index += 1) {
    indexes.add(Math.round((index * lastIndex) / (maximumTicks - 1)));
  }
  return [...indexes].sort((left, right) => left - right).map((index) => unique[index]);
}

const MONTH_INDEX = new Map([
  ["jan", 0], ["january", 0], ["feb", 1], ["february", 1], ["mar", 2], ["march", 2],
  ["apr", 3], ["april", 3], ["may", 4], ["jun", 5], ["june", 5], ["jul", 6], ["july", 6],
  ["aug", 7], ["august", 7], ["sep", 8], ["sept", 8], ["september", 8], ["oct", 9],
  ["october", 9], ["nov", 10], ["november", 10], ["dec", 11], ["december", 11],
]);

export function temporalPointOrder(point: Pick<MetricPoint, "axisKey" | "label" | "dimensions">): number | null {
  const candidates = [point.axisKey, point.label, ...point.dimensions.flatMap((dimension) => [dimension.key, dimension.label])];
  for (const candidate of candidates) {
    const iso = /\b(19|20)\d{2}[-/](0?[1-9]|1[0-2])(?:[-/]\d{1,2})?\b/.exec(candidate);
    if (iso) return Number(iso[0].slice(0, 4)) * 12 + Number(iso[2]) - 1;
  }
  const joined = candidates.join(" ");
  const year = /\b((?:19|20)\d{2})\b/.exec(joined);
  const month = joined.toLowerCase().split(/[^a-z]+/).map((token) => MONTH_INDEX.get(token)).find((value) => value !== undefined);
  return year && month !== undefined ? Number(year[1]) * 12 + month : null;
}

export function comparePointsForAxis(left: MetricPoint, right: MetricPoint): number {
  const leftTemporal = temporalPointOrder(left);
  const rightTemporal = temporalPointOrder(right);
  if (leftTemporal !== null && rightTemporal !== null && leftTemporal !== rightTemporal) return leftTemporal - rightTemporal;
  return left.sort - right.sort || left.axisKey.localeCompare(right.axisKey);
}

export function percentageDivisor(values: readonly number[]): number {
  return values.some((value) => Math.abs(value) > 1) ? 100 : 1;
}

function metricFormatter(values: readonly number[], ...hints: Array<string | null | undefined>): (value: number) => string {
  if (!isPercentageMetric(...hints)) return (value) => compact(value, "number", "");
  const divisor = percentageDivisor(values);
  const formatter = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });
  return (value) => formatter.format(value / divisor);
}

function pointAxisLabel(point: MetricPoint): string {
  const hierarchy = point.dimensions.map((dimension) => dimension.label).filter(Boolean);
  return hierarchy.length > 1 ? hierarchy.join(" ") : point.axisKey || point.label;
}

export function rankedRows<T extends Record<string, string | number>>(
  rows: readonly T[],
  keys: readonly string[],
  sort: WidgetSettings["sort"],
  limit: number | null,
  horizontal: boolean,
): T[] {
  const direction = sort === "ascending" ? 1 : sort === "descending" ? -1 : 0;
  const score = (row: T) => keys.reduce((sum, key) => sum + Number(row[key] ?? 0), 0);
  const ranked = direction === 0
    ? [...rows]
    : [...rows].sort((left, right) => direction * (score(left) - score(right)));
  const limited = ranked.slice(0, limit ?? ranked.length);
  // Nivo renders the first datum at the bottom of a horizontal bar chart. The
  // visual order therefore has to be inverted after ranking and limiting.
  return horizontal ? limited.reverse() : limited;
}

function NivoLine({ dataset, theme, settings, subtitle }: { dataset: WidgetDataset; theme: PageSet["shell"]["theme"]; settings: WidgetSettings; subtitle?: string | null }): ReactElement {
  const data: DashboardLineSeries[] = dataset.series.map((series) => ({
    id: conciseMeasureLabel(series.label || series.key),
    data: dataset.points
      .filter((point) => point.seriesKey === series.key)
      .sort(comparePointsForAxis)
      .map((point) => ({ x: pointAxisLabel(point), y: point.value })),
  }));
  const values = dataset.points.map((point) => point.value);
  const formatValue = metricFormatter(values, dataset.measureDisplayName, ...dataset.series.map((series) => series.label));
  const xTickValues = sparseCategoricalTicks(data.flatMap((series) => series.data.map((point) => String(point.x))), 6);
  const yTickValues = sparseLinearTicks(values);
  const endLabels = ({ series }: LineCustomSvgLayerProps<DashboardLineSeries>) => <g aria-hidden="true">{series.map((item, index) => {
    const last = [...item.data].reverse().find((datum) => Number.isFinite(datum.position.x) && Number.isFinite(datum.position.y));
    if (!last) return null;
    return <text key={String(item.id)} x={last.position.x + 10} y={last.position.y + ((index - ((series.length - 1) / 2)) * 14)} dominantBaseline="middle" fill={theme.text} stroke={theme.surface} strokeWidth={4} paintOrder="stroke" fontFamily={theme.bodyFont} fontSize={theme.typography.chart} fontWeight={600}>{String(item.id)}</text>;
  })}</g>;
  const latestPeriod = [...dataset.points].sort(comparePointsForAxis).at(-1);
  const incomplete = /incomplete/i.test(subtitle ?? "");
  return <div className="nivo-chart" data-axis-tick-count={Math.max(xTickValues.length, yTickValues.length)}><ResponsiveLine data={data} margin={{ top: 20, right: data.length > 1 ? 210 : 32, bottom: 52, left: 82 }} colors={chartColors(theme)} curve={settings.curve ?? "monotoneX"} enableArea={settings.emphasis !== "line"} areaOpacity={0.08} enableGridX={false} gridYValues={yTickValues} lineWidth={3} enablePoints={false} useMesh yFormat={formatValue} yScale={{ type: "linear", min: "auto", max: "auto", stacked: false }} axisLeft={{ tickValues: yTickValues, format: formatValue }} axisBottom={{ tickRotation: 0, tickValues: xTickValues, format: axisLabel }} layers={["grid", "markers", "axes", "areas", "crosshair", "lines", "slices", "mesh", endLabels]} theme={chartTheme(theme)} />{incomplete && latestPeriod && <span className="nivo-chart__annotation">Latest accepted period ({axisLabel(pointAxisLabel(latestPeriod))}) is incomplete</span>}</div>;
}

function NivoBar({ dataset, theme, settings }: { dataset: WidgetDataset; theme: PageSet["shell"]["theme"]; settings: WidgetSettings }): ReactElement {
  const horizontal = settings.orientation !== "vertical";
  const labels = new Map(dataset.series.map((series) => [series.key, conciseMeasureLabel(series.label || series.key)]));
  const grouped = new Map<string, Record<string, string | number>>();
  for (const point of dataset.points) {
    const row = grouped.get(point.axisKey) ?? { label: point.label || "Unclassified" };
    row[labels.get(point.seriesKey) ?? point.seriesLabel] = point.value;
    grouped.set(point.axisKey, row);
  }
  const keys = dataset.series.map((series) => conciseMeasureLabel(series.label || series.key));
  const rows = rankedRows([...grouped.values()], keys, settings.sort, settings.limit, horizontal);
  const values = rows.flatMap((row) => keys.map((key) => Number(row[key] ?? 0)));
  const formatValue = metricFormatter(values, dataset.measureDisplayName, ...keys);
  const tickValues = sparseLinearTicks(values);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const showSeriesLegend = Boolean(settings.showLegend && keys.length > 1);
  const seriesPrefix = (key: string) => key.split(/\s+/)[0] ?? key;
  const barValueLabels = ({ bars }: BarCustomLayerProps<Record<string, string | number>>) => <g aria-hidden="true">{bars.map((bar) => {
    const value = Number(bar.data.value);
    // Nivo exposes the negative bar's left edge as x and its zero baseline as
    // x + width. Keep signed labels on the plot side of zero so they never
    // collide with category names in the left gutter.
    const labelX = bar.x + bar.width + 6;
    return <text key={bar.key} x={labelX} y={bar.y + (bar.height / 2)} dominantBaseline="middle" textAnchor="start" fill={theme.text} stroke={theme.surface} strokeWidth={4} paintOrder="stroke" fontFamily={theme.bodyFont} fontSize={theme.typography.chart} fontWeight={600}>{keys.length > 1 ? `${seriesPrefix(String(bar.data.id))} ` : ""}{formatValue(value)}</text>;
  })}</g>;
  return <div className="nivo-chart" data-visible-categories={rows.length} data-axis-tick-count={tickValues.length}>
    {showSeriesLegend && <div className="nivo-chart__legend" aria-label="Series legend">{keys.map((key, index) => <span key={key}><i style={{ background: chartColors(theme)[index % chartColors(theme).length] }} />{key}</span>)}{minimum < 0 && <span><i style={{ background: theme.negative }} />Negative result</span>}</div>}
    <ResponsiveBar data={rows} keys={keys} indexBy="label" groupMode="grouped" layout={horizontal ? "horizontal" : "vertical"} valueScale={{ type: "linear", min: minimum, max: maximum === minimum ? maximum + 1 : maximum, nice: true }} margin={horizontal ? { top: showSeriesLegend ? 48 : 16, right: showSeriesLegend ? 210 : 112, bottom: 38, left: 196 } : { top: 16, right: 24, bottom: 52, left: 68 }} padding={0.28} colors={({ data, id }) => Number(data[String(id)]) < 0 ? theme.negative : chartColors(theme)[keys.indexOf(String(id)) % chartColors(theme).length]} borderRadius={2} enableLabel={false} enableGridY={!horizontal} enableGridX={horizontal} gridXValues={horizontal ? tickValues : undefined} gridYValues={horizontal ? undefined : tickValues} axisLeft={horizontal ? { format: axisLabel } : { tickValues, format: (value) => formatValue(Number(value)) }} axisBottom={horizontal ? { tickValues, format: (value) => formatValue(Number(value)) } : { tickRotation: -25, format: axisLabel }} markers={[{ axis: horizontal ? "x" : "y", value: 0, lineStyle: { stroke: theme.text, strokeWidth: 1 } }]} legends={[]} layers={["grid", "axes", "bars", "markers", ...(settings.showLabels === false ? [] : [barValueLabels])]} theme={chartTheme(theme)} />
  </div>;
}

function NivoPie({ dataset, theme, settings }: { dataset: WidgetDataset; theme: PageSet["shell"]["theme"]; settings: WidgetSettings }): ReactElement {
  const data = dataset.points.slice(0, settings.limit ?? dataset.points.length).map((point) => ({ id: point.label, label: point.label, value: point.value }));
  const formatValue = metricFormatter(data.map((point) => point.value), dataset.measureDisplayName, ...dataset.series.map((series) => conciseMeasureLabel(series.label || series.key)));
  return <ResponsivePie data={data} margin={{ top: 18, right: 100, bottom: 18, left: 100 }} innerRadius={0.58} padAngle={1.2} cornerRadius={2} colors={chartColors(theme)} activeOuterRadiusOffset={6} enableArcLabels={settings.showLabels ?? false} arcLinkLabelsSkipAngle={12} valueFormat={formatValue} theme={chartTheme(theme)} />;
}

function sankeyData(dataset: WidgetDataset) {
  const nodes = new Map<string, { id: string }>();
  const links = new Map<string, { source: string; target: string; value: number }>();
  for (const point of dataset.points) {
    const source = point.dimensions[0]?.label ?? "Portfolio";
    const target = point.dimensions.at(-1)?.label ?? point.label;
    nodes.set(source, { id: source });
    nodes.set(target, { id: target });
    const key = `${source}\u0000${target}`;
    const current = links.get(key) ?? { source, target, value: 0 };
    current.value += Math.max(0, point.value);
    links.set(key, current);
  }
  return { nodes: [...nodes.values()], links: [...links.values()] };
}

function NivoSankey({ dataset, theme }: { dataset: WidgetDataset; theme: PageSet["shell"]["theme"] }): ReactElement {
  return <ResponsiveSankey data={sankeyData(dataset)} margin={{ top: 22, right: 150, bottom: 22, left: 150 }} align="justify" colors={chartColors(theme)} nodeOpacity={1} nodeThickness={10} nodeSpacing={18} linkOpacity={0.22} enableLinkGradient labelTextColor={theme.text} theme={chartTheme(theme)} />;
}

interface TreeNode { id: string; value?: number; children?: TreeNode[] }
function treeData(dataset: WidgetDataset): TreeNode {
  const root: TreeNode = { id: "Portfolio", children: [] };
  for (const point of dataset.points) {
    let cursor = root;
    for (const part of point.dimensions.map((dimension) => dimension.label)) {
      cursor.children ??= [];
      let next = cursor.children.find((child) => child.id === part);
      if (!next) { next = { id: part, children: [] }; cursor.children.push(next); }
      cursor = next;
    }
    cursor.value = (cursor.value ?? 0) + point.value;
  }
  return root;
}

function NivoTree({ dataset, theme }: { dataset: WidgetDataset; theme: PageSet["shell"]["theme"] }): ReactElement {
  return <ResponsiveTree data={treeData(dataset)} identity="id" layout="left-to-right" mode="tree" nodeColor={theme.accent} linkColor={theme.rule} enableLabel label="id" labelsPosition="outward" orientLabel={false} nodeSize={10} activeNodeSize={14} theme={chartTheme(theme)} />;
}

function RankedTable({ dataset, settings }: { dataset: WidgetDataset; settings: WidgetSettings }): ReactElement {
  const direction = settings.sort === "ascending" ? 1 : settings.sort === "none" ? 0 : -1;
  const rows = new Map<string, { label: string; values: Map<string, number> }>();
  for (const point of dataset.points) {
    const row = rows.get(point.axisKey) ?? { label: point.label, values: new Map() };
    row.values.set(point.seriesKey, point.value);
    rows.set(point.axisKey, row);
  }
  const primary = dataset.series[0]?.key ?? "";
  const ordered = [...rows.entries()].sort(([, left], [, right]) => direction * ((left.values.get(primary) ?? 0) - (right.values.get(primary) ?? 0))).slice(0, settings.limit ?? rows.size);
  const singleSeries = dataset.series.length === 1;
  const columns = singleSeries
    ? "42px minmax(180px, .55fr) minmax(320px, 1.45fr)"
    : `42px minmax(150px, 1fr) repeat(${Math.max(1, dataset.series.length)}, minmax(76px, .34fr))`;
  const maxima = new Map(dataset.series.map((series) => [series.key, Math.max(1, ...ordered.map(([, row]) => Math.abs(row.values.get(series.key) ?? 0)))]));
  return <div className={`ranked-table${singleSeries ? " ranked-table--data-bars" : ""}`} role="table"><div className="ranked-head" role="row" style={{ gridTemplateColumns: columns }}><span>Rank</span><span>{dataset.categoryDisplayName}</span>{dataset.series.map((series) => <span className="numeric-cell" key={series.key}>{conciseMeasureLabel(series.label || series.key)}</span>)}</div>{ordered.map(([axisKey, row], index) => <div className="ranked-row" role="row" style={{ gridTemplateColumns: columns }} key={axisKey}><span>{String(index + 1).padStart(2, "0")}</span><strong>{row.label}</strong>{dataset.series.map((series) => { const value = row.values.get(series.key) ?? 0; const width = `${Math.max(2, Math.round(Math.abs(value) / (maxima.get(series.key) ?? 1) * 100))}%`; return <span className={`numeric-cell${value < 0 ? " adverse" : ""}`} key={series.key}>{singleSeries && <i className="table-data-bar" style={{ width }} aria-hidden="true" />}<b>{metricFormat(value, series.label)}</b></span>; })}</div>)}</div>;
}

function SmallMultiples({ dataset, theme, settings }: { dataset: WidgetDataset; theme: PageSet["shell"]["theme"]; settings: WidgetSettings }): ReactElement {
  const groups = new Map<string, MetricPoint[]>();
  for (const point of dataset.points) {
    const group = dataset.series.length > 1 ? conciseMeasureLabel(point.seriesLabel || point.seriesKey) : point.dimensions[0]?.label ?? conciseMeasureLabel(dataset.measureDisplayName);
    groups.set(group, [...(groups.get(group) ?? []), point]);
  }
  const useBars = settings.emphasis === "bars";
  const entries = [...groups.entries()].slice(0, 6);
  const direction = settings.sort === "ascending" ? 1 : settings.sort === "descending" ? -1 : 0;
  const axisSets = entries.map(([, points]) => new Set(points.map((point) => point.axisKey)));
  const hasSharedAxis = axisSets.length > 1 && axisSets.every((set) => set.size === axisSets[0]?.size && [...set].every((key) => axisSets[0]?.has(key)));
  const axisScores = new Map<string, number>();
  for (const [, points] of entries) {
    for (const point of points) axisScores.set(point.axisKey, (axisScores.get(point.axisKey) ?? 0) + point.value);
  }
  const sharedAxisOrder = hasSharedAxis
    ? [...axisSets[0]!].sort((left, right) => direction === 0 ? 0 : direction * ((axisScores.get(left) ?? 0) - (axisScores.get(right) ?? 0))).slice(0, settings.limit ?? axisSets[0]!.size)
    : [];
  const preparedEntries = entries.map(([label, points]) => {
    const pointByAxis = new Map(points.map((point) => [point.axisKey, point]));
    const logicallyOrdered = hasSharedAxis
      ? sharedAxisOrder.map((axisKey) => pointByAxis.get(axisKey)).filter((point): point is MetricPoint => Boolean(point))
      : [...points].sort((left, right) => direction * (left.value - right.value)).slice(0, settings.limit ?? points.length);
    return [label, useBars ? logicallyOrdered.reverse() : logicallyOrdered] as const;
  });
  const sharedValues = preparedEntries.flatMap(([, points]) => points.map((point) => point.value));
  const tickValues = sparseLinearTicks(sharedValues);
  const sharedMinimum = Math.min(0, ...sharedValues);
  const sharedMaximum = Math.max(0, ...sharedValues);
  const layoutClass = entries.length === 4 ? "small-multiples--4" : `small-multiples--${Math.min(3, entries.length)}`;
  return <div className={`small-multiples ${layoutClass}`}>{preparedEntries.map(([label, visiblePoints]) => {
    const formatValue = metricFormatter(sharedValues, label, dataset.measureDisplayName);
    const valueLabels = ({ bars }: BarCustomLayerProps<{ label: string; value: number }>) => <g aria-hidden="true">{bars.map((bar) => {
      const value = Number(bar.data.value);
      const negative = value < 0;
      const barEnd = bar.x + bar.width;
      return <text key={bar.key} x={barEnd + 6} y={bar.y + (bar.height / 2)} dominantBaseline="middle" textAnchor="start" fill={theme.surface} stroke={negative ? theme.negative : theme.text} strokeWidth={3} paintOrder="stroke" fontFamily={theme.bodyFont} fontSize={theme.typography.chart} fontWeight={600}>{formatValue(value)}</text>;
    })}</g>;
    return <div className="small-multiple" key={label} data-visible-categories={visiblePoints.length} data-axis-tick-count={tickValues.length}><strong>{label}</strong><div>{useBars
      ? <ResponsiveBar data={visiblePoints.map((point) => ({ label: point.label, value: point.value }))} keys={["value"]} indexBy="label" layout="horizontal" valueScale={{ type: "linear", min: sharedMinimum, max: sharedMaximum === sharedMinimum ? sharedMaximum + 1 : sharedMaximum, nice: true }} margin={{ top: 8, right: 92, bottom: 42, left: 132 }} padding={0.28} colors={({ data }) => Number(data.value) < 0 ? theme.negative : theme.accent} borderRadius={2} enableLabel={false} enableGridY={false} enableGridX axisLeft={{ format: axisLabel }} axisBottom={{ tickValues, format: (value) => formatValue(Number(value)) }} markers={[{ axis: "x", value: 0, lineStyle: { stroke: theme.text, strokeWidth: 1 } }]} layers={["grid", "axes", "bars", "markers", valueLabels]} theme={chartTheme(theme)} />
      : <ResponsiveLine data={[{ id: label, data: visiblePoints.map((point) => ({ x: point.axisKey, y: point.value })) }]} colors={[theme.accent]} margin={{ top: 14, right: 18, bottom: 56, left: 86 }} enablePoints={false} enableGridX={false} curve={settings.curve ?? "monotoneX"} yFormat={formatValue} yScale={{ type: "linear", min: sharedMinimum, max: sharedMaximum === sharedMinimum ? sharedMaximum + 1 : sharedMaximum, stacked: false }} axisLeft={{ tickValues, format: formatValue }} axisBottom={{ tickValues: sparseCategoricalTicks(visiblePoints.map((point) => point.axisKey), 4), tickRotation: -24, format: axisLabel }} theme={chartTheme(theme)} />}</div></div>;
  })}</div>;
}

function KpiLedger({ dataset }: { dataset: WidgetDataset }): ReactElement {
  const latest = new Map<string, MetricPoint>();
  for (const point of dataset.points) {
    const current = latest.get(point.seriesKey);
    if (!current || point.sort > current.sort) latest.set(point.seriesKey, point);
  }
  const points = [...latest.values()];
  return <div className="kpi-ledger">{points.map((point) => <div key={point.key}><span>{conciseMeasureLabel(point.seriesLabel || point.label)}</span><strong className={point.value < 0 ? "adverse" : undefined}>{metricFormat(point.value, point.seriesLabel, dataset.measureDisplayName)}</strong>{point.seriesLabel && point.label && <small>{point.label}</small>}</div>)}</div>;
}

function renderedWidgetMinHeight(widget: Widget, dataset: WidgetDataset | null): number {
  if (widget.primitive === "kpi-ledger") return Math.min(widget.layout.minHeight, 180);
  if (widget.primitive === "small-multiples" && dataset) {
    const groups = dataset.series.length > 1
      ? dataset.series.length
      : new Set(dataset.points.map((point) => point.dimensions[0]?.label ?? dataset.measureDisplayName)).size;
    const fittedHeight = 96 + (Math.ceil(Math.min(groups, 6) / 3) * 260) + (groups > 3 ? 18 : 0);
    return Math.min(widget.layout.minHeight, fittedHeight);
  }
  if (widget.primitive === "bar" && widget.settings.orientation !== "vertical" && dataset) {
    const visibleCategories = Math.min(
      new Set(dataset.points.map((point) => point.axisKey)).size,
      widget.settings.limit ?? Number.POSITIVE_INFINITY,
    );
    const visibleSeries = Math.max(1, dataset.series.length);
    const collisionSafeHeight = 150 + (visibleCategories * visibleSeries * 21);
    return Math.max(widget.layout.minHeight, collisionSafeHeight);
  }
  if (widget.primitive !== "ranked-table" || !dataset) return widget.layout.minHeight;
  const visibleRows = Math.min(
    new Set(dataset.points.map((point) => point.axisKey)).size,
    widget.settings.limit ?? Number.POSITIVE_INFINITY,
  );
  const fittedTableHeight = 152 + (visibleRows * 42);
  return Math.min(widget.layout.minHeight, fittedTableHeight);
}

function WidgetBody({ widget, dataset, pageSet }: { widget: Widget; dataset: WidgetDataset | null; pageSet: PageSet }): ReactElement {
  if (!dataset) return <div className="empty-state">Waiting for governed data…</div>;
  if (widget.primitive === "line") return <NivoLine dataset={dataset} theme={pageSet.shell.theme} settings={widget.settings} subtitle={widget.subtitle} />;
  if (widget.primitive === "bar") return <NivoBar dataset={dataset} theme={pageSet.shell.theme} settings={widget.settings} />;
  if (widget.primitive === "pie") return <NivoPie dataset={dataset} theme={pageSet.shell.theme} settings={widget.settings} />;
  if (widget.primitive === "sankey") return <NivoSankey dataset={dataset} theme={pageSet.shell.theme} />;
  if (widget.primitive === "tree") return <NivoTree dataset={dataset} theme={pageSet.shell.theme} />;
  if (widget.primitive === "small-multiples") return <SmallMultiples dataset={dataset} theme={pageSet.shell.theme} settings={widget.settings} />;
  if (widget.primitive === "ranked-table") return <RankedTable dataset={dataset} settings={widget.settings} />;
  if (widget.primitive === "ticker") return <div className="ticker-track">{dataset.points.map((point) => <span key={point.key}><strong>{point.label}</strong> {numberFormat.format(point.value)}</span>)}</div>;
  return <KpiLedger dataset={dataset} />;
}

function PageView({ page, pageSet, model, selections, onSelect, onClear }: { page: Page; pageSet: PageSet } & DashboardProps): ReactElement {
  const [query, setQuery] = useState("");
  const ledgerWidgets = page.widgets.filter((widget) => widget.primitive === "kpi-ledger");
  const analyticalWidgets = page.widgets.filter((widget) => widget.primitive !== "kpi-ledger");
  const renderWidget = (widget: Widget) => {
    const datasetKey = widget.dataset as DatasetKey;
    const dataset = model.datasets[datasetKey];
    return <article className="widget" data-widget-id={widget.dataset} data-primitive={widget.primitive} key={widget.id} style={{ gridColumn: `span ${widget.layout.columns}`, minHeight: renderedWidgetMinHeight(widget, dataset) }}>
      <header><div><h2>{widget.title}</h2>{widget.subtitle && <p>{widget.subtitle}</p>}</div><span>{model.status[datasetKey]}</span></header>
      <div className="widget-body"><WidgetBody widget={widget} dataset={dataset} pageSet={pageSet} /></div>
      {isDatasetSelectable(datasetKey) && <SelectionControls dataset={dataset} datasetKey={datasetKey} selections={selections} onSelect={onSelect} onClear={onClear} />}
    </article>;
  };
  return <main className="page-view">
    <section className="page-intro">
      <div><p className="eyebrow">{page.eyebrow}</p><h1>{page.summary.headline}</h1><p className="summary-body">{page.summary.body}</p></div>
      {page.search && <label className="search"><span>Live search</span><input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={page.search.placeholder} /></label>}
    </section>
    {page.kpis.length > 0 && <section className="kpi-strip">{page.kpis.map((kpi) => {
      const dataset = model.datasets[kpi.binding.dataset as DatasetKey];
      return <article key={kpi.id}><span>{kpi.label}</span><strong>{compact(valueFor(dataset, kpi.binding.field, kpi.binding.aggregation), kpi.format, pageSet.shell.currencyCode)}</strong>{kpi.comparison && <small>{kpi.comparison}</small>}</article>;
    })}</section>}
    <section className="widget-grid">
      {ledgerWidgets.length > 0 && <div className="ledger-family">{ledgerWidgets.map(renderWidget)}</div>}
      {analyticalWidgets.map(renderWidget)}
    </section>
  </main>;
}

export function ReportApplication(props: DashboardProps): ReactElement {
  const pageSet = PAGE_SET_MANIFEST as unknown as PageSet;
  const themeStyle = useMemo(() => ({
    "--app-bg": pageSet.shell.theme.background,
    "--surface": pageSet.shell.theme.surface,
    "--text": pageSet.shell.theme.text,
    "--muted": pageSet.shell.theme.mutedText,
    "--rule": pageSet.shell.theme.rule,
    "--accent": pageSet.shell.theme.accent,
    "--positive": pageSet.shell.theme.positive,
    "--negative": pageSet.shell.theme.negative,
    "--display-font": cssFontStack(pageSet.shell.theme.displayFont, ["Georgia", "Times New Roman", "serif"]),
    "--body-font": cssFontStack(pageSet.shell.theme.bodyFont, ["Arial", "sans-serif"]),
    "--content-width": typeof pageSet.shell.theme.contentWidth === "number"
      ? `${pageSet.shell.theme.contentWidth}px`
      : pageSet.shell.theme.contentWidth,
    "--font-finding-min": `${pageSet.shell.theme.typography.findingMin}px`,
    "--font-finding-max": `${pageSet.shell.theme.typography.findingMax}px`,
    "--font-section": `${pageSet.shell.theme.typography.sectionTitle}px`,
    "--font-kpi": `${pageSet.shell.theme.typography.kpiValue}px`,
    "--font-body": `${pageSet.shell.theme.typography.body}px`,
    "--font-chart": `${pageSet.shell.theme.typography.chart}px`,
    "--font-table": `${pageSet.shell.theme.typography.table}px`,
    "--font-metadata": `${pageSet.shell.theme.typography.metadata}px`,
  }) as CSSProperties, [pageSet]);
  const initial = props.initialRoute ?? pageSet.shell.defaultPage;
  return <MemoryRouter initialEntries={[`/${initial}`]}><div className="analytical-app" style={themeStyle}>
    <VisibleDatasetReporter pageSet={pageSet} onChange={props.onVisibleDatasetsChange} />
    <header className="app-header"><strong>{pageSet.shell.title}</strong><nav aria-label="Report pages">{pageSet.shell.navigation.map((item) => <NavLink key={item.page} to={`/${item.page}`}>{item.label}</NavLink>)}</nav><span>{pageSet.shell.governanceLabel}</span></header>
    <div className="filter-context" aria-label="Active report context">{pageSet.shell.filterContext.filter((filter) => filter.visible).map((filter) => <span key={filter.label}><small>Current filter · {filter.label}</small><strong>{filter.defaultValue ?? "All"}</strong></span>)}</div>
    <Routes>{pageSet.pages.map((page) => <Route key={page.id} path={`/${page.id}`} element={<PageView page={page} pageSet={pageSet} {...props} />} />)}<Route path="*" element={<Navigate to={`/${pageSet.shell.defaultPage}`} replace />} /></Routes>
  </div></MemoryRouter>;
}
