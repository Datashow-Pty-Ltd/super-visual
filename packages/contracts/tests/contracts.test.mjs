import { describe, expect, it } from "vitest";
import { resolveProjectPath, validateContract } from "../src/index.mjs";

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
});
