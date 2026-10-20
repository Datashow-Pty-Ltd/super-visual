import type { ClaudeCalculationSpec, ClaudeDashboardRuntime, ClaudeDashboardRuntimeOptions, ClaudeDataState, ClaudeDatasetUpdate, ClaudeFormatOptions, ClaudeLoaderContext, ClaudeLoaderSpec, ClaudeParams, ClaudeParamValue, ClaudeScale, ClaudeSvgAttributes } from "./types";

export const CLAUDE_DASHBOARD_COLORS = ["#3f7f79", "#d69e2e", "#547aa5", "#b56576", "#6b8e23", "#8f6aa8", "#cc6b49", "#5f6b6d"] as const;
const EMPTY_STATE: ClaudeDataState = Object.freeze({ status: "missing", data: [], rows: [], value: [], message: "Dataset is not available.", refreshing: false, meta: [], columns: [] });

function finiteNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}
function numericPair(value: readonly unknown[] | unknown, fallback: readonly [number, number]): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return [...fallback];
  const first = finiteNumber(value[0]);
  const second = finiteNumber(value[1]);
  return Number.isFinite(first) && Number.isFinite(second) ? [first, second] : [...fallback];
}
function linearScale(domain: readonly unknown[], range: readonly unknown[]): ClaudeScale {
  const resolvedDomain = numericPair(domain, [0, 1]);
  const resolvedRange = numericPair(range, [0, 1]);
  const span = resolvedDomain[1] - resolvedDomain[0];
  const flat = span === 0 || !Number.isFinite(span);
  const scale = ((value: unknown): number => {
    const number = finiteNumber(value);
    if (!Number.isFinite(number)) return Number.NaN;
    return flat ? (resolvedRange[0] + resolvedRange[1]) / 2 : resolvedRange[0] + (number - resolvedDomain[0]) / span * (resolvedRange[1] - resolvedRange[0]);
  }) as ClaudeScale;
  scale.invert = (value: number) => flat || resolvedRange[1] === resolvedRange[0] ? resolvedDomain[0] : resolvedDomain[0] + (value - resolvedRange[0]) / (resolvedRange[1] - resolvedRange[0]) * span;
  scale.domain = resolvedDomain;
  scale.range = resolvedRange;
  return scale;
}
function timeValue(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !/^\d{4}-\d{2}/.test(value.trim())) return Number.NaN;
  return Date.parse(value.trim().replace(" ", "T").replace(/ ?UTC$/, "Z"));
}
function timeScale(domain: readonly unknown[], range: readonly unknown[]): ClaudeScale {
  const base = linearScale(domain.length >= 2 ? [timeValue(domain[0]), timeValue(domain[1])] : [], range);
  const scale = ((value: unknown) => base(timeValue(value))) as ClaudeScale;
  scale.invert = base.invert;
  scale.domain = base.domain;
  scale.range = base.range;
  return scale;
}
function bandScale(domain: readonly unknown[], range: readonly unknown[], padding = 0.1): ClaudeScale {
  const resolvedDomain = [...new Set(domain.map(String))];
  const resolvedRange = numericPair(range, [0, 1]);
  const resolvedPadding = Math.min(1, Math.max(0, Number.isFinite(finiteNumber(padding)) ? finiteNumber(padding) : 0.1));
  const step = resolvedDomain.length === 0 ? 0 : (resolvedRange[1] - resolvedRange[0]) / resolvedDomain.length;
  const values = new Map(resolvedDomain.map((value, index) => [value, resolvedRange[0] + step * index + step * resolvedPadding / 2]));
  const scale = ((value: unknown) => values.get(String(value)) ?? Number.NaN) as ClaudeScale;
  scale.bandwidth = Math.abs(step) * (1 - resolvedPadding);
  scale.step = step;
  scale.domain = resolvedDomain;
  scale.range = resolvedRange;
  return scale;
}
function tickIncrement(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value));
  const error = value / power;
  return (error >= Math.sqrt(50) ? 10 : error >= Math.sqrt(10) ? 5 : error >= Math.SQRT2 ? 2 : 1) * power;
}
function ticks(start: unknown, stop: unknown, count: unknown = 5): number[] {
  let first = finiteNumber(start);
  let last = finiteNumber(stop);
  if (!Number.isFinite(first) || !Number.isFinite(last)) [first, last] = [0, 1];
  if (first > last) [first, last] = [last, first];
  if (first === last) [first, last] = first === 0 ? [0, 1] : [Math.min(first, 0), Math.max(last, 0)];
  const resolvedCount = Math.min(100, Math.max(1, Math.round(Number.isFinite(finiteNumber(count)) ? finiteNumber(count) : 5)));
  const step = tickIncrement((last - first) / resolvedCount);
  const base = Math.floor(first / step);
  const length = Math.min(100, Math.max(1, Math.ceil(last / step) - base));
  const precision = Math.min(10, Math.max(0, 1 - Math.floor(Math.log10(step))));
  return Array.from({ length: length + 1 }, (_unused, index) => Number(((base + index) * step).toFixed(precision)));
}
function isPoint(value: unknown): value is readonly [number, number] { return Array.isArray(value) && Number.isFinite(value[0]) && Number.isFinite(value[1]); }
function compactCoordinate(value: number): string { return String(Math.round(value * 100) / 100); }
function linePath(points: readonly unknown[]): string {
  let result = "";
  let connected = false;
  for (const point of points) {
    if (!isPoint(point)) { connected = false; continue; }
    result += `${connected ? "L" : "M"}${compactCoordinate(point[0])},${compactCoordinate(point[1])}`;
    connected = true;
  }
  return result;
}
function areaPath(points: readonly unknown[], baseline: unknown = 0): string {
  const resolved = points.filter(isPoint);
  if (!resolved.length) return "";
  const first = resolved[0]!;
  const last = resolved.at(-1)!;
  const numeric = finiteNumber(baseline);
  const base = Array.isArray(baseline) ? baseline.filter(isPoint) : [[first[0], Number.isFinite(numeric) ? numeric : 0], [last[0], Number.isFinite(numeric) ? numeric : 0]];
  return base.length ? linePath(resolved) + [...base].reverse().map((point) => `L${compactCoordinate(point[0])},${compactCoordinate(point[1])}`).join("") + "Z" : "";
}
function format(value: number, options: ClaudeFormatOptions | ClaudeFormatOptions["style"] = "auto"): string {
  if (!Number.isFinite(value)) return "—";
  const source = typeof options === "string" ? { style: options } : options;
  const style = ["auto", "number", "compact", "percent", "currency"].includes(source.style ?? "auto") ? source.style ?? "auto" : "auto";
  const decimals = source.decimals == null ? null : Math.min(6, Math.max(0, Math.round(source.decimals)));
  const fractionDigits = decimals ?? (style === "currency" ? Math.abs(value) >= 1000 ? 0 : 2 : 2);
  const intlOptions: Intl.NumberFormatOptions = { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits };
  if (style === "compact" || style === "auto" && Math.abs(value) >= 10_000) { intlOptions.notation = "compact"; intlOptions.minimumFractionDigits = decimals ?? 0; intlOptions.maximumFractionDigits = decimals ?? 1; }
  else if (style === "percent") { intlOptions.style = "percent"; intlOptions.minimumFractionDigits = decimals ?? 0; intlOptions.maximumFractionDigits = decimals ?? 1; }
  else if (style === "currency") { intlOptions.style = "currency"; intlOptions.currency = /^[A-Za-z]{3}$/.test(source.currency ?? "") ? source.currency!.toUpperCase() : "USD"; }
  const unit = source.unit?.trim() ?? "";
  return new Intl.NumberFormat(undefined, intlOptions).format(value) + (unit === "" ? "" : unit === "%" ? "%" : `\u00a0${unit}`);
}
function svg(tag: string, attributes: ClaudeSvgAttributes | null = null, ...children: unknown[]): SVGElement {
  const element = document.createElementNS("http://www.w3.org/2000/svg", String(tag));
  for (const [name, value] of Object.entries(attributes ?? {})) if (value !== null && value !== undefined && value !== false) element.setAttribute(name, String(value));
  for (const child of children.flat()) {
    if (child instanceof Node) element.appendChild(child);
    else if (child !== null && child !== undefined && child !== false) element.appendChild(document.createTextNode(String(child)));
  }
  return element;
}
function cloneParams(params: ClaudeParams): ClaudeParams { return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])); }
function validScalar(value: unknown): value is Exclude<ClaudeParamValue, ClaudeParamValue[]> { return value === null || typeof value === "number" && Number.isFinite(value) || typeof value === "boolean" || typeof value === "string" && !/[\r\n]/.test(value); }
function validParam(value: unknown): value is ClaudeParamValue { return validScalar(value) || Array.isArray(value) && value.every(validScalar); }
function inferColumns(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  const first = data.find((row) => row !== null && typeof row === "object" && !Array.isArray(row));
  return first ? Object.keys(first) : [];
}
function normaliseUpdate(update: ClaudeDatasetUpdate, previous?: ClaudeDataState): ClaudeDataState {
  const data = update.data !== undefined ? update.data : previous?.data ?? [];
  return { status: update.status, data, rows: data, value: data, message: update.message ?? (update.status === "missing" ? "Dataset is not available." : ""), refreshing: update.refreshing ?? false, meta: update.meta ?? previous?.meta ?? [], columns: update.columns ?? previous?.columns ?? inferColumns(data) };
}

export function createClaudeDashboardRuntime(options: ClaudeDashboardRuntimeOptions = {}): ClaudeDashboardRuntime {
  const defaults = cloneParams(options.defaults ?? {});
  let params = cloneParams(defaults);
  let width = -1;
  let destroyed = false;
  const states = new Map<string, ClaudeDataState>();
  const callbacks = new Set<() => void>();
  const calculations = new Map<string, ClaudeCalculationSpec>();
  const loaders = new Map<string, ClaudeLoaderSpec>();
  const reads = new Set<string>();
  const notify = (): void => { if (!destroyed) for (const callback of [...callbacks]) callback(); };
  const resolve = (id: string, stack: string[] = []): ClaudeDataState => {
    const direct = states.get(id);
    if (direct) return direct;
    const calculation = calculations.get(id);
    if (!calculation) return EMPTY_STATE;
    if (stack.includes(id)) return normaliseUpdate({ id, status: "error", message: `Calculation loop: ${[...stack, id].join(" -> ")}` });
    const inputs = calculation.inputs.map((input) => resolve(input, [...stack, id]));
    const unavailable = inputs.find((input) => input.status !== "ok");
    if (unavailable) return normaliseUpdate({ id, status: unavailable.status, message: unavailable.message, refreshing: inputs.some((input) => input.refreshing) });
    try {
      const data = calculation.fn(...inputs.map((input) => input.data));
      return { status: "ok", data, rows: data, value: data, message: "", refreshing: inputs.some((input) => input.refreshing), meta: [], columns: inferColumns(data) };
    } catch (error: unknown) { return normaliseUpdate({ id, status: "error", message: error instanceof Error ? error.message : String(error) }); }
  };
  return {
    colors: [...(options.colors ?? CLAUDE_DASHBOARD_COLORS)],
    data<T = unknown>(id: string): ClaudeDataState<T> { if (!reads.has(id)) { reads.add(id); options.bridge?.onDatasetRead?.(id); } return resolve(id) as ClaudeDataState<T>; },
    onData(callback: () => void): () => void { callbacks.add(callback); callback(); return () => callbacks.delete(callback); },
    calc(id: string, spec: ClaudeCalculationSpec): void { if (states.has(id) || calculations.has(id)) throw new Error(`Dataset or calculation "${id}" already exists.`); calculations.set(id, spec); },
    loader(id: string, spec: ClaudeLoaderSpec): void { if (loaders.has(id)) throw new Error(`Loader "${id}" is already registered.`); loaders.set(id, spec); },
    format,
    scale: Object.freeze({ linear: linearScale, band: bandScale, time: timeScale }),
    ticks,
    path: Object.freeze({ line: linePath, area: areaPath }),
    svg,
    refresh(id: string): void { const state = states.get(id); states.set(id, state?.status === "ok" ? { ...state, refreshing: true } : normaliseUpdate({ id, status: "loading" }, state)); notify(); options.bridge?.onRefresh?.(id); },
    params(): ClaudeParams { return cloneParams(params); },
    setParams(changes: Record<string, unknown>): void { const accepted = Object.fromEntries(Object.entries(changes).filter((entry): entry is [string, ClaudeParamValue] => validParam(entry[1]))); if (Object.keys(accepted).length) { params = { ...params, ...accepted }; notify(); options.bridge?.onParamsChanged?.(cloneParams(accepted), cloneParams(params)); } },
    resetParams(): void { const previous = params; params = cloneParams(defaults); const keys = new Set([...Object.keys(previous), ...Object.keys(params)]); const changes = Object.fromEntries([...keys].map((key) => [key, params[key] ?? null])) as ClaudeParams; notify(); options.bridge?.onParamsChanged?.(changes, cloneParams(params)); },
    setLink(name: string): void { options.bridge?.onLinkChanged?.(name); },
    updateDataset(update: ClaudeDatasetUpdate): void { states.set(update.id, normaliseUpdate(update, states.get(update.id))); notify(); },
    updateDatasets(updates: readonly ClaudeDatasetUpdate[]): void { for (const update of updates) states.set(update.id, normaliseUpdate(update, states.get(update.id))); notify(); },
    setWidth(nextWidth: number): void { if (Number.isFinite(nextWidth) && nextWidth >= 0 && nextWidth !== width) { width = nextWidth; notify(); } },
    async runLoader(id: string, context: Omit<ClaudeLoaderContext, "read"> & { read?: ClaudeLoaderContext["read"] }): Promise<ClaudeDataState> { const loader = loaders.get(id); if (!loader) throw new Error(`Loader "${id}" is not registered.`); try { const result = await loader.fn({ ...context, read: context.read ?? {} }); const shaped = result !== null && typeof result === "object" && !Array.isArray(result) ? result as { data?: unknown; rows?: unknown; columns?: string[]; meta?: ClaudeDataState["meta"] } : {}; const state = normaliseUpdate({ id, status: "ok", data: shaped.data ?? shaped.rows ?? result, columns: shaped.columns, meta: shaped.meta }); states.set(id, state); notify(); return state; } catch (error: unknown) { const state = normaliseUpdate({ id, status: "error", message: error instanceof Error ? error.message : String(error) }); states.set(id, state); notify(); return state; } },
    destroy(): void { destroyed = true; callbacks.clear(); states.clear(); calculations.clear(); loaders.clear(); },
  };
}
