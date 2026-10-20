import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { compileBrokerAdapter, compileTmdl, semanticModelWithCatalog, validateSemanticModel } from "../src/index.mjs";

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
  contractVersion: 1,
  adapterMode: "source-direct-import", baseModelMutation: false,
  dataView: { mapping: "table", discriminator: "WidgetId", fields: ["WidgetId", "AxisKey", "Label", "Sort", "SeriesKey", "SeriesLabel", "WidgetValue", "BrokerContext"] },
  widgets: [{ id: "product", title: "Sales by product", shape: "categorical", dimensions: [{ key: "Sales[Product]", label: "Sales[Product]" }], axis: "Sales[Product]", measures: ["[Total Sales]"], rowLimit: 10, rowSelection: "top-by-value", selectable: true, invalidates: [] }],
};

const catalogBroker = {
  ...broker,
  widgets: [{
    id: "model-catalog", title: "Semantic model entities", shape: "hierarchy",
    dimensions: [
      { key: "Super Visual Model Catalog[Entity Type]", label: "Super Visual Model Catalog[Entity Type]" },
      { key: "Super Visual Model Catalog[Parent]", label: "Super Visual Model Catalog[Parent]" },
      { key: "Super Visual Model Catalog[Entity]", label: "Super Visual Model Catalog[Entity]" },
    ],
    axis: "Super Visual Model Catalog[Entity]", measures: ["[Entity Count]"],
    rowLimit: 250, rowSelection: "first-by-axis", selectable: false, invalidates: [],
  }],
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
    const widgetAxis = await readFile(path.join(adapter, "definition", "tables", "Widget Axis.tmdl"), "utf8");
    expect(widgetAxis).toContain("REMOVEFILTERS('Sales'[Product])");
    expect(widgetAxis).toContain("RETURN _widgetRows1");
    expect(widgetAxis).not.toContain("RETURN UNION(_widgetRows1)");
    expect(await readFile(path.join(adapter, "definition", "model.tmdl"), "utf8")).toContain("ref table 'Widget Axis'");
    expect(await readFile(path.join(base, "definition", "model.tmdl"), "utf8")).toBe(before);
  });

  test("generates a source-backed model catalog only for the report adapter", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "supervisual-catalog-"));
    const base = path.join(root, "base");
    const catalogBase = path.join(root, "catalog-base");
    const adapter = path.join(root, "adapter");
    const augmented = semanticModelWithCatalog(semantic, catalogBroker);

    expect(semantic.tables.map((table) => table.name)).toEqual(["Sales"]);
    expect(augmented.tables.map((table) => table.name)).toEqual(["Sales", "Super Visual Model Catalog"]);
    expect(validateSemanticModel(augmented)).toEqual([]);

    await compileTmdl(semantic, base);
    await compileTmdl(augmented, catalogBase);
    await compileBrokerAdapter({ baseModelDirectory: catalogBase, outputDirectory: adapter, broker: catalogBroker, semanticModel: augmented });

    const catalog = await readFile(path.join(adapter, "definition", "tables", "Super Visual Model Catalog.tmdl"), "utf8");
    expect(catalog).toContain("Value.NativeQuery");
    expect(catalog).toContain("EntityType");
    expect(catalog).toContain("Total Sales");
    await expect(readFile(path.join(base, "definition", "tables", "Super Visual Model Catalog.tmdl"), "utf8")).rejects.toThrow();
  });
});
