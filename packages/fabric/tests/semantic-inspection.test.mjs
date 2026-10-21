import { describe, expect, test } from "vitest";
import { checkSemanticCompatibility, inspectSemanticModel, inspectTmdlParts } from "../src/index.mjs";

const part = (path, content) => ({ path, payloadType: "InlineBase64", payload: Buffer.from(content).toString("base64") });

const definition = [
  part("definition.pbism", "{}\n"),
  part("definition/database.tmdl", "database demo\n\tcompatibilityLevel: 1702\n"),
  part("definition/model.tmdl", "model Model\n\tculture: en-AU\n\nref table Sales\nref table 'Widget Axis'\n"),
  part("definition/expressions.tmdl", 'expression Server = "redacted" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]\n'),
  part("definition/relationships.tmdl", "relationship 'Sales to Date'\n\tcrossFilteringBehavior: oneDirection\n\tfromColumn: Sales.Date\n\ttoColumn: Date.Date\n"),
  part("definition/tables/Sales.tmdl", "table Sales\n\n\tmeasure 'Total Sales' = SUM(Sales[Amount])\n\n\tcolumn Category\n\t\tdataType: string\n\n\tcolumn Amount\n\t\tdataType: decimal\n\n\thierarchy Geography\n\t\tlevel Country\n\t\t\tcolumn: Category\n"),
  part("definition/tables/Widget Axis.tmdl", "table 'Widget Axis'\n\n\tcolumn WidgetId\n\t\tdataType: string\n"),
];

describe("semantic model inspection", () => {
  test("extracts a safe TMDL inventory without expression values", () => {
    const result = inspectTmdlParts(definition);
    expect(result).toMatchObject({
      compatibilityLevel: 1702,
      culture: "en-AU",
      parameters: [{ name: "Server", required: true }],
      relationships: [{ name: "Sales to Date", from: "Sales.Date", to: "Date.Date" }],
      tables: [
        { name: "Sales", columns: [{ name: "Amount", dataType: "decimal" }, { name: "Category", dataType: "string" }], measures: [{ name: "Total Sales" }], hierarchies: [{ name: "Geography", levels: [{ name: "Country" }] }] },
        { name: "Widget Axis", columns: [{ name: "WidgetId" }] },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("redacted");
  });

  test("compares semantic and broker requirements with the discovered model", () => {
    const inspection = inspectTmdlParts(definition);
    const semanticModel = { tables: [{ name: "Sales", columns: [{ name: "Category" }, { name: "Amount" }], measures: [{ name: "Total Sales" }], hierarchies: [] }] };
    const broker = { widgets: [{ axis: "Sales[Category]", dimensions: [{ key: "Sales[Category]", label: "Sales[Category]" }], measures: ["[Total Sales]"] }] };
    const compatible = checkSemanticCompatibility(inspection, semanticModel, broker);
    expect(compatible.ok).toBe(true);
    expect(compatible.summary).toEqual({ required: 3, matched: 3, missing: 0, ambiguous: 0 });

    const incompatible = checkSemanticCompatibility(inspection, { tables: [{ name: "Sales", columns: [{ name: "Missing" }], measures: [], hierarchies: [] }] }, { widgets: [] });
    expect(incompatible).toMatchObject({ ok: false, summary: { missing: 1 }, diagnostics: [{ code: "semantic.object.missing", reference: "Sales[Missing]" }] });
  });

  test("downloads only the selected semantic model definition", async () => {
    const calls = [];
    const client = {
      async getWorkspace(id) { return { id, displayName: "Sandbox", capacityId: "capacity-1" }; },
      async listItems() { return [{ id: "model-1", displayName: "Demo", type: "SemanticModel" }]; },
      async getDefinition(_workspaceId, type, id, format) { calls.push({ type, id, format }); return { format, parts: definition }; },
      async executeDax() { return [{ Value: 1 }]; },
    };
    const result = await inspectSemanticModel({ client, workspaceId: "workspace-1", workspaceName: "Sandbox", semanticModelId: "model-1", acceptanceDax: 'EVALUATE ROW("Value", 1)' });
    expect(calls).toEqual([{ type: "SemanticModel", id: "model-1", format: "TMDL" }]);
    expect(result).toMatchObject({ ok: true, workspace: { id: "workspace-1" }, semanticModel: { id: "model-1", compatibilityLevel: 1702 }, acceptance: { rowCount: 1 } });
  });
});
