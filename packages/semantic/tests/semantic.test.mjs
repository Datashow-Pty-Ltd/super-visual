import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { compileBrokerAdapter, compileTmdl, validateSemanticModel } from "../src/index.mjs";

const semantic = {
  contractVersion: 1, name: "Test Sales", culture: "en-AU", compatibilityLevel: 1702, storageMode: "import",
  sourceParameters: { server: "localhost", database: "Test" },
  tables: [{
    name: "Sales", role: "fact", grain: "One row per sale transaction.", description: "Sales transactions used for compiler tests.",
    source: { referencedTables: [{ schema: "dbo", table: "Sales" }], sql: "SELECT Product, Amount FROM dbo.Sales" },
    columns: [{ name: "Product", sourceColumn: "Product", dataType: "String", hidden: false, summarizeBy: "none", description: "Readable product name for each sales transaction." }],
    measures: [{ name: "Total Sales", expression: "SUM('Sales'[Amount])", formatString: "$#,##0", displayFolder: "Measures", description: "Total sales value for the active filter context." }], hierarchies: [],
  }], relationships: [],
};

const broker = {
  adapterMode: "source-direct-import", baseModelMutation: false,
  dataView: { mapping: "table", discriminator: "WidgetId", fields: ["WidgetId", "AxisKey", "Label", "Sort", "SeriesKey", "SeriesLabel", "WidgetValue", "BrokerContext"] },
  widgets: [{ id: "product", title: "Sales by product", shape: "categorical", dimensions: [{ key: "Sales[Product]", label: "Sales[Product]" }], axis: "Sales[Product]", measures: ["[Total Sales]"], rowLimit: 10, rowSelection: "top-by-value", selectable: true, invalidates: [] }],
};

describe("semantic compiler", () => {
  test("compiles a governed semantic model to deterministic TMDL", async () => {
    expect(validateSemanticModel(semantic)).toEqual([]);
    const root = await mkdtemp(path.join(os.tmpdir(), "supervisual-semantic-"));
    await compileTmdl(semantic, root);
    expect(await readFile(path.join(root, "definition", "tables", "Sales.tmdl"), "utf8")).toContain("Value.NativeQuery");
  });

  test("adds the disconnected Widget Axis adapter without mutating the base", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "supervisual-adapter-"));
    const base = path.join(root, "base");
    const adapter = path.join(root, "adapter");
    await compileTmdl(semantic, base);
    const before = await readFile(path.join(base, "definition", "model.tmdl"), "utf8");
    await compileBrokerAdapter({ baseModelDirectory: base, outputDirectory: adapter, broker, semanticModel: semantic });
    expect(await readFile(path.join(adapter, "definition", "tables", "Widget Axis.tmdl"), "utf8")).toContain("REMOVEFILTERS('Sales'[Product])");
    expect(await readFile(path.join(adapter, "definition", "model.tmdl"), "utf8")).toContain("ref table 'Widget Axis'");
    expect(await readFile(path.join(base, "definition", "model.tmdl"), "utf8")).toBe(before);
  });
});
