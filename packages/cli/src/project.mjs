import { createHash, randomUUID } from "node:crypto";
import { access, cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProject, validateCompilation, verifySolutionManifest } from "@datashow/super-visual-compiler";
import { inspectClaudeDashboard } from "@datashow/super-visual-adapter-claude-dashboard";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatesRoot = path.join(packageRoot, "templates");

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "") || "super-visual-project";
}

function displayTitle(value) {
  return value.split("-").map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(" ");
}

export function supportedTemplates() {
  return [{ id: "hello-world", description: "One page, one dataset, one measure, and one accessible bar chart.", status: "supported" }];
}

export function supportedAdapters() {
  return [
    { id: "react-source-bundle", input: "report-source-bundle.v1", status: "supported" },
    { id: "claude-dashboard", input: "claude-dashboard-bundle.v1", status: "supported", note: "Super Visual's documented intake contract; not an Anthropic export standard." },
  ];
}

async function classifyFile(file) {
  const extension = path.extname(file).toLowerCase();
  if (path.basename(file) === "supervisual.yaml") return { type: "supervisual-project", supported: true, projectFile: file };
  if (path.basename(file) === "claude-dashboard.json") return { type: "claude-dashboard-bundle", supported: true, adapter: "claude-dashboard", manifestPath: file };
  if ([".html", ".htm", ".js", ".zip"].includes(extension)) return { type: "dashboard-source", supported: false, adapter: "claude-dashboard", reason: "Use a directory containing the documented claude-dashboard.json manifest" };
  return { type: "unknown", supported: false };
}

export async function discoverInput(input = ".") {
  const resolved = path.resolve(input);
  let metadata;
  try { metadata = await stat(resolved); } catch { return { ok: false, input: resolved, type: "missing", supported: false, diagnostics: [`Input does not exist: ${resolved}`] }; }
  let result;
  if (metadata.isFile()) result = await classifyFile(resolved);
  else if (await exists(path.join(resolved, "supervisual.yaml"))) result = { type: "supervisual-project", supported: true, projectFile: path.join(resolved, "supervisual.yaml") };
  else {
    const names = await readdir(resolved);
    const sourceSignals = names.filter((name) => /^(?:claude-dashboard\.json|index\.html|application\.js|dashboard\.js|dashboard\.json|package\.json)$/i.test(name));
    result = names.includes("claude-dashboard.json")
      ? { type: "claude-dashboard-bundle", supported: true, adapter: "claude-dashboard", manifestPath: path.join(resolved, "claude-dashboard.json"), signals: sourceSignals }
      : sourceSignals.length
      ? { type: "dashboard-source-directory", supported: false, adapter: "claude-dashboard", signals: sourceSignals, reason: "Add a documented claude-dashboard.json manifest" }
      : { type: "directory", supported: false, signals: [] };
  }
  if (result.type === "claude-dashboard-bundle") {
    try {
      const inspected = await inspectClaudeDashboard(result.manifestPath);
      return { ok: inspected.ok, input: resolved, ...result, dashApis: inspected.dashApis, dataReads: inspected.dataReads, assets: inspected.assetReferences, diagnostics: inspected.diagnostics };
    } catch (error) {
      return { ok: false, input: resolved, ...result, supported: false, diagnostics: [error instanceof Error ? error.message : String(error)] };
    }
  }
  return { ok: result.supported, input: resolved, ...result };
}

export async function inspectProject(projectFile) {
  const loaded = await loadProject(projectFile);
  const diagnostics = validateCompilation(loaded);
  const outputDirectory = path.resolve(loaded.root, loaded.project.output.directory);
  let outputState = { exists: false };
  if (await exists(path.join(outputDirectory, "supervisual.manifest.json"))) outputState = { exists: true, ...await verifySolutionManifest(outputDirectory) };
  return {
    ok: diagnostics.length === 0,
    projectFile: path.resolve(projectFile),
    application: { id: loaded.project.application.id, title: loaded.project.application.title },
    target: loaded.project.target,
    capabilities: {
      pages: loaded.pageSet.pages.map((page) => page.id),
      datasets: loaded.broker.widgets.map((widget) => widget.id),
      semanticTables: loaded.semanticModel.tables.map((table) => table.name),
      policies: loaded.project.compliance?.policies ?? ["core", "powerbi"],
    },
    diagnostics,
    output: { directory: outputDirectory, ...outputState },
  };
}

async function replaceTemplateTokens(root, replacements, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) await replaceTemplateTokens(root, replacements, child);
    else {
      const file = path.join(root, child);
      let content = await readFile(file, "utf8");
      for (const [token, value] of Object.entries(replacements)) content = content.replaceAll(`{{${token}}}`, value);
      await writeFile(file, content);
    }
  }
}

export async function initializeProject({ directory, template = "hello-world", name, title, force = false }) {
  if (!supportedTemplates().some((candidate) => candidate.id === template)) throw new Error(`Unknown template ${template}`);
  const target = path.resolve(directory);
  if (await exists(target)) {
    const metadata = await stat(target);
    if (!metadata.isDirectory()) throw new Error(`Target exists and is not a directory: ${target}`);
    const entries = await readdir(target);
    if (entries.length || !force) throw new Error(`Target directory already exists${entries.length ? " and is not empty" : ""}; choose another path or use --force for an empty directory`);
  } else await mkdir(target, { recursive: true });
  const projectId = slug(name ?? path.basename(target));
  const projectTitle = title ?? displayTitle(projectId);
  const visualSuffix = randomUUID().replaceAll("-", "").toUpperCase();
  const visualName = `${projectId.replace(/[^A-Za-z0-9]/g, "")}Visual`;
  const visualGuid = `superVisual${visualSuffix}`;
  await cp(path.join(templatesRoot, template), target, { recursive: true });
  await replaceTemplateTokens(target, {
    PROJECT_ID: projectId,
    PROJECT_TITLE: projectTitle,
    VISUAL_NAME: visualName,
    VISUAL_GUID: visualGuid,
  });
  const style = await readFile(path.join(target, "source", "report-design.less"), "utf8");
  const designHash = createHash("sha256").update(style).digest("hex");
  await replaceTemplateTokens(target, { DESIGN_HASH: designHash });
  const bundlePath = path.join(target, "contracts", "report-source.json");
  const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
  bundle.designSystem.sha256 = designHash;
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
  const inspection = await inspectProject(path.join(target, "supervisual.yaml"));
  if (!inspection.ok) throw new Error(`Generated project did not validate:\n- ${inspection.diagnostics.join("\n- ")}`);
  return { ok: true, directory: target, projectFile: path.join(target, "supervisual.yaml"), template, application: inspection.application, next: [`supervisual check ${target}`, `supervisual build ${target}`, `supervisual package ${target}`] };
}
