import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { loadContract, resolveProjectPath } from "@datashow/super-visual-contracts";
import { compileBrokerAdapter, compileTmdl } from "@datashow/super-visual-semantic";
import { generateRuntimeManifests, validateCompilation } from "./index.mjs";
import { generateReportWrapper } from "./report-wrapper.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeSource = path.resolve(packageRoot, "../runtime-powerbi/src");
const visualTemplate = path.join(packageRoot, "template", "visual");

async function readStructured(file) {
  const source = await readFile(file, "utf8");
  return file.endsWith(".json") ? JSON.parse(source) : YAML.parse(source);
}

async function files(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...await files(root, child));
    else output.push(child);
  }
  return output.sort();
}

async function hashes(root) {
  const output = {};
  for (const relative of await files(root)) {
    if (relative === "supervisual.manifest.json") continue;
    output[relative.split(path.sep).join("/")] = createHash("sha256").update(await readFile(path.join(root, relative))).digest("hex");
  }
  return output;
}

export async function refreshSolutionManifest(outputDirectory) {
  const manifestPath = path.join(outputDirectory, "supervisual.manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.files = await hashes(outputDirectory);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function verifySolutionManifest(outputDirectory) {
  const manifestPath = path.join(outputDirectory, "supervisual.manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const actual = await hashes(outputDirectory);
  const expected = manifest.files ?? {};
  const missing = Object.keys(expected).filter((file) => !(file in actual));
  const unexpected = Object.keys(actual).filter((file) => !(file in expected));
  const changed = Object.keys(expected).filter((file) => actual[file] && actual[file] !== expected[file]);
  return { ok: missing.length === 0 && unexpected.length === 0 && changed.length === 0, missing, unexpected, changed, fileCount: Object.keys(actual).length };
}

async function generateVisual(project, inputs, visualRoot) {
  await cp(visualTemplate, visualRoot, { recursive: true });
  await cp(runtimeSource, path.join(visualRoot, "src"), { recursive: true });
  await generateRuntimeManifests(inputs, visualRoot);
  const pbivizPath = path.join(visualRoot, "pbiviz.json");
  const pbiviz = JSON.parse(await readFile(pbivizPath, "utf8"));
  pbiviz.visual = { ...pbiviz.visual, ...project.target.visual };
  pbiviz.apiVersion = project.target.visual.apiVersion;
  await writeFile(pbivizPath, `${JSON.stringify(pbiviz, null, 2)}\n`);
  const packagePath = path.join(visualRoot, "package.json");
  const manifest = JSON.parse(await readFile(packagePath, "utf8"));
  manifest.name = `${project.application.id}-powerbi`;
  manifest.version = project.target.visual.version.split(".").slice(0, 3).join(".");
  await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
  return visualRoot;
}

export async function loadProject(projectFile) {
  const root = path.dirname(path.resolve(projectFile));
  const project = await loadContract("supervisual-project", path.resolve(projectFile));
  const semanticModel = await readStructured(resolveProjectPath(root, project.semantic.model));
  const broker = await loadContract("widget-broker", resolveProjectPath(root, project.semantic.broker));
  const pageSet = await loadContract("page-set", resolveProjectPath(root, project.semantic.pageSet));
  const reportSource = await loadContract("report-source-bundle", resolveProjectPath(root, project.source.bundle));
  return { root, project, semanticModel, broker, pageSet, reportSource };
}

export async function buildSolution(projectFile, options = {}) {
  const loaded = await loadProject(projectFile);
  const { root, project, semanticModel, broker, pageSet, reportSource } = loaded;
  const diagnostics = validateCompilation({ semanticModel, broker, pageSet, reportSource });
  if (diagnostics.length) throw new Error(`Compilation failed:\n- ${diagnostics.join("\n- ")}`);
  const output = options.outputDirectory ?? resolveProjectPath(root, project.output.directory);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const baseModel = path.join(output, "Base.SemanticModel");
  const adapterModel = path.join(output, "SemanticAdapter.SemanticModel");
  const visual = path.join(output, "Visual");
  const report = path.join(output, "Report.Report");
  await compileTmdl(semanticModel, baseModel);
  await compileBrokerAdapter({ baseModelDirectory: baseModel, outputDirectory: adapterModel, broker, semanticModel });
  await generateVisual(project, { broker, pageSet, reportSource }, visual);
  await generateReportWrapper({ outputDirectory: report, title: project.application.title, visualGuid: project.target.visual.guid });
  const manifest = {
    contractVersion: 1,
    application: project.application,
    target: project.target,
    inputs: { project: path.basename(projectFile), semanticModel: project.semantic.model, broker: project.semantic.broker, pageSet: project.semantic.pageSet, reportSource: project.source.bundle },
    outputs: { baseModel: "Base.SemanticModel", semanticAdapter: "SemanticAdapter.SemanticModel", visualSource: "Visual", report: "Report.Report" },
    provenance: { compiler: "@datashow/super-visual-compiler", reference: "AdventureWorks deployed v38" },
    files: await hashes(output),
  };
  await writeFile(path.join(output, "supervisual.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { outputDirectory: output, diagnostics: [], manifest };
}
