import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { importClaudeDashboard, inspectClaudeDashboard, inspectClaudeDashboardSourcePolicy } from "../src/index.mjs";
import { initializeProject } from "../../cli/src/project.mjs";

const root = path.resolve(".");
const fixture = path.join(root, "examples", "claude-dashboard-bundle");

describe("Claude Dashboard adapter", () => {
  test("exposes the pure source-policy state machine", () => {
    const result = inspectClaudeDashboardSourcePolicy({
      manifest: {
        entry: { html: "index.html", css: "style.css", script: "dashboard.js" },
        datasets: [{ id: "sales" }],
        routes: [{ id: "overview", datasets: ["sales", "missing"] }],
        assets: ["assets/mark.svg"],
      },
      sources: {
        html: '<img src="assets/mark.svg"><iframe src="https://example.com"></iframe>',
        css: "",
        script: 'dash.data("sales"); dash.unknown(); fetch("https://example.com");',
      },
    });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "claude/unsafe-html" }),
      expect.objectContaining({ code: "claude/no-network" }),
      expect.objectContaining({ code: "claude/unsupported-api" }),
      expect.objectContaining({ code: "claude/unknown-route-dataset" }),
      expect.objectContaining({ code: "claude/external-asset" }),
    ]));
    expect(result).toMatchObject({ dataReads: ["sales"], assetReferences: ["assets/mark.svg"] });
  });

  test("rejects malformed schemes and traversal before asset resolution", () => {
    const result = inspectClaudeDashboardSourcePolicy({
      manifest: {
        entry: { html: "index.html", css: "style.css", script: "dashboard.js" },
        datasets: [{ id: "sales" }],
        routes: [{ id: "overview", datasets: ["sales"] }],
        assets: ["assets/mark.svg", "../declared.svg"],
      },
      sources: {
        html: '<img src="httus:../../outside.svg"><img src="%2e%2e/outside.svg">',
        css: "",
        script: 'dash.data("sales");',
      },
    });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "claude/external-asset", message: expect.stringContaining("httus:") }),
      expect.objectContaining({ code: "claude/unsafe-asset-path", message: expect.stringContaining("%2e%2e") }),
      expect.objectContaining({ code: "claude/unsafe-asset-path", message: expect.stringContaining("../declared.svg") }),
    ]));
    expect(result.assetReferences).toEqual([]);
  });

  test("scans adversarial CSS URL prefixes in linear time", () => {
    const result = inspectClaudeDashboardSourcePolicy({
      manifest: {
        entry: { html: "index.html", css: "style.css", script: "dashboard.js" },
        datasets: [{ id: "sales" }],
        routes: [{ id: "overview", datasets: ["sales"] }],
        assets: [],
      },
      sources: { html: "", css: `url(${"!url(".repeat(20_000)}`, script: 'dash.data("sales");' },
    });
    expect(result.assetReferences).toEqual([]);
  });

  test("statically discovers APIs, datasets, and local assets", async () => {
    const result = await inspectClaudeDashboard(fixture);
    expect(result).toMatchObject({ ok: true, dataReads: ["sales"], assetReferences: ["assets/mark.svg"] });
    expect(result.dashApis).toEqual(expect.arrayContaining(["data", "format", "onData", "resetParams", "setParams"]));
  });

  test("rejects runtime network access", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-claude-unsafe-"));
    try {
      await cp(fixture, temporary, { recursive: true });
      const script = path.join(temporary, "dashboard.js");
      await writeFile(script, `${await readFile(script, "utf8")}\nfetch("https://example.com");\n`);
      const result = await inspectClaudeDashboard(temporary);
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "claude/no-network" })]));
    } finally { await rm(temporary, { recursive: true, force: true }); }
  });

  test("imports a permitted bundle into an initialized project", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-claude-import-"));
    const project = path.join(temporary, "dashboard");
    try {
      await initializeProject({ directory: project, title: "Imported Dashboard" });
      const result = await importClaudeDashboard({ input: fixture, projectFile: path.join(project, "supervisual.yaml") });
      expect(result).toMatchObject({ ok: true, adapter: "claude-dashboard", datasets: ["sales"], routes: ["overview"] });
      const source = JSON.parse(await readFile(path.join(project, "contracts", "report-source.json"), "utf8"));
      expect(source.adapter).toMatchObject({ kind: "claude-dashboard", source: "supervisual-claude-dashboard-bundle.v1" });
      expect(source.adapter.assets[0].sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(source.files.find((file) => file.path.endsWith("generated.ts")).content).toContain("data:image/svg+xml;base64,");
    } finally { await rm(temporary, { recursive: true, force: true }); }
  });
});
