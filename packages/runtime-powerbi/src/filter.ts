import powerbi from "powerbi-visuals-api";

export interface FilterTarget {
  table: string;
  column: string;
}

export type FilterValue = string | number | boolean;

export function filterValueFromLabel(label: string): string | number {
  const trimmed = label.trim();
  if (!trimmed) return label;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : label;
}

export interface BasicFilterPayload extends powerbi.IFilter {
  $schema: "https://powerbi.com/product/schema#basic";
  filterType: 1;
  target: FilterTarget;
  operator: "In";
  values: FilterValue[];
}

export function buildBasicFilter(target: FilterTarget, ...values: FilterValue[]): BasicFilterPayload {
  return {
    $schema: "https://powerbi.com/product/schema#basic",
    filterType: 1,
    target,
    operator: "In",
    values,
  };
}

export function filterValues(
  filters: powerbi.IFilter[] | undefined,
  target: FilterTarget,
): FilterValue[] {
  for (const candidate of filters ?? []) {
    const filter = candidate as Partial<BasicFilterPayload>;
    if (filter.$schema === "https://powerbi.com/product/schema#basic"
      && filter.operator === "In"
      && filter.target?.table === target.table
      && filter.target?.column === target.column
      && Array.isArray(filter.values)) {
      return filter.values;
    }
  }
  return [];
}

export function filterContainsValue(
  filters: powerbi.IFilter[] | undefined,
  target: FilterTarget,
  value: FilterValue,
): boolean {
  return filterValues(filters, target).some((item) => item === value);
}
