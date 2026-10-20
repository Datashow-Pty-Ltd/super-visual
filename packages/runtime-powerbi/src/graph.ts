export interface DirectedGraph {
  nodes: Array<{ id: string }>;
  links: Array<{ source: string; target: string }>;
}

export function validateDirectedGraph(graph: DirectedGraph): string[] {
  const errors: string[] = [];
  const nodeIds = graph.nodes.map((node) => node.id);
  const nodeSet = new Set(nodeIds);
  if (nodeSet.size !== nodeIds.length) errors.push("graph node ids must be unique");

  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  for (const link of graph.links) {
    if (!nodeSet.has(link.source)) errors.push(`missing source node ${link.source}`);
    if (!nodeSet.has(link.target)) errors.push(`missing target node ${link.target}`);
    if (link.source === link.target) errors.push(`self link ${link.source}`);
    if (!nodeSet.has(link.source) || !nodeSet.has(link.target) || link.source === link.target) continue;
    const targets = adjacency.get(link.source) ?? new Set<string>();
    if (!targets.has(link.target)) {
      targets.add(link.target);
      adjacency.set(link.source, targets);
      indegree.set(link.target, (indegree.get(link.target) ?? 0) + 1);
    }
  }

  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited += 1;
    for (const target of adjacency.get(current) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  if (visited !== nodeSet.size) errors.push("graph contains a directed cycle");
  return errors;
}
