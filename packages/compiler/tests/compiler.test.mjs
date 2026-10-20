import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateRuntimeManifests } from "../src/index.mjs";

describe("runtime manifest generation", () => {
  it("materialises only datasets used by the page set", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "supervisual-compiler-"));
    const broker = { widgets: [
      { id: "sales", axis: "Product[Category]", rowSelection: "top-by-value", selectable: true, invalidates: ["trend"] },
      { id: "trend", axis: "Date[Month]", rowSelection: "first-by-axis", selectable: false, invalidates: [] },
      { id: "unused", axis: "Product[Product]", rowSelection: "top-by-value", selectable: false, invalidates: [] },
    ] };
    const pageSet = { pages: [{ id: "overview", summary: {}, kpis: [], widgets: [{ id: "chart", dataset: "sales" }] }], interactions: [{ invalidates: ["trend"] }] };
    const reportSource = { files: [{ path: "src/reportApplication.tsx", content: "export function ReportApplication() { return null; }" }, { path: "style/report-design.less", content: "" }] };
    const result = await generateRuntimeManifests({ broker, pageSet, reportSource }, output);
    expect(result.datasets).toEqual(["sales", "trend"]);
    expect(await readFile(path.join(output, "src/datasetRegistry.ts"), "utf8")).not.toContain("unused");
  });
});
