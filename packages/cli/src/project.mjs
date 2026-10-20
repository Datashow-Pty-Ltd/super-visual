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

async function readOptional(file) {
  try { return await readFile(file, "utf8"); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
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
  return [
    { id: "blank", description: "A clean full-page React canvas with the minimum governed model binding.", status: "supported" },
    { id: "hello-world", description: "A searchable semantic-model catalog that proves the governed data connection.", status: "supported" },
  ];
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

const blankApplication = `import { useEffect, type ReactElement } from "react";
import type { ReportApplicationProps } from "./reportRuntime";

export function ReportApplication({ model, onVisibleDatasetsChange }: ReportApplicationProps): ReactElement {
  useEffect(() => onVisibleDatasetsChange?.(["sales"]), [onVisibleDatasetsChange]);
  const rowCount = model.datasets.sales?.points.length ?? 0;

  return <main className="supervisual-page">
    <p className="eyebrow">Super Visual</p>
    <h1>{{PROJECT_TITLE}}</h1>
    <p>Your full-page React canvas is ready and bound to the semantic provider.</p>
    <p className="status" role="status">{rowCount ? "Received " + rowCount + " semantic rows." : "Waiting for semantic data…"}</p>
  </main>;
}
`;

const blankStyle = `.supervisual-page { box-sizing: border-box; min-height: 100%; padding: 40px; color: #173c36; background: #f4f7f5; font-family: Aptos, "Segoe UI", sans-serif; }
.supervisual-page .eyebrow { margin: 0 0 8px; color: #167d6c; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.supervisual-page h1 { margin: 0; font: 600 clamp(36px, 6vw, 64px)/1 Georgia, serif; }
.supervisual-page .status { margin-top: 28px; color: #5e6d68; }
`;

const blankReadme = (title) => `# ${title}

This is a clean full-page Super Visual project with the minimum governed
semantic binding. Build the page in \`source/reportApplication.tsx\` and define
its named datasets under \`contracts/\`.

With a workspace and deployed adapter saved during initialization:

\`\`\`bash
npx supervisual dev --open
npx supervisual publish
\`\`\`

Publish shows the exact Fabric plan and asks you to type its plan ID before it
changes the workspace.
`;

async function applicationFiles(input) {
  const resolved = path.resolve(input);
  let root = path.dirname(resolved);
  let entryPath = resolved;
  let entryContent;
  try {
    entryContent = await readFile(resolved, "utf8");
  } catch (error) {
    if (error?.code !== "EISDIR") throw error;
    root = resolved;
    entryPath = null;
    entryContent = null;
    for (const candidate of [path.join(root, "reportApplication.tsx"), path.join(root, "src", "reportApplication.tsx")]) {
      const content = await readOptional(candidate);
      if (content !== null) { entryPath = candidate; entryContent = content; break; }
    }
  }
  if (!entryPath || entryContent === null) throw new Error(`React application must contain reportApplication.tsx: ${resolved}`);
  const entryRoot = path.dirname(entryPath);
  const files = [{ path: "src/reportApplication.tsx", content: entryContent }];
  const reportRoot = path.join(entryRoot, "report");
  const addReportFiles = async (directory, relative = "") => {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const child = path.join(directory, item.name);
      const childRelative = path.posix.join(relative, item.name);
      if (item.isDirectory()) await addReportFiles(child, childRelative);
      else if (/\.(?:ts|tsx)$/.test(item.name)) files.push({ path: `src/report/${childRelative}`, content: await readFile(child, "utf8") });
    }
  };
  try {
    await addReportFiles(reportRoot);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const styleCandidates = [path.join(root, "report-design.less"), path.join(root, "style", "report-design.less"), path.join(entryRoot, "report-design.less")];
  let style = null;
  for (const candidate of styleCandidates) {
    style = await readOptional(candidate);
    if (style !== null) break;
  }
  return { files, style };
}

async function installApplication(target, input, projectTitle) {
  const imported = await applicationFiles(input);
  const sourceRoot = path.join(target, "source");
  await writeFile(path.join(sourceRoot, "reportApplication.tsx"), imported.files[0].content);
  for (const file of imported.files.slice(1)) {
    const destination = path.join(sourceRoot, file.path.slice("src/".length));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content);
  }
  if (imported.style) await writeFile(path.join(sourceRoot, "report-design.less"), imported.style);
  const bundlePath = path.join(target, "contracts", "report-source.json");
  const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
  const style = imported.style ?? await readFile(path.join(sourceRoot, "report-design.less"), "utf8");
  bundle.files = [...imported.files, { path: "style/report-design.less", content: style }];
  bundle.designRationale.direction = `${projectTitle} React application hosted as a governed full-page Super Visual.`;
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
}

export async function syncProjectSource(projectFile) {
  const loaded = await loadProject(projectFile);
  if (loaded.reportSource.adapter) return { ok: true, synced: false, reason: "adapter-managed-source" };
  const sourceRoot = path.join(loaded.root, "source");
  if (!await exists(sourceRoot)) return { ok: true, synced: false, reason: "source-directory-missing" };
  const imported = await applicationFiles(sourceRoot);
  const style = imported.style ?? loaded.reportSource.files.find((file) => file.path === "style/report-design.less")?.content;
  if (!style) throw new Error("React application source requires source/report-design.less");
  const sourceHash = createHash("sha256").update(style).digest("hex");
  const nextFiles = [...imported.files, { path: "style/report-design.less", content: style }];
  const nextBundle = { ...loaded.reportSource, designSystem: { ...loaded.reportSource.designSystem, sha256: sourceHash }, files: nextFiles };
  const changed = JSON.stringify(nextBundle) !== JSON.stringify(loaded.reportSource);
  if (!changed) return { ok: true, synced: false, files: nextFiles.length };
  const bundlePath = path.resolve(loaded.root, loaded.project.source.bundle);
  await writeFile(bundlePath, `${JSON.stringify(nextBundle, null, 2)}\n`);
  const pageSetPath = path.resolve(loaded.root, loaded.project.semantic.pageSet);
  const pageSet = await readFile(pageSetPath, "utf8");
  if (!/sha256:\s*[a-f0-9]{64}/.test(pageSet)) throw new Error(`Page set does not contain a design-system SHA-256: ${pageSetPath}`);
  await writeFile(pageSetPath, pageSet.replace(/sha256:\s*[a-f0-9]{64}/, `sha256: ${sourceHash}`));
  return { ok: true, synced: true, files: nextFiles.length, bundlePath, pageSetPath };
}

export async function initializeProject({ directory, template = "blank", name, title, app, force = false }) {
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
  if (template === "blank") {
    const entry = blankApplication.replaceAll("{{PROJECT_TITLE}}", projectTitle);
    await writeFile(path.join(target, "source", "reportApplication.tsx"), entry);
    await writeFile(path.join(target, "source", "report-design.less"), blankStyle);
    const bundlePath = path.join(target, "contracts", "report-source.json");
    const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
    bundle.designSystem.id = "super-visual-blank";
    bundle.files = [{ path: "src/reportApplication.tsx", content: entry }, { path: "style/report-design.less", content: blankStyle }];
    bundle.designRationale.direction = "A clean, full-page React canvas with a minimal governed semantic binding.";
    bundle.designRationale.dataVisualisation = ["No prescribed visualisation; the page reports semantic data readiness."];
    await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
    await writeFile(path.join(target, "README.md"), blankReadme(projectTitle));
  }
  if (app) await installApplication(target, app, projectTitle);
  const style = await readFile(path.join(target, "source", "report-design.less"), "utf8");
  const designHash = createHash("sha256").update(style).digest("hex");
  await replaceTemplateTokens(target, { DESIGN_HASH: designHash });
  const bundlePath = path.join(target, "contracts", "report-source.json");
  const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
  bundle.designSystem.sha256 = designHash;
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
  const inspection = await inspectProject(path.join(target, "supervisual.yaml"));
  if (!inspection.ok) throw new Error(`Generated project did not validate:\n- ${inspection.diagnostics.join("\n- ")}`);
  return { ok: true, directory: target, projectFile: path.join(target, "supervisual.yaml"), template, application: inspection.application, ...(app ? { reactApplication: path.resolve(app) } : {}), next: [`cd ${target}`, "supervisual dev", "supervisual publish"] };
}
