import { decodePart, verifyDefinitionParts } from "./parts.mjs";
import { executeAcceptanceQuery } from "./operations.mjs";

function identifier(value) {
  const trimmed = value.trim();
  return trimmed.startsWith("'") && trimmed.endsWith("'")
    ? trimmed.slice(1, -1).replaceAll("''", "'")
    : trimmed;
}

function declaration(line, kind) {
  const trimmed = line.trim();
  const prefix = `${kind} `;
  if (!trimmed.startsWith(prefix)) return null;
  const value = trimmed.slice(prefix.length);
  if (value.startsWith("'")) {
    for (let index = 1; index < value.length; index += 1) {
      if (value[index] !== "'") continue;
      if (value[index + 1] === "'") {
        index += 1;
        continue;
      }
      return identifier(value.slice(0, index + 1));
    }
    return null;
  }
  const assignment = value.indexOf(" =");
  const name = (assignment < 0 ? value : value.slice(0, assignment)).trim();
  return name || null;
}

function propertyValue(line, name) {
  const trimmed = line.trim();
  const prefix = `${name}:`;
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length).trim() || null : null;
}

function qualifiedReference(reference, kind) {
  if (typeof reference !== "string" || !reference.endsWith("]")) return null;
  const separator = reference.lastIndexOf("[", reference.length - 2);
  if (separator <= 0 || separator === reference.length - 2) return null;
  const rawTable = reference.slice(0, separator);
  const table = rawTable.startsWith("'") && rawTable.endsWith("'")
    ? rawTable.slice(1, -1).replaceAll("''", "'")
    : rawTable;
  return { kind, table, name: reference.slice(separator + 1, -1), reference };
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
          const dataType = propertyValue(line, "dataType");
          if (dataType) currentColumn.dataType = dataType;
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
        const from = propertyValue(line, "fromColumn");
        const to = propertyValue(line, "toColumn");
        const behavior = propertyValue(line, "crossFilteringBehavior");
        if (from) current.from = from;
        if (to) current.to = to;
        if (behavior) current.crossFilteringBehavior = behavior;
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
      const line = text.split(/\r?\n/).find((candidate) => propertyValue(candidate, "compatibilityLevel"));
      compatibilityLevel = Number(line ? propertyValue(line, "compatibilityLevel") : NaN) || null;
      continue;
    }
    if (part.path.endsWith("model.tmdl")) {
      const line = text.split(/\r?\n/).find((candidate) => propertyValue(candidate, "culture"));
      culture = line ? propertyValue(line, "culture") : null;
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
  const qualified = qualifiedReference(reference, kind);
  if (qualified) return qualified;
  const unqualified = typeof reference === "string" && reference.startsWith("[") && reference.endsWith("]") && reference.indexOf("[", 1) === -1
    ? reference.slice(1, -1)
    : null;
  if (unqualified) return { kind, table: null, name: unqualified, reference };
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
