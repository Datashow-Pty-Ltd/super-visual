export type ClaudePrimitive = string | number | boolean | null;
export type ClaudeParamValue = ClaudePrimitive | ClaudePrimitive[];
export type ClaudeParams = Record<string, ClaudeParamValue>;
export type ClaudeDataStatus = "ok" | "loading" | "connect" | "declined" | "error" | "missing";

export interface ClaudeMetaEntry { label: string; value: string; type?: "text" | "code"; lang?: string; }
export interface ClaudeDataState<T = unknown> {
  status: ClaudeDataStatus;
  data: T;
  message: string;
  refreshing: boolean;
  meta: ClaudeMetaEntry[];
  columns?: string[];
  rows?: T;
  value?: T;
}
export interface ClaudeDatasetUpdate<T = unknown> {
  id: string;
  status: ClaudeDataStatus;
  data?: T;
  message?: string;
  refreshing?: boolean;
  meta?: ClaudeMetaEntry[];
  columns?: string[];
}
export interface ClaudeCalculationSpec { inputs: string[]; fn: (...inputs: unknown[]) => unknown; title: string; description: string; }
export interface ClaudeLoaderContext {
  answer: unknown;
  args: Record<string, unknown>;
  call: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
  read: Record<string, (answer: unknown) => unknown | Promise<unknown>>;
}
export interface ClaudeLoaderSpec { description: string; fn: (context: ClaudeLoaderContext) => unknown | Promise<unknown>; }
export type ClaudeScale = ((value: unknown) => number) & {
  domain: readonly unknown[];
  range: readonly number[];
  invert?: (value: number) => unknown;
  bandwidth?: number;
  step?: number;
};
export interface ClaudeFormatOptions { style?: "auto" | "number" | "compact" | "percent" | "currency"; decimals?: number | null; currency?: string; unit?: string; }
export interface ClaudeSvgAttributes { [name: string]: string | number | boolean | null | undefined; }
export interface ClaudeDashboardBridge {
  onDatasetRead?: (id: string) => void;
  onRefresh?: (id: string) => void;
  onParamsChanged?: (changes: ClaudeParams, allParams: ClaudeParams) => void;
  onLinkChanged?: (name: string) => void;
}
export interface ClaudeDashApi {
  readonly colors: readonly string[];
  data<T = unknown>(id: string): ClaudeDataState<T>;
  onData(callback: () => void): () => void;
  calc(id: string, spec: ClaudeCalculationSpec): void;
  loader(id: string, spec: ClaudeLoaderSpec): void;
  format(value: number, options?: ClaudeFormatOptions | ClaudeFormatOptions["style"]): string;
  readonly scale: { linear(domain: readonly unknown[], range: readonly unknown[]): ClaudeScale; band(domain: readonly unknown[], range: readonly unknown[], padding?: number): ClaudeScale; time(domain: readonly unknown[], range: readonly unknown[]): ClaudeScale; };
  ticks(start: unknown, stop: unknown, count?: unknown): number[];
  readonly path: { line(points: readonly unknown[]): string; area(points: readonly unknown[], baseline?: unknown): string; };
  svg(tag: string, attributes?: ClaudeSvgAttributes | null, ...children: unknown[]): SVGElement;
  refresh(id: string): void;
  params(): ClaudeParams;
  setParams(changes: Record<string, unknown>): void;
  resetParams(): void;
  setLink(name: string): void;
}
export interface ClaudeDashboardRuntime extends ClaudeDashApi {
  updateDataset<T = unknown>(update: ClaudeDatasetUpdate<T>): void;
  updateDatasets(updates: readonly ClaudeDatasetUpdate[]): void;
  setWidth(width: number): void;
  runLoader(id: string, context: Omit<ClaudeLoaderContext, "read"> & { read?: ClaudeLoaderContext["read"] }): Promise<ClaudeDataState>;
  destroy(): void;
}
export interface ClaudeDashboardRuntimeOptions { defaults?: ClaudeParams; colors?: readonly string[]; bridge?: ClaudeDashboardBridge; }
