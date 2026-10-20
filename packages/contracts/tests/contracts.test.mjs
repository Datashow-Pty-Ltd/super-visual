import { describe, expect, it } from "vitest";
import { evaluateLiveCertification, resolveProjectPath, validateContract } from "../src/index.mjs";

const project = {
  contractVersion: 1,
  application: { id: "sample", title: "Sample", entry: "src/App.tsx", style: "style/app.less" },
  target: { platform: "powerbi", visual: { name: "sampleVisual", displayName: "Sample", guid: "sampleVisualABC123", version: "0.1.0.0", apiVersion: "5.11.1" } },
  semantic: { model: "semantic/model.yaml", broker: "semantic/broker.json", pageSet: "semantic/pages.yaml" },
  source: { bundle: "report-source.json" },
  output: { directory: "dist" },
  compliance: { policies: ["core", "powerbi"] },
};

describe("public contracts", () => {
  it("accepts a complete v1 project", () => {
    expect(validateContract("supervisual-project", project)).toEqual({ ok: true, errors: [] });
  });

  it("rejects paths that escape the project", () => {
    expect(validateContract("supervisual-project", { ...project, source: { bundle: "../private.json" } }).ok).toBe(false);
    expect(() => resolveProjectPath("/tmp/project", "../private.json")).toThrow(/escapes/);
  });

  it("accepts the documented Claude Dashboard intake contract", () => {
    const bundle = {
      contractVersion: 1,
      format: "claude-dashboard-bundle",
      name: "sample-dashboard",
      entry: { html: "dashboard.html", css: "dashboard.css", script: "dashboard.js" },
      datasets: [{ id: "sales", dimensions: [{ column: "category", dimensionIndex: 0 }], measures: [{ column: "sales", seriesKey: "[Sales]" }] }],
      routes: [{ id: "overview", title: "Overview", datasets: ["sales"] }],
    };
    expect(validateContract("claude-dashboard-bundle", bundle)).toEqual({ ok: true, errors: [] });
  });

  it("grades complete and incomplete live certification evidence", () => {
    const record = {
      contractVersion: 1,
      kind: "super-visual-live-certification",
      recordedAt: "2026-10-20T08:00:00Z",
      commit: "a".repeat(40),
      operator: "test operator",
      environment: "disposable-sandbox",
      workspace: { id: "workspace-1", displayName: "Sandbox" },
      plan: { id: "b".repeat(20), operations: ["create"] },
      items: { semanticModelId: "model-1", reportId: "report-1" },
      connectionId: "connection-1",
      cli: { status: "accepted", connectionBinding: true, reportBinding: true, refresh: "Completed", acceptance: { rowCount: 1, columnCount: 2, nonNull: true } },
      browser: { reportOpens: true, visualRenders: true, labelsAndValues: true, keyboardNavigation: true, selectionInteraction: true, noUnexpectedErrors: true },
      evidence: [{ kind: "receipt", reference: "receipt.json", sha256: "c".repeat(64) }, { kind: "screenshot", reference: "report.png", sha256: "d".repeat(64) }],
    };
    expect(evaluateLiveCertification(record).status).toBe("certified");
    expect(evaluateLiveCertification({ ...record, browser: { ...record.browser, keyboardNavigation: false } })).toMatchObject({ ok: false, status: "incomplete" });
  });
});
