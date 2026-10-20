import { decodePart, verifyDefinitionParts } from "./parts.mjs";
import { executeAcceptanceQuery } from "./operations.mjs";

function identifier(value) {
  const trimmed = value.trim();
  return trimmed.startsWith("'") && trimmed.endsWith("'")
    ? trimmed.slice(1, -1).replaceAll("''", "'")
    : trimmed;
}

function declaration(line, kind) {
  const match = line.trim().match(new RegExp(`^${kind}\\s+('(?:[^']|'')*'|.*?)(?:\\s*=|$)`));
  return match ? identifier(match[1]) : null;
}

function decodedText(part) {
  return decodePart(part).toString("utf8");
}

export function inspectTmdlParts(parts) {
  verifyDefinitionParts(parts, "TMDL");
  const tables = [];
  const relationships = [];
  const parameters = [];
  let compatibilityLevel = null;
  let culture = null;

  for (const part of parts) {
    if (!part.path.endsWith(".tmdl")) continue;
    const text = decodedText(part);
    if (/\/tables\/[^/]+\.tmdl$/i.test(`/${part.path}`)) {
      const tableName = declaration(text.split(/\r?\n/).find((line) => /^table\s/.test(line.trim())) ?? "", "table");
      if (!tableName) continue;
      const table = { name: tableName, columns: [], measures: [], hierarchies: [] };
      let currentColumn = null;
      for (const line of text.split(/\r?\n/)) {
        const measure = declaration(line, "measure");
        const column = declaration(line, "column");
        const hierarchy = declaration(line, "hierarchy");
        if (measure) {
          table.measures.push({ name: measure });
          currentColumn = null;
        } else if (column) {
          currentColumn = { name: column, dataType: null };
          table.columns.push(currentColumn);
        } else if (hierarchy) {
          table.hierarchies.push({ name: hierarchy });
          currentColumn = null;
        } else if (currentColumn) {
          const dataType = line.trim().match(/^dataType:\s*(.+)$/)?.[1];
          if (dataType) currentColumn.dataType = dataType.trim();
        }
      }
      tables.push(table);
      continue;
    }
    if (part.path.endsWith("relationships.tmdl")) {
      let current = null;
      for (const line of text.split(/\r?\n/)) {
        const name = declaration(line, "relationship");
        if (name) {
          current = { name, from: null, to: null, crossFilteringBehavior: null };
          relationships.push(current);
          continue;
        }
        if (!current) continue;
        const property = line.trim().match(/^(fromColumn|toColumn|crossFilteringBehavior):\s*(.+)$/);
        if (!property) continue;
        if (property[1] === "fromColumn") current.from = property[2].trim();
        if (property[1] === "toColumn") current.to = property[2].trim();
        if (property[1] === "crossFilteringBehavior") current.crossFilteringBehavior = property[2].trim();
      }
      continue;
    }
    if (part.path.endsWith("expressions.tmdl")) {
      for (const line of text.split(/\r?\n/)) {
        const name = declaration(line, "expression");
        if (name) parameters.push({ name, required: /IsParameterQueryRequired=true/.test(line) });
      }
      continue;
    }
    if (part.path.endsWith("database.tmdl")) {
      compatibilityLevel = Number(text.match(/compatibilityLevel:\s*(\d+)/)?.[1] ?? NaN) || null;
      continue;
    }
    if (part.path.endsWith("model.tmdl")) {
      culture = text.match(/^\s*culture:\s*(.+)$/m)?.[1]?.trim() ?? null;
    }
  }

  tables.sort((left, right) => left.name.localeCompare(right.name));
  for (const table of tables) {
    table.columns.sort((left, right) => left.name.localeCompare(right.name));
    table.measures.sort((left, right) => left.name.localeCompare(right.name));
    table.hierarchies.sort((left, right) => left.name.localeCompare(right.name));
  }
  return { compatibilityLevel, culture, tables, relationships, parameters };
}

function requirementKey(requirement) {
  return `${requirement.kind}:${requirement.table ?? ""}:${requirement.name}`;
}

function parseReference(reference, kind) {
  const qualified = reference.match(/^'?(.+?)'?\[([^\]]+)\]$/);
  if (qualified) return { kind, table: qualified[1].replaceAll("''", "'"), name: qualified[2], reference };
  const unqualified = reference.match(/^\[([^\]]+)\]$/);
  if (unqualified) return { kind, table: null, name: unqualified[1], reference };
  return { kind, table: null, name: reference, reference };
}

export function semanticRequirements(semanticModel, broker) {
  const requirements = new Map();
  for (const table of semanticModel.tables ?? []) {
    for (const column of table.columns ?? []) {
      const item = { kind: "column", table: table.name, name: column.name, reference: `${table.name}[${column.name}]`, source: "semantic-contract" };
      requirements.set(requirementKey(item), item);
    }
    for (const measure of table.measures ?? []) {
      const item = { kind: "measure", table: table.name, name: measure.name, reference: `${table.name}[${measure.name}]`, source: "semantic-contract" };
      requirements.set(requirementKey(item), item);
    }
    for (const hierarchy of table.hierarchies ?? []) {
      const item = { kind: "hierarchy", table: table.name, name: hierarchy.name, reference: `${table.name}[${hierarchy.name}]`, source: "semantic-contract" };
      requirements.set(requirementKey(item), item);
    }
  }
  for (const widget of broker.widgets ?? []) {
    const references = [
      parseReference(widget.axis, "column"),
      ...(widget.dimensions ?? []).flatMap((dimension) => [parseReference(dimension.key, "column"), parseReference(dimension.label, "column")]),
      ...(widget.measures ?? []).map((measure) => parseReference(measure, "measure")),
    ];
    for (const item of references) {
      let resolved = item;
      if (!item.table) {
        const localMatches = (semanticModel.tables ?? []).filter((table) => {
          const collection = item.kind === "measure" ? table.measures : item.kind === "hierarchy" ? table.hierarchies : table.columns;
          return (collection ?? []).some((candidate) => candidate.name === item.name);
        });
        if (localMatches.length === 1) resolved = { ...item, table: localMatches[0].name };
      }
      const key = requirementKey(resolved);
      if (!requirements.has(key)) requirements.set(key, { ...resolved, source: "widget-broker" });
    }
  }
  return [...requirements.values()].sort((left, right) => left.reference.localeCompare(right.reference) || left.kind.localeCompare(right.kind));
}

export function checkSemanticCompatibility(inspection, semanticModel, broker) {
  const requirements = semanticRequirements(semanticModel, broker);
  const checks = requirements.map((requirement) => {
    const candidateTables = requirement.table
      ? inspection.tables.filter((table) => table.name === requirement.table)
      : inspection.tables;
    const matches = candidateTables.flatMap((table) => {
      const collection = requirement.kind === "measure" ? table.measures : requirement.kind === "hierarchy" ? table.hierarchies : table.columns;
      return collection.filter((item) => item.name === requirement.name).map(() => table.name);
    });
    const status = matches.length === 1 ? "matched" : matches.length > 1 ? "ambiguous" : "missing";
    return { ...requirement, status, matchedTable: matches.length === 1 ? matches[0] : null, candidates: matches.length > 1 ? matches : [] };
  });
  const diagnostics = checks.filter((check) => check.status !== "matched").map((check) => ({
    code: check.status === "ambiguous" ? "semantic.object.ambiguous" : "semantic.object.missing",
    reference: check.reference,
    kind: check.kind,
    message: check.status === "ambiguous" ? `${check.reference} matches multiple tables: ${check.candidates.join(", ")}` : `${check.reference} was not found`,
  }));
  return {
    ok: diagnostics.length === 0,
    summary: { required: checks.length, matched: checks.filter((check) => check.status === "matched").length, missing: checks.filter((check) => check.status === "missing").length, ambiguous: checks.filter((check) => check.status === "ambiguous").length },
    checks,
    diagnostics,
  };
}

export async function inspectSemanticModel({ client, workspaceId, workspaceName, semanticModelId, acceptanceDax = null }) {
  if (!workspaceId) throw new Error("A Fabric workspace ID is required; display-name-only discovery is not safe");
  if (!semanticModelId) throw new Error("An exact semantic model ID is required");
  const workspace = await client.getWorkspace(workspaceId);
  if (!workspace || String(workspace.id) !== String(workspaceId)) throw new Error(`Fabric workspace ${workspaceId} was not found`);
  if (workspaceName && workspace.displayName !== workspaceName) throw new Error(`Workspace ID ${workspaceId} is ${workspace.displayName}, not ${workspaceName}`);
  const items = await client.listItems(workspaceId, "SemanticModel");
  const semanticModel = items.find((item) => String(item.id) === String(semanticModelId));
  if (!semanticModel) throw new Error(`Semantic model ${semanticModelId} was not found in workspace ${workspaceId}`);
  const definition = await client.getDefinition(workspaceId, "SemanticModel", semanticModelId, "TMDL");
  const inspection = inspectTmdlParts(definition.parts);
  const acceptance = acceptanceDax ? await executeAcceptanceQuery({ client, workspaceId, semanticModelId, query: acceptanceDax }) : null;
  return {
    ok: true,
    workspace: { id: workspace.id, displayName: workspace.displayName, capacityId: workspace.capacityId ?? null },
    semanticModel: { id: semanticModel.id, displayName: semanticModel.displayName, type: semanticModel.type ?? "SemanticModel", format: "TMDL", ...inspection },
    acceptance,
  };
}
