import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildSolution } from "@datashow/super-visual-compiler";
import { encodeDefinition } from "@datashow/super-visual-fabric";
import { initializeProject } from "../src/project.mjs";
import { buildSemanticPreviewQuery, executeSemanticPreviewQuery, normalizeSemanticBrokerRows, previewBrokerSurfaceDiagnostics, runSemanticPreviewTest, startSemanticPreview } from "../src/semantic-preview.mjs";

const loaded = {
  semanticModel: {
    tables: [{ name: "Sales", columns: [{ name: "Category", dataType: "String" }], measures: [{ name: "Total Sales" }] }],
  },
  broker: {
    widgets: [{ id: "sales", axis: "Sales[Category]", dimensions: [{ key: "Sales[Category]", label: "Sales[Category]" }], measures: ["[Total Sales]"], rowLimit: 20, rowSelection: "top-by-value", selectable: true }],
  },
  reportSource: {},
};

async function createPreviewTestDirectory(prefix) {
  const root = path.resolve(".artifacts", "tests");
  await mkdir(root, { recursive: true });
  return mkdtemp(path.join(root, prefix));
}

describe("semantic preview", () => {
  test("builds only contract-derived DAX against the selected semantic model", () => {
    const query = buildSemanticPreviewQuery(loaded, { widgets: ["sales"], selections: { sales: 'Bikes "Road"' } });
    expect(query).not.toContain("'Widget Axis'");
    expect(query).toContain("SUMMARIZECOLUMNS");
    expect(query).toContain('"WidgetId", "sales"');
    expect(query).toContain('"WidgetValue", [__Value1]');
    expect(() => buildSemanticPreviewQuery(loaded, { widgets: ["unknown"] })).toThrow(/unknown or empty widget/);
    expect(() => buildSemanticPreviewQuery(loaded, { widgets: ["sales"], selections: { unknown: "x" } })).toThrow(/unknown widget/);
  });

  test("normalizes Power BI executeQueries column names", () => {
    const rows = normalizeSemanticBrokerRows([{
      "Widget Axis[WidgetId]": "sales",
      "[AxisKey]": "Bikes",
      Label: "Bikes",
      Sort: 1,
      SeriesKey: "[Total Sales]",
      SeriesLabel: "Total Sales",
      WidgetValue: 42,
      BrokerContext: "sales=Bikes",
    }]);
    expect(rows[0]).toEqual({
      WidgetId: "sales", AxisKey: "Bikes", Label: "Bikes", Sort: 1,
      SeriesKey: "[Total Sales]", SeriesLabel: "Total Sales", WidgetValue: 42, BrokerContext: "sales=Bikes",
    });
  });

  test("executes a generated query without accepting DAX from the caller", async () => {
    let observedQuery = "";
    const client = { async executeDax(workspaceId, semanticModelId, query) {
      expect({ workspaceId, semanticModelId }).toEqual({ workspaceId: "workspace-1", semanticModelId: "model-1" });
      observedQuery = query;
      return [{ "[WidgetId]": "sales", "[AxisKey]": "Bikes", "[Label]": "Bikes", "[Sort]": 1, "[SeriesKey]": "sales", "[SeriesLabel]": "Sales", "[WidgetValue]": 42, "[BrokerContext]": "sales=Bikes" }];
    } };
    await expect(executeSemanticPreviewQuery({ client, workspaceId: "workspace-1", semanticModelId: "model-1", loaded, request: { widgets: ["sales"], query: "EVALUATE secrets" } })).rejects.toThrow(/unsupported fields/);
    const result = await executeSemanticPreviewQuery({ client, workspaceId: "workspace-1", semanticModelId: "model-1", loaded, request: { widgets: ["sales"] } });
    expect(observedQuery).not.toContain("secrets");
    expect(result).toMatchObject({ metadata: { requestedWidgets: ["sales"], rowCount: 1 }, rows: [{ WidgetId: "sales", WidgetValue: 42 }] });
  });

  test("detects the internally managed broker surface", () => {
    expect(previewBrokerSurfaceDiagnostics({ tables: [] })).toEqual([{ code: "preview.broker.missing", message: expect.any(String) }]);
    expect(previewBrokerSurfaceDiagnostics({ tables: [{
      name: "Widget Axis",
      columns: ["WidgetId", "AxisKey", "Label", "Sort", "SeriesKey", "SeriesLabel"].map((name) => ({ name })),
      measures: ["Widget Value", "Broker Context"].map((name) => ({ name })),
    }] })).toEqual([]);
  });

  test("serves a loopback-only preview and guarded semantic gateway", async () => {
    const temporary = await createPreviewTestDirectory("supervisual-preview-test-");
    const project = path.join(temporary, "project");
    const remote = path.join(temporary, "remote");
    let preview;
    try {
      await initializeProject({ directory: project });
      await buildSolution(path.join(project, "supervisual.yaml"), { outputDirectory: remote });
      const definition = await encodeDefinition(path.join(remote, "SemanticAdapter.SemanticModel"));
      const client = {
        async getWorkspace(id) { return { id, displayName: "Sandbox" }; },
        async listItems() { return [{ id: "model-1", displayName: "Hello", type: "SemanticModel" }]; },
        async getDefinition() { return { format: "TMDL", parts: definition }; },
        async executeDax() { return [{ "[WidgetId]": "sales", "[AxisKey]": "Bikes", "[Label]": "Bikes", "[Sort]": 1, "[SeriesKey]": "[Total Sales]", "[SeriesLabel]": "Total Sales", "[WidgetValue]": 42, "[BrokerContext]": "sales=Bikes" }]; },
      };
      const progress = [];
      preview = await startSemanticPreview({ client, projectFile: path.join(project, "supervisual.yaml"), workspaceId: "workspace-1", workspaceName: "Sandbox", semanticModelId: "model-1", port: 0, onProgress: (event) => progress.push(event) });
      expect(preview).toMatchObject({ ok: true, status: "ready", mode: "live-semantic-model" });
      expect(progress.map(({ status, step }) => `${status}:${step}`)).toEqual([
        "running:project", "passed:project",
        "running:workspace", "passed:workspace",
        "running:semantic-model", "passed:semantic-model",
        "running:definition", "running:inventory", "passed:inventory",
        "running:compatibility", "passed:compatibility",
        "running:build", "passed:build",
        "running:host", "passed:host",
        "running:server", "passed:server",
      ]);
      const documentResponse = await fetch(preview.url);
      expect(documentResponse.headers.get("access-control-allow-origin")).toBeNull();
      expect(documentResponse.headers.get("content-security-policy")).toContain("connect-src 'self'");
      expect(await documentResponse.text()).toContain("Super Visual semantic preview");
      const mainResponse = await fetch(new URL("src/main.tsx", preview.url));
      const mainSource = await mainResponse.text();
      if (mainResponse.status !== 200) throw new Error(mainSource);
      expect({ status: mainResponse.status, body: mainSource }).toMatchObject({ status: 200 });
      expect(mainSource).toContain("SemanticPreviewHost");

      const rejected = await fetch(new URL("__supervisual/query", preview.url), { method: "POST", headers: { "Content-Type": "application/json", Origin: preview.url.slice(0, -1) }, body: JSON.stringify({ widgets: ["sales"] }) });
      expect(rejected.status).toBe(403);
      const config = await (await fetch(new URL("src/config.ts", preview.url))).text();
      const token = /PREVIEW_TOKEN\s*=\s*"([^"]+)"/.exec(config)?.[1];
      expect(token).toBeTruthy();
      const accepted = await fetch(new URL("__supervisual/query", preview.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: preview.url.slice(0, -1), "X-Supervisual-Preview-Token": token },
        body: JSON.stringify({ widgets: ["sales"] }),
      });
      expect(await accepted.json()).toMatchObject({ ok: true, metadata: { requestedWidgets: ["sales"], rowCount: 1 } });
      await preview.close();
      preview = null;
      const browserResult = await runSemanticPreviewTest({ client, projectFile: path.join(project, "supervisual.yaml"), workspaceId: "workspace-1", workspaceName: "Sandbox", semanticModelId: "model-1", timeoutMs: 10000 });
      expect(browserResult).toMatchObject({ ok: true, status: "passed", baseline: { receivedRowCount: 1 }, interaction: { available: false, tested: false } });
      expect(browserResult.baseline).not.toHaveProperty("context");
    } finally {
      await preview?.close();
      await rm(temporary, { recursive: true, force: true });
    }
  }, 30000);

  test("builds the Hello World catalog from the selected semantic model", async () => {
    const temporary = await createPreviewTestDirectory("supervisual-catalog-preview-");
    const project = path.join(temporary, "project");
    const remote = path.join(temporary, "remote");
    try {
      await initializeProject({ directory: project, template: "hello-world" });
      await buildSolution(path.join(project, "supervisual.yaml"), { outputDirectory: remote });
      const definition = await encodeDefinition(path.join(remote, "Base.SemanticModel"));
      const client = {
        async getWorkspace(id) { return { id, displayName: "Sandbox" }; },
        async listItems() { return [{ id: "model-1", displayName: "Selected Model", type: "SemanticModel" }]; },
        async getDefinition() { return { format: "TMDL", parts: definition }; },
        async executeDax() { throw new Error("The metadata catalog must not require an internal model"); },
      };
      const result = await runSemanticPreviewTest({ client, projectFile: path.join(project, "supervisual.yaml"), workspaceId: "workspace-1", workspaceName: "Sandbox", semanticModelId: "model-1", timeoutMs: 10000 });
      expect(result).toMatchObject({ ok: true, status: "passed", semanticModel: { id: "model-1", displayName: "Selected Model" }, baseline: { receivedRowCount: 6 } });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }, 30000);

  test("loads the AdventureWorks application and exercises a semantic selection", async () => {
    const temporary = await createPreviewTestDirectory("supervisual-adventure-preview-");
    const projectFile = path.resolve("examples/adventureworks/supervisual.yaml");
    try {
      await buildSolution(projectFile, { outputDirectory: path.join(temporary, "remote") });
      const definition = await encodeDefinition(path.join(temporary, "remote", "Base.SemanticModel"));
      const rows = [
        ["trend", "2024-01", "Jan 2024", 202401, "[Total Sales]", "Total Sales", 100],
        ["category", "Bikes", "Bikes", 1, "[Total Sales]", "Total Sales", 80],
        ["territory", "North America", "North America", 1, "[Total Sales]", "Total Sales", 70],
        ["customer", "Customer A", "Customer A", 1, "[Total Sales]", "Total Sales", 60],
        ["product", "Bikes␟Road Bikes␟Road-150", "Bikes␟Road Bikes␟Road-150", 1, "[Total Sales]", "Total Sales", 50],
      ].map(([WidgetId, AxisKey, Label, Sort, SeriesKey, SeriesLabel, WidgetValue]) => ({ WidgetId, AxisKey, Label, Sort, SeriesKey, SeriesLabel, WidgetValue, BrokerContext: "category=Bikes" }));
      const client = {
        async getWorkspace(id) { return { id, displayName: "Sandbox" }; },
        async listItems() { return [{ id: "model-1", displayName: "AdventureWorks", type: "SemanticModel" }]; },
        async getDefinition() { return { format: "TMDL", parts: definition }; },
        async executeDax(_workspaceId, _semanticModelId, query) {
          expect(query).not.toContain("'Widget Axis'");
          return rows;
        },
      };
      const result = await runSemanticPreviewTest({ client, projectFile, workspaceId: "workspace-1", workspaceName: "Sandbox", semanticModelId: "model-1", timeoutMs: 15000 });
      expect(result).toMatchObject({ ok: true, status: "passed", interaction: { available: true, tested: true, widget: "category" } });
      expect(result.pagesTested).toBeGreaterThan(1);
    } finally {
      await rm(path.resolve("examples/adventureworks/.supervisual/semantic-preview"), { recursive: true, force: true });
      await rm(temporary, { recursive: true, force: true });
    }
  }, 60000);
});
