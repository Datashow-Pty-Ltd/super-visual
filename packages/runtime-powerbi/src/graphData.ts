import type { WidgetDataset } from "./model.js";

const colors = ["#1f777a", "#e66550", "#39725f", "#f2c23e"];

export function hierarchyFromDataset(dataset: WidgetDataset | null) {
  const rows = [...(dataset?.points ?? [])]
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value) || left.label.localeCompare(right.label))
    .slice(0, 10);
  const nodes = new Map<string, { id: string; label: string; color: string }>();
  const links = new Map<string, { source: string; target: string; value: number }>();
  for (const point of rows) {
    point.dimensions.forEach((dimension, index) => {
      const id = `${index}:${dimension.key}`;
      nodes.set(id, { id, label: dimension.label.length > 26 ? `${dimension.label.slice(0, 25)}…` : dimension.label, color: colors[index % colors.length]! });
      if (index === 0) return;
      const parent = point.dimensions[index - 1]!;
      const source = `${index - 1}:${parent.key}`;
      const linkId = `${source}->${id}`;
      const existing = links.get(linkId);
      if (existing) existing.value += point.value;
      else links.set(linkId, { source, target: id, value: Math.max(1, point.value) });
    });
  }
  return { nodes: [...nodes.values()], links: [...links.values()] };
}

export function flowFromDataset(dataset: WidgetDataset | null) {
  const rows = (dataset?.points ?? [])
    .filter((point) => point.dimensions.length >= 2)
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value) || left.label.localeCompare(right.label))
    .slice(0, 10);
  const nodes = new Map<string, { id: string; label: string; color: string }>();
  const links = rows.map((point) => {
    const sourceDimension = point.dimensions[0]!;
    const targetDimension = point.dimensions[1]!;
    const source = `0:${sourceDimension.key}`;
    const target = `1:${targetDimension.key}`;
    nodes.set(source, { id: source, label: sourceDimension.label, color: colors[0]! });
    nodes.set(target, { id: target, label: targetDimension.label, color: colors[2]! });
    return { source, target, value: Math.max(1, point.value) };
  });
  return { nodes: [...nodes.values()], links };
}
