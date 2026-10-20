import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function identifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : `'${value.replaceAll("'", "''")}'`;
}

function documentation(value) {
  const words = String(value).replaceAll("\r", " ").replaceAll("\n", " ").trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > 76) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.map((item) => `/// ${item}`).join("\n");
}

function stableDatabaseId(name) {
  const bytes = createHash("sha256").update(name).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function mString(value) {
  return `"${String(value).replaceAll('"', '""').replaceAll("\r\n", "#(lf)").replaceAll("\r", "#(cr)").replaceAll("\n", "#(lf)")}"`;
}

function renderMeasure(measure) {
  const expression = measure.expression.includes("\n")
    ? `\`\`\`\n${measure.expression.split("\n").map((line) => `\t\t\t${line}`).join("\n")}\n\t\t\t\`\`\``
    : measure.expression;
  return [
    `\t${documentation(measure.description).replaceAll("\n", "\n\t")}`,
    `\tmeasure ${identifier(measure.name)} = ${expression}`,
    `\t\tformatString: ${measure.formatString}`,
    `\t\tdisplayFolder: ${measure.displayFolder}`,
  ].join("\n");
}

function renderColumn(column, sortKeys, hierarchyLevels) {
  const type = { Int64: "int64", Decimal: "decimal", String: "string", DateTime: "dateTime", Boolean: "boolean" }[column.dataType];
  const lines = [
    `\t${documentation(column.description).replaceAll("\n", "\n\t")}`,
    `\tcolumn ${identifier(column.name)}`,
    `\t\tdataType: ${type}`,
  ];
  if (column.formatString) lines.push(`\t\tformatString: ${column.formatString}`);
  if (column.hidden) lines.push("\t\tisHidden");
  lines.push(`\t\tsummarizeBy: ${column.summarizeBy ?? "none"}`);
  lines.push(`\t\tsourceColumn: ${column.sourceColumn}`);
  if (column.dataCategory) lines.push(`\t\tdataCategory: ${column.dataCategory}`);
  if (column.sortByColumn) lines.push(`\t\tsortByColumn: ${identifier(column.sortByColumn)}`);
  if (column.hidden && !column.sortByColumn && !sortKeys.has(column.name) && !hierarchyLevels.has(column.name)) lines.push("\t\tisAvailableInMdx: false");
  return lines.join("\n");
}

function renderTable(table) {
  const sortKeys = new Set(table.columns.flatMap((column) => column.sortByColumn ? [column.sortByColumn] : []));
  const hierarchyLevels = new Set((table.hierarchies ?? []).flatMap((hierarchy) => hierarchy.levels.map((level) => level.column)));
  const measures = (table.measures ?? []).map(renderMeasure).join("\n\n");
  const columns = table.columns.map((column) => renderColumn(column, sortKeys, hierarchyLevels)).join("\n\n");
  const hierarchies = (table.hierarchies ?? []).map((hierarchy) => [
    `\thierarchy ${identifier(hierarchy.name)}`,
    ...hierarchy.levels.flatMap((level) => [`\n\t\tlevel ${identifier(level.name)}`, `\t\t\tcolumn: ${identifier(level.column)}`]),
  ].join("\n")).join("\n\n");
  return [
    `${documentation(`${table.description} Grain: ${table.grain}`)}\ntable ${identifier(table.name)}`,
    table.dataCategory ? `\tdataCategory: ${table.dataCategory}` : "",
    measures,
    columns,
    hierarchies,
    `\tpartition ${identifier(table.name)} = m`,
    "\t\tmode: import",
    "\t\tsource =",
    "\t\t\tlet",
    "\t\t\t\tSource = Sql.Database(#\"Server\", #\"Database\"),",
    "\t\t\t\t// Selected and shaped business columns required by the governed model.",
    `\t\t\t\t#\"Queried Rows\" = Value.NativeQuery(Source, ${mString(table.source.sql.trim())}, null, [EnableFolding=true])`,
    "\t\t\tin",
    "\t\t\t\t#\"Queried Rows\"",
  ].filter(Boolean).join("\n\n").replaceAll("\n\n\t\t", "\n\t\t") + "\n";
}

export function validateSemanticModel(model) {
  const errors = [];
  if (model?.contractVersion !== 1) errors.push("semantic model contractVersion must be 1");
  if (!model?.name) errors.push("semantic model name is required");
  if (!Array.isArray(model?.tables) || !model.tables.length) errors.push("semantic model requires tables");
  const tableNames = new Set();
  const measures = new Set();
  for (const table of model?.tables ?? []) {
    if (tableNames.has(table.name)) errors.push(`duplicate semantic table ${table.name}`);
    tableNames.add(table.name);
    if (!/^\s*(select|with)\b/i.test(table.source?.sql ?? "") || /\b(insert|update|delete|merge|drop|alter|create|truncate|execute|exec|grant|revoke)\b/i.test(table.source?.sql ?? "")) errors.push(`${table.name}: source SQL must be read-only`);
    const columns = new Set();
    for (const column of table.columns ?? []) {
      if (columns.has(column.name)) errors.push(`${table.name}: duplicate column ${column.name}`);
      columns.add(column.name);
      if (column.sortByColumn && !(table.columns ?? []).some((candidate) => candidate.name === column.sortByColumn)) errors.push(`${table.name}.${column.name}: missing sort column ${column.sortByColumn}`);
    }
    for (const measure of table.measures ?? []) {
      if (measures.has(measure.name)) errors.push(`measure ${measure.name} must be globally unique`);
      measures.add(measure.name);
    }
  }
  for (const relationship of model?.relationships ?? []) {
    for (const [side, tableName, columnName] of [["from", relationship.fromTable, relationship.fromColumn], ["to", relationship.toTable, relationship.toColumn]]) {
      const table = (model.tables ?? []).find((candidate) => candidate.name === tableName);
      if (!table?.columns?.some((column) => column.name === columnName)) errors.push(`${relationship.name}: unresolved ${side} column ${tableName}[${columnName}]`);
    }
  }
  return errors;
}

export async function compileTmdl(model, outputDirectory) {
  const errors = validateSemanticModel(model);
  if (errors.length) throw new Error(`Semantic model validation failed:\n- ${errors.join("\n- ")}`);
  const definition = path.join(outputDirectory, "definition");
  const tables = path.join(definition, "tables");
  await mkdir(tables, { recursive: true });
  await writeFile(path.join(outputDirectory, "definition.pbism"), `${JSON.stringify({ $schema: "https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json", version: "4.2", settings: { qnaEnabled: true } }, null, 2)}\n`);
  await writeFile(path.join(definition, "database.tmdl"), `database ${stableDatabaseId(model.name)}\n\tcompatibilityLevel: ${model.compatibilityLevel}\n\tcompatibilityMode: powerBI\n\tlanguage: 3081\n`);
  await writeFile(path.join(definition, "model.tmdl"), `model Model\n\tculture: ${model.culture}\n\tdefaultPowerBIDataSourceVersion: powerBI_V3\n\tsourceQueryCulture: ${model.culture}\n\tdiscourageImplicitMeasures\n\n${model.tables.map((table) => `ref table ${identifier(table.name)}`).join("\n")}\n`);
  await writeFile(path.join(definition, "expressions.tmdl"), `expression Server = ${mString(model.sourceParameters.server)} meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]\n\nexpression Database = ${mString(model.sourceParameters.database)} meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]\n`);
  await writeFile(path.join(definition, "relationships.tmdl"), (model.relationships ?? []).map((relationship) => [
    `relationship ${identifier(relationship.name)}`,
    relationship.active === false ? "\tisActive: false" : "",
    `\tcrossFilteringBehavior: ${relationship.crossFilteringBehavior ?? "oneDirection"}`,
    `\tfromColumn: ${identifier(relationship.fromTable)}.${identifier(relationship.fromColumn)}`,
    `\ttoColumn: ${identifier(relationship.toTable)}.${identifier(relationship.toColumn)}`,
  ].filter(Boolean).join("\n")).join("\n\n"));
  for (const table of model.tables) await writeFile(path.join(tables, `${table.name}.tmdl`), renderTable(table));
  return { outputDirectory, tableCount: model.tables.length, databaseId: stableDatabaseId(model.name) };
}
