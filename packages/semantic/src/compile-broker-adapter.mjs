import { cp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateWidgetBrokerContract } from "@datashow/super-visual-compliance";

const tmdlIdentifier = (value) => `'${value.replaceAll("'", "''")}'`;
const daxString = (value) => `"${value.replaceAll('"', '""')}"`;
const daxReference = (table, object) => `${tmdlIdentifier(table)}[${object.replaceAll("]", "]]" )}]`;

function parseObjectReference(semantic, reference, kind) {
  const qualified = reference.match(/^(.+)\[([^\]]+)\]$/);
  if (qualified) {
    const table = semantic.tables.find((candidate) => candidate.name === qualified[1]);
    const object = (kind === "column" ? table?.columns : table?.measures)?.find((candidate) => candidate.name === qualified[2]);
    if (!table || !object) throw new Error(`Unknown semantic ${kind} ${reference}`);
    return { table, object, reference: daxReference(table.name, object.name) };
  }
  if (kind === "measure" && reference.startsWith("[") && reference.endsWith("]")) {
    const name = reference.slice(1, -1);
    const matches = semantic.tables.flatMap((table) => (table.measures ?? []).filter((measure) => measure.name === name).map((object) => ({ table, object })));
    if (matches.length !== 1) throw new Error(`Measure ${reference} must resolve uniquely`);
    return { ...matches[0], reference: `[${name.replaceAll("]", "]]" )}]` };
  }
  throw new Error(`${kind} reference must use Table[Object] notation: ${reference}`);
}

function axisKeyExpression(axis) {
  if (axis.object.dataType === "String") return axis.reference;
  if (axis.object.dataType === "DateTime") return `FORMAT(${axis.reference}, "yyyy-MM-dd")`;
  return `FORMAT(${axis.reference}, "0.############")`;
}

function typedAxisKey(axis, expression) {
  if (axis.object.dataType === "String") return expression;
  if (axis.object.dataType === "DateTime") return `IFERROR(DATE(VALUE(LEFT(${expression}, 4)), VALUE(MID(${expression}, 6, 2)), VALUE(MID(${expression}, 9, 2))), BLANK())`;
  return `IFERROR(VALUE(${expression}), BLANK())`;
}

function sortExpression(semantic, axis) {
  const sortName = axis.object.sortByColumn;
  if (sortName) {
    const sort = parseObjectReference(semantic, `${axis.table.name}[${sortName}]`, "column");
    if (sort.object.dataType === "DateTime") return `VALUE(FORMAT(${sort.reference}, "yyyymmdd"))`;
    if (["Int64", "Decimal"].includes(sort.object.dataType)) return `INT(${sort.reference})`;
  }
  if (axis.object.dataType === "DateTime") return `VALUE(FORMAT(${axis.reference}, "yyyymmdd"))`;
  if (["Int64", "Decimal"].includes(axis.object.dataType)) return `INT(${axis.reference})`;
  return "0";
}

const measureLabel = (reference) => reference.match(/\[([^\]]+)\]$/)?.[1] ?? reference;
const pathExpression = (dimensions, formatter) => dimensions.map(formatter).join(' & "␟" & ');

function widgetRows(semantic, widget, index) {
  const axis = widget.axisObject;
  const sortReference = axis.object.sortByColumn ? parseObjectReference(semantic, `${axis.table.name}[${axis.object.sortByColumn}]`, "column").reference : null;
  const groupBy = [...new Set([...widget.dimensionObjects.flatMap((dimension) => [dimension.keyObject.reference, dimension.labelObject.reference]), ...(sortReference ? [sortReference] : [])])];
  const variable = `_widgetRows${index + 1}`;
  const candidate = `_widgetCandidates${index + 1}`;
  const selected = `_widgetSelected${index + 1}`;
  const order = ["top-by-value", "bottom-by-value"].includes(widget.rowSelection)
    ? `[__RankValue], ${widget.rowSelection === "bottom-by-value" ? "ASC" : "DESC"}, [__Sort], ASC`
    : `[__Sort], ${widget.rowSelection === "last-by-axis" ? "DESC" : "ASC"}, [AxisKey], ASC`;
  const seriesRows = widget.measures.map((measure) => `SELECTCOLUMNS(\n                ${selected},\n                "WidgetId", ${daxString(widget.id)},\n                "AxisKey", [AxisKey],\n                "Label", [Label],\n                "Sort", [__Sort],\n                "SeriesKey", ${daxString(measure)},\n                "SeriesLabel", ${daxString(measureLabel(measure))}\n            )`);
  return {
    variable,
    dax: `VAR ${candidate} =\n        FILTER(\n            SELECTCOLUMNS(\n                SUMMARIZECOLUMNS(${groupBy.join(", ")}, "__RankValue", CALCULATE(${widget.measureObjects[0].reference})),\n                "AxisKey", ${pathExpression(widget.dimensionObjects, (dimension) => axisKeyExpression(dimension.keyObject))},\n                "Label", ${pathExpression(widget.dimensionObjects, (dimension) => `FORMAT(${dimension.labelObject.reference}, "")`)},\n                "__Sort", ${sortExpression(semantic, axis)},\n                "__RankValue", [__RankValue]\n            ),\n            NOT ISBLANK([__RankValue])\n        )\n    VAR ${selected} = TOPN(${widget.rowLimit}, ${candidate}, ${order})\n    VAR ${variable} =\n        ${seriesRows.length === 1 ? seriesRows[0] : `UNION(\n            ${seriesRows.join(",\n            ")}\n        )`}`,
  };
}

export async function compileBrokerAdapter({ baseModelDirectory, outputDirectory, broker, semanticModel }) {
  if (broker.adapterMode !== "source-direct-import" || broker.baseModelMutation !== false) throw new Error("Broker contract must preserve a source-direct report adapter without base-model mutation");
  const errors = validateWidgetBrokerContract(broker, semanticModel);
  if (errors.length) throw new Error(`Widget broker validation failed:\n- ${errors.join("\n- ")}`);
  const widgets = broker.widgets.map((widget) => ({
    ...widget,
    axisObject: parseObjectReference(semanticModel, widget.axis, "column"),
    dimensionObjects: widget.dimensions.map((dimension) => ({ keyObject: parseObjectReference(semanticModel, dimension.key, "column"), labelObject: parseObjectReference(semanticModel, dimension.label, "column") })),
    measureObjects: widget.measures.map((measure) => parseObjectReference(semanticModel, measure, "measure")),
  }));
  const rows = widgets.map((widget, index) => widgetRows(semanticModel, widget, index));
  const valueCases = widgets.flatMap((widget) => {
    const removeFilter = widget.selectable ? `, REMOVEFILTERS(${widget.axisObject.reference})` : "";
    const filters = widget.dimensionObjects.map((dimension, index) => {
      const part = `PATHITEM(SUBSTITUTE(_axisKey, "␟", "|"), ${index + 1})`;
      return `TREATAS({ ${typedAxisKey(dimension.keyObject, part)} }, ${dimension.keyObject.reference})`;
    });
    return widget.measureObjects.map((measureObject, index) => `            ${daxString(`${widget.id}|${widget.measures[index]}`)}, CALCULATE(${measureObject.reference}${removeFilter}${filters.length ? `, ${filters.join(", ")}` : ""})`);
  }).join(",\n");
  const contextParts = widgets.map((widget) => `${daxString(`${widget.id}=`)} & CONCATENATEX(TOPN(5, VALUES(${widget.axisObject.reference}), ${widget.axisObject.reference}, ASC), FORMAT(${widget.axisObject.reference}, ""), ",")`);
  await rm(outputDirectory, { recursive: true, force: true });
  await cp(baseModelDirectory, outputDirectory, { recursive: true });
  const definition = path.join(outputDirectory, "definition");
  const tablePath = path.join(definition, "tables", "Widget Axis.tmdl");
  await writeFile(tablePath, `/// Report-specific disconnected broker generated from the validated widget contract.\ntable 'Widget Axis'\n\n\tmeasure 'Widget Value' = \`\`\`\n\t\t\tVAR _widget = SELECTEDVALUE('Widget Axis'[WidgetId])\n\t\t\tVAR _axisKey = SELECTEDVALUE('Widget Axis'[AxisKey])\n\t\t\tVAR _seriesKey = SELECTEDVALUE('Widget Axis'[SeriesKey])\n\t\t\tRETURN\n\t\t\t\tSWITCH(\n\t\t\t\t\t_widget & "|" & _seriesKey,\n${valueCases}\n\t\t\t\t)\n\t\t\t\`\`\`\n\t\tformatString: $#,##0.00\n\t\tdisplayFolder: Broker\n\n\tmeasure 'Broker Context' = ${contextParts.join(' & ";" & ')}\n\t\tdisplayFolder: Broker\n\n\tcolumn WidgetId\n\t\tdataType: string\n\t\tsummarizeBy: none\n\t\tsourceColumn: [WidgetId]\n\n\tcolumn AxisKey\n\t\tdataType: string\n\t\tsummarizeBy: none\n\t\tsourceColumn: [AxisKey]\n\n\tcolumn Label\n\t\tdataType: string\n\t\tsummarizeBy: none\n\t\tsourceColumn: [Label]\n\n\tcolumn Sort\n\t\tdataType: int64\n\t\tsummarizeBy: none\n\t\tsourceColumn: [Sort]\n\n\tcolumn SeriesKey\n\t\tdataType: string\n\t\tsummarizeBy: none\n\t\tsourceColumn: [SeriesKey]\n\n\tcolumn SeriesLabel\n\t\tdataType: string\n\t\tsummarizeBy: none\n\t\tsourceColumn: [SeriesLabel]\n\n\tpartition 'Widget Axis' = calculated\n\t\tmode: import\n\t\tsource = \`\`\`\n\t\t\t${rows.map((item) => item.dax).join("\n    ")}\n\t\t\tRETURN UNION(${rows.map((item) => item.variable).join(", ")})\n\t\t\t\`\`\`\n`);
  const modelPath = path.join(definition, "model.tmdl");
  const model = await readFile(modelPath, "utf8");
  if (!model.includes("ref table 'Widget Axis'")) await writeFile(modelPath, `${model.trimEnd()}\nref table 'Widget Axis'\n`);
  return { outputDirectory, widgets: widgets.map(({ id, shape, dimensions, axis, measures }) => ({ id, shape, dimensions, axis, measures })) };
}
