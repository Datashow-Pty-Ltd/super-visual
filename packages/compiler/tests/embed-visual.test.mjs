import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { describe, expect, test } from "vitest";
import { embedVisualPackage } from "../src/index.mjs";

test("embeds a packaged visual into the PBIR resource collection", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "supervisual-pbiviz-"));
  const report = path.join(root, "Report.Report");
  await mkdir(path.join(report, "definition"), { recursive: true });
  await writeFile(path.join(report, "definition", "report.json"), JSON.stringify({ resourcePackages: [] }));
  const visualPackage = { visual: { guid: "testVisualABC" }, resources: [{ file: "resources/testVisualABC.pbiviz.json" }] };
  const archive = zipSync({ "package.json": strToU8(JSON.stringify(visualPackage)), "resources/testVisualABC.pbiviz.json": strToU8("{}") });
  const archivePath = path.join(root, "test.pbiviz");
  await writeFile(archivePath, archive);
  await embedVisualPackage(archivePath, report);
  const reportJson = JSON.parse(await readFile(path.join(report, "definition", "report.json"), "utf8"));
  expect(reportJson.resourcePackages[0].name).toBe("testVisualABC");
  expect(await readFile(path.join(report, "CustomVisuals", "testVisualABC", "resources", "testVisualABC.pbiviz.json"), "utf8")).toBe("{}");
});
