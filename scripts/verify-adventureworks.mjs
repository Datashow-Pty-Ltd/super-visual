import { cp, mkdtemp, mkdir, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { buildSolution, embedVisualPackage, refreshSolutionManifest } from "../packages/compiler/src/index.mjs";

const run = promisify(execFile);
const root = path.resolve("examples/adventureworks");
await run(process.execPath, [path.join(root, "scripts", "build-source-bundle.mjs")]);
const result = await buildSolution(path.join(root, "supervisual.yaml"));
const brokerTable = path.join(result.outputDirectory, "SemanticAdapter.SemanticModel", "definition", "tables", "Widget Axis.tmdl");
const visualSource = path.join(result.outputDirectory, "Visual");
const packageRequested = process.argv.includes("--package");
let pbiviz = null;

if (packageRequested) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-adventureworks-"));
  const buildVisual = path.join(temporary, "Visual");
  await cp(visualSource, buildVisual, { recursive: true });
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: buildVisual, maxBuffer: 10 * 1024 * 1024 });
  await run("npm", ["run", "typecheck"], { cwd: buildVisual, maxBuffer: 10 * 1024 * 1024 });
  await run("npm", ["run", "package"], { cwd: buildVisual, maxBuffer: 20 * 1024 * 1024 });
  const packageName = (await readdir(path.join(buildVisual, "dist"))).find((name) => name.endsWith(".pbiviz"));
  if (!packageName) throw new Error("AdventureWorks visual package was not produced");
  const artifacts = path.join(result.outputDirectory, "Artifacts");
  await mkdir(artifacts, { recursive: true });
  pbiviz = path.join(artifacts, packageName);
  await cp(path.join(buildVisual, "dist", packageName), pbiviz);
  await embedVisualPackage(pbiviz, path.join(result.outputDirectory, "Report.Report"));
  await refreshSolutionManifest(result.outputDirectory);
}

await Promise.all([
  import("node:fs/promises").then(({ access }) => access(brokerTable)),
  import("node:fs/promises").then(({ access }) => access(path.join(visualSource, "src", "reportApplication.tsx"))),
  import("node:fs/promises").then(({ access }) => access(path.join(result.outputDirectory, "Report.Report", "definition.pbir"))),
]);
process.stdout.write(`AdventureWorks verified: ${Object.keys((await refreshSolutionManifest(result.outputDirectory)).files).length} files${pbiviz ? `, packaged ${path.basename(pbiviz)}` : ""}\n`);
