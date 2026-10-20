import type { WidgetDataset } from "./model";

function normalizedLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Turn a DAX/broker measure identity into the human label used by charts.
 *
 * The broker keeps fully qualified identities such as
 * `Internet Sales[Total Internet Sales]` for lineage. Nivo uses a datum key as
 * visible tooltip content, so chart mappers must pass this concise form rather
 * than the broker key.
 */
export function conciseMeasureLabel(value: string): string {
  const normalized = normalizedLabel(value);
  const bracketed = /^(?:'[^']+'|[^[]+)\[([^\]]+)\]$/.exec(normalized)
    ?? /^\[([^\]]+)\]$/.exec(normalized);
  if (bracketed) return normalizedLabel(bracketed[1]);
  const dotted = /^(?:'[^']+'|[A-Za-z_][\w ]*)\.([^.]+)$/.exec(normalized);
  return dotted ? normalizedLabel(dotted[1]) : normalized;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Convert common warehouse period keys into labels intended for people. */
export function temporalAxisLabel(value: string): string {
  const normalized = normalizedLabel(value);
  const compactMonth = /^(\d{4})(0[1-9]|1[0-2])$/.exec(normalized);
  if (compactMonth) return `${MONTHS[Number(compactMonth[2]) - 1]} ${compactMonth[1]}`;
  const isoMonth = /^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/.exec(normalized);
  if (isoMonth) return `${MONTHS[Number(isoMonth[2]) - 1]} ${isoMonth[1]}`;
  return normalized;
}

/**
 * Produce a compact category label for each broker axis identity.
 *
 * Broker points deliberately retain their complete dimensional path for
 * lineage, tooltips and filtering. That path is not an axis label. Charts use
 * the leaf dimension and add only its immediate parent when leaf labels would
 * otherwise collide.
 */
export function conciseAxisLabels(points: WidgetDataset["points"]): ReadonlyMap<string, string> {
  const identities = new Map<string, WidgetDataset["points"][number]>();
  for (const point of points) if (!identities.has(point.axisKey)) identities.set(point.axisKey, point);

  const leaves = new Map<string, string>();
  const parents = new Map<string, string>();
  for (const [axisKey, point] of identities) {
    const dimensions = point.dimensions
      .map((dimension) => normalizedLabel(dimension.label))
      .filter(Boolean);
    const leaf = temporalAxisLabel(dimensions.at(-1) ?? normalizedLabel(point.label) ?? normalizedLabel(axisKey));
    leaves.set(axisKey, leaf);
    parents.set(axisKey, dimensions.at(-2) ?? "");
  }

  const collisions = new Map<string, number>();
  for (const leaf of leaves.values()) collisions.set(leaf, (collisions.get(leaf) ?? 0) + 1);

  return new Map([...identities.keys()].map((axisKey) => {
    const leaf = leaves.get(axisKey) ?? axisKey;
    const parent = parents.get(axisKey) ?? "";
    return [axisKey, (collisions.get(leaf) ?? 0) > 1 && parent ? `${leaf} — ${parent}` : leaf];
  }));
}

export function fullDimensionPath(point: WidgetDataset["points"][number]): string {
  return point.dimensions.map((dimension) => normalizedLabel(dimension.label)).filter(Boolean).join(" · ")
    || normalizedLabel(point.label)
    || normalizedLabel(point.axisKey);
}

export function orderedPoints(dataset: WidgetDataset | null, locale = "en"): WidgetDataset["points"] {
  return [...(dataset?.points ?? [])].sort((left, right) =>
    left.sort - right.sort || left.label.localeCompare(right.label, locale, { numeric: true }),
  );
}

export function aggregateKpiValue(values: readonly number[], aggregation?: string | null): number {
  if (values.length === 0) return 0;
  if (aggregation === "latest" || aggregation === "derived") return values.at(-1) ?? 0;
  if (aggregation === "average") return values.reduce((total, item) => total + item, 0) / values.length;
  return values.reduce((total, item) => total + item, 0);
}

export function isPercentageMetric(...hints: Array<string | null | undefined>): boolean {
  return /\b(?:rate|percentage|percent)\b|%/i.test(hints.filter(Boolean).join(" "));
}

export function isCurrencyMetric(...hints: Array<string | null | undefined>): boolean {
  return /\b(?:sales|profit|cost|revenue|amount|discount)\b/i.test(hints.filter(Boolean).join(" "));
}

export function isCountMetric(...hints: Array<string | null | undefined>): boolean {
  return /\b(?:count|quantity|units?|orders?|customers?|products?|employees?|transactions?|rows?)\b/i.test(hints.filter(Boolean).join(" "));
}

/** One formatter for quantitative axes, direct labels and tooltips. */
export function metricValueFormatter(...hints: Array<string | null | undefined>): (value: number) => string {
  const currency = isCurrencyMetric(...hints);
  const percentage = isPercentageMetric(...hints);
  const count = isCountMetric(...hints);
  return (value: number) => {
    if (!Number.isFinite(value)) return "—";
    if (percentage) {
      return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 })
        .format(Math.abs(value) > 1 ? value / 100 : value);
    }
    if (currency) {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
        maximumFractionDigits: Math.abs(value) >= 10_000 ? 1 : 0,
      }).format(value);
    }
    if (count && Math.abs(value) < 10_000) {
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
    }
    return new Intl.NumberFormat(undefined, {
      notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
      maximumFractionDigits: Math.abs(value) >= 10_000 ? 1 : 0,
    }).format(value);
  };
}
