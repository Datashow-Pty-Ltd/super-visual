export const SEMANTIC_CATALOG_TABLE = "Super Visual Model Catalog";

function referencesCatalog(reference) {
  return typeof reference === "string" && reference.startsWith(`${SEMANTIC_CATALOG_TABLE}[`);
}

export function brokerUsesSemanticCatalog(broker) {
  return (broker?.widgets ?? []).some((widget) => [
    widget.axis,
    ...(widget.dimensions ?? []).flatMap((dimension) => [dimension.key, dimension.label]),
    ...(widget.measures ?? []),
  ].some(referencesCatalog));
}

function sqlString(value) {
  return `N'${String(value ?? "").replaceAll("'", "''")}'`;
}

function catalogEntities(model) {
  const entities = [{ type: "Model", parent: "", name: model.name }];
  for (const table of model.tables ?? []) {
    entities.push({ type: "Table", parent: model.name, name: table.name });
    for (const column of table.columns ?? []) entities.push({ type: "Column", parent: table.name, name: column.name });
    for (const measure of table.measures ?? []) entities.push({ type: "Measure", parent: table.name, name: measure.name });
    for (const hierarchy of table.hierarchies ?? []) {
      entities.push({ type: "Hierarchy", parent: table.name, name: hierarchy.name });
      for (const level of hierarchy.levels ?? []) entities.push({ type: "Hierarchy level", parent: `${table.name}.${hierarchy.name}`, name: level.name });
    }
  }
  for (const relationship of model.relationships ?? []) {
    entities.push({ type: "Relationship", parent: `${relationship.fromTable} → ${relationship.toTable}`, name: relationship.name });
  }
  for (const name of Object.keys(model.sourceParameters ?? {}).sort()) {
    entities.push({ type: "Parameter", parent: model.name, name: name[0].toUpperCase() + name.slice(1) });
  }
  return entities;
}

export function semanticModelWithCatalog(model, broker) {
  if (!brokerUsesSemanticCatalog(broker)) return model;
  if ((model.tables ?? []).some((table) => table.name === SEMANTIC_CATALOG_TABLE)) throw new Error(`${SEMANTIC_CATALOG_TABLE} is reserved for the generated semantic catalog`);
  const entities = catalogEntities(model);
  const values = entities.map((entity, index) => `(${sqlString(entity.type)}, ${sqlString(entity.parent)}, ${sqlString(entity.name)}, ${index + 1})`).join(",\n          ");
  const catalog = {
    name: SEMANTIC_CATALOG_TABLE,
    role: "dimension",
    grain: "One row per declared semantic-model entity.",
    description: "Generated searchable inventory used by the Super Visual connectivity sample.",
    source: {
      referencedTables: [],
      sql: `SELECT catalog.[EntityType], catalog.[Parent], catalog.[Entity], catalog.[Sort]\nFROM (VALUES\n          ${values}\n     ) AS catalog([EntityType], [Parent], [Entity], [Sort])`,
    },
    columns: [
      { name: "Entity Type", sourceColumn: "EntityType", dataType: "String", hidden: false, summarizeBy: "none", description: "Kind of semantic entity." },
      { name: "Parent", sourceColumn: "Parent", dataType: "String", hidden: false, summarizeBy: "none", description: "Containing model, table, hierarchy, or relationship endpoints." },
      { name: "Entity", sourceColumn: "Entity", dataType: "String", hidden: false, summarizeBy: "none", description: "Readable semantic entity name." },
      { name: "Sort", sourceColumn: "Sort", dataType: "Int64", hidden: true, summarizeBy: "none", description: "Stable catalog order." },
    ],
    measures: [
      { name: "Entity Count", expression: `COUNTROWS('${SEMANTIC_CATALOG_TABLE}')`, formatString: "0", displayFolder: "Connectivity", description: "Count of catalog entities in the active context." },
    ],
    hierarchies: [{
      name: "Semantic Entity",
      levels: [
        { name: "Entity Type", column: "Entity Type" },
        { name: "Parent", column: "Parent" },
        { name: "Entity", column: "Entity" },
      ],
    }],
  };
  return { ...model, tables: [...model.tables, catalog] };
}
