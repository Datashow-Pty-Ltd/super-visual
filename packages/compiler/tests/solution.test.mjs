import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import YAML from "yaml";
import { buildSolution } from "../src/index.mjs";

const hash = "a".repeat(64);
const theme = {
  background: "#F6F5EF", surface: "#FFFEFA", quietSurface: "#F0EFE8", text: "#173C36", mutedText: "#59645F", metadata: "#6D7772", rule: "#C9D0C8", grid: "#E4E6E1", accent: "#2F6F73", attention: "#8F6A38", positive: "#39725F", negative: "#B84A52",
  context: ["#2F6F73", "#6F6A9A"], dataColors: ["#2F6F73", "#6F6A9A", "#8F6A38"], displayFont: "Georgia", bodyFont: "Inter", contentWidth: 1560, layoutColumns: 12, layoutGap: 18, cardRadius: 0, cardPadding: [16, 16, 16, 16], kpiTopAccent: 0, density: "comfortable",
  typography: { findingMin: 40, findingMax: 64, sectionTitle: 21, kpiValue: 32, body: 15, chart: 12, table: 13, metadata: 11 },
};

describe("solution compiler", () => {
  test("builds visual, semantic adapter, PBIR wrapper and verifiable manifest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "supervisual-solution-"));
    await mkdir(path.join(root, "contracts"));
    const semantic = { contractVersion: 1, name: "Test Sales", culture: "en-AU", compatibilityLevel: 1702, storageMode: "import", sourceParameters: { server: "localhost", database: "Test" }, tables: [{ name: "Sales", role: "fact", grain: "One row per sales transaction.", description: "Sales transactions for solution compiler verification.", source: { referencedTables: [{ schema: "dbo", table: "Sales" }], sql: "SELECT Product, Amount FROM dbo.Sales" }, columns: [{ name: "Product", sourceColumn: "Product", dataType: "String", hidden: false, summarizeBy: "none", description: "Readable product name for each transaction." }], measures: [{ name: "Total Sales", expression: "SUM('Sales'[Amount])", formatString: "$#,##0", displayFolder: "Measures", description: "Total sales in the current filter context." }], hierarchies: [] }], relationships: [] };
    const broker = { contractVersion: 1, summary: "One governed product dataset.", adapterMode: "source-direct-import", baseModelMutation: false, dataView: { mapping: "table", discriminator: "WidgetId", fields: ["WidgetId", "AxisKey", "Label", "Sort", "SeriesKey", "SeriesLabel", "WidgetValue", "BrokerContext"] }, widgets: [{ id: "product", title: "Sales by product", reportWidgetIds: ["product-widget"], businessQuestionIds: ["sales-health"], shape: "categorical", dimensions: [{ key: "Sales[Product]", label: "Sales[Product]" }], axis: "Sales[Product]", measures: ["[Total Sales]"], rowLimit: 10, rowSelection: "top-by-value", selectable: true, invalidates: [] }], cachePolicy: { retainSourceWidget: true, cancelStaleRequests: true, externalFilterInvalidation: "all-dependent-widgets" }, risks: [] };
    const pageSet = { contractVersion: 1, shell: { id: "test-app", title: "Test app", defaultPage: "overview", designSystem: { id: "test-system", sha256: hash }, acceptedConcept: { id: "test-concept" }, governanceLabel: "Power BI governed", locale: "en-AU", currencyCode: "AUD", filterContext: [], navigation: [{ page: "overview", label: "Overview" }], theme }, pages: [{ id: "overview", title: "Overview", eyebrow: "Test", summary: { headline: "Sales overview", body: "A governed sales overview.", emphasisBinding: null }, search: null, kpis: [], widgets: [{ id: "product-widget", conceptRegionId: "product-widget", primitive: "bar", title: "Sales", subtitle: null, dataset: "product", reportWidgetIds: ["product-widget"], businessQuestionIds: ["sales-health"], layout: { columns: 12, minHeight: 320 }, settings: { orientation: "horizontal", curve: null, showLegend: false, showLabels: true, sort: "descending", limit: 10, emphasis: "bars" } }] }], interactions: [], designRationale: { narrative: "A single governed analytical view.", decisions: ["Use a ranked bar."], accessibility: ["Use a text title."], risks: [] } };
    const entry = `import type { ReportApplicationProps } from "./reportRuntime";\nexport function ReportApplication({ model, onVisibleDatasetsChange }: ReportApplicationProps) { onVisibleDatasetsChange?.(["product"]); return <main>{model.datasets.product?.points.length ?? 0}</main>; }\n`;
    const source = { contractVersion: 1, designSystem: { id: "test-system", sha256: hash }, acceptedConcept: { id: "test-concept" }, entry: "src/reportApplication.tsx", files: [{ path: "src/reportApplication.tsx", content: entry }, { path: "style/report-design.less", content: "main { padding: 1rem; }\n" }], routes: [{ id: "overview", title: "Overview", datasets: ["product"], businessQuestionIds: ["sales-health"] }], bindings: [{ dataset: "product", component: "bar", reportWidgetIds: ["product-widget"], businessQuestionIds: ["sales-health"] }], designRationale: { direction: "Editorial", pageCompositions: ["One page"], dataVisualisation: ["Ranked bar"], responsiveBehaviour: ["Fluid width"], accessibility: ["Semantic main"], risks: [] } };
    const project = { contractVersion: 1, application: { id: "test-app", title: "Test app", entry: "contracts/report-source.json", style: "contracts/report-source.json" }, target: { platform: "powerbi", visual: { name: "testSuperVisual", displayName: "Test Super Visual", guid: "testSuperVisualABC123", version: "1.0.0.0", apiVersion: "5.11.1" } }, semantic: { model: "contracts/semantic.yaml", broker: "contracts/broker.json", pageSet: "contracts/page-set.yaml" }, source: { bundle: "contracts/report-source.json" }, output: { directory: "dist" }, compliance: { policies: ["core", "powerbi"] } };
    await Promise.all([
      writeFile(path.join(root, "supervisual.yaml"), YAML.stringify(project)), writeFile(path.join(root, "contracts", "semantic.yaml"), YAML.stringify(semantic)),
      writeFile(path.join(root, "contracts", "broker.json"), JSON.stringify(broker)), writeFile(path.join(root, "contracts", "page-set.yaml"), YAML.stringify(pageSet)),
      writeFile(path.join(root, "contracts", "report-source.json"), JSON.stringify(source)),
    ]);
    const result = await buildSolution(path.join(root, "supervisual.yaml"));
    const manifest = JSON.parse(await readFile(path.join(result.outputDirectory, "supervisual.manifest.json"), "utf8"));
    expect(Object.keys(manifest.files).length).toBeGreaterThan(20);
    expect(JSON.parse(await readFile(path.join(result.outputDirectory, "compliance.report.json"), "utf8")).ok).toBe(true);
    expect(await readFile(path.join(result.outputDirectory, "SemanticAdapter.SemanticModel", "definition", "tables", "Widget Axis.tmdl"), "utf8")).toContain("REMOVEFILTERS('Sales'[Product])");
    expect(await readFile(path.join(result.outputDirectory, "Visual", "src", "reportApplication.tsx"), "utf8")).toContain("model.datasets");
    expect(await readFile(path.join(result.outputDirectory, "Report.Report", "definition.pbir"), "utf8")).toContain("SemanticAdapter.SemanticModel");
    expect(JSON.parse(await readFile(path.join(result.outputDirectory, "Report.Report", "definition", "version.json"), "utf8"))).toEqual({
      $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json",
      version: "1.0.0",
    });
  });
});
