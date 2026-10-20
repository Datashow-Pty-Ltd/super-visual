import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { transformSync } from "esbuild";
import { loadContract, resolveProjectPath } from "@datashow/super-visual-contracts";
import { validateSourceBundle } from "@datashow/super-visual-compliance";

const MANIFEST_NAME = "claude-dashboard.json";
const SUPPORTED_DASH_APIS = new Set(["data", "onData", "calc", "format", "scale", "ticks", "path", "svg", "refresh", "params", "setParams", "resetParams", "setLink", "colors"]);
const MIME_TYPES = new Map([[".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".gif", "image/gif"], [".webp", "image/webp"], [".svg", "image/svg+xml"], [".woff", "font/woff"], [".woff2", "font/woff2"]]);
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 8 * 1024 * 1024;

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function normalPath(value) { return String(value).split(path.sep).join("/"); }
function cssUrlReferences(css) {
  const references = [];
  const lower = css.toLowerCase();
  let cursor = 0;
  while (cursor < css.length) {
    const start = lower.indexOf("url(", cursor);
    if (start === -1) break;
    cursor = start + 4;
    while (cursor < css.length && /\s/.test(css[cursor])) cursor += 1;
    const quote = css[cursor] === '"' || css[cursor] === "'" ? css[cursor++] : null;
    const valueStart = cursor;
    while (cursor < css.length && (quote ? css[cursor] !== quote : css[cursor] !== ")" && !/\s|["']/.test(css[cursor]))) cursor += 1;
    const value = css.slice(valueStart, cursor);
    if (quote) {
      if (css[cursor] !== quote) continue;
      cursor += 1;
    }
    while (cursor < css.length && /\s/.test(css[cursor])) cursor += 1;
    if (css[cursor] !== ")") continue;
    cursor += 1;
    if (value) references.push(value);
  }
  return references;
}
function sourceReferences(html, css) {
  const references = [];
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) references.push(match[1]);
  references.push(...cssUrlReferences(css));
  return [...new Set(references.filter((value) => value && !value.startsWith("#")))];
}
function isExternalReference(reference) { return /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/i.test(reference); }
function safeLocalAssetPath(reference) {
  const raw = String(reference).split(/[?#]/)[0];
  if (!raw || raw.includes("\\") || raw.includes("\0") || raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) return null;
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { return null; }
  if (!decoded || decoded.includes("\\") || decoded.includes("\0") || decoded.startsWith("/") || isExternalReference(decoded)) return null;
  const segments = decoded.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return raw;
}
function dashApis(script) { return [...new Set([...script.matchAll(/\bdash\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]))].sort(); }
function dataReads(script) { return [...new Set([...script.matchAll(/\bdash\.data\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]))].sort(); }
function sourceDiagnostic(code, file, message) { return { code, path: file, message }; }

export function inspectClaudeDashboardSourcePolicy({ manifest, sources, syntaxDiagnostics = [], manifestName = MANIFEST_NAME }) {
  const { html, css, script } = sources;
  const diagnostics = [];
  if (/<\s*(?:script|iframe|object|embed)\b/i.test(html)) diagnostics.push(sourceDiagnostic("claude/unsafe-html", manifest.entry.html, "embedded executable content is not supported"));
  if (/\son[a-z]+\s*=/i.test(html)) diagnostics.push(sourceDiagnostic("claude/inline-handler", manifest.entry.html, "inline event handlers are not supported"));
  if (/@import\b|expression\s*\(/i.test(css)) diagnostics.push(sourceDiagnostic("claude/unsafe-css", manifest.entry.css, "CSS imports and expressions are not supported"));
  const forbiddenScript = [
    ["claude/no-network", /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/, "runtime network access"],
    ["claude/no-dynamic-code", /\b(?:eval|Function)\s*\(/, "dynamic code execution"],
    ["claude/no-storage", /\b(?:localStorage|sessionStorage|indexedDB)\b/, "browser storage"],
    ["claude/no-module", /(^|\n)\s*(?:import|export)\b/, "module syntax in a mount-function body"],
    ["claude/no-navigation", /\b(?:window\.open|location\s*=|location\.(?:assign|replace))\b/, "top-level browser navigation"],
  ];
  for (const [code, pattern, message] of forbiddenScript) if (pattern.test(script)) diagnostics.push(sourceDiagnostic(code, manifest.entry.script, `contains forbidden ${message}`));
  diagnostics.push(...syntaxDiagnostics);
  const apis = dashApis(script);
  for (const api of apis) if (!SUPPORTED_DASH_APIS.has(api)) diagnostics.push(sourceDiagnostic("claude/unsupported-api", manifest.entry.script, `dash.${api} is not supported by adapter v1`));
  if (/\bdash\.loader\b/.test(script)) diagnostics.push(sourceDiagnostic("claude/unsupported-loader", manifest.entry.script, "dash.loader requires an external tool runtime and cannot run in a Power BI custom visual"));
  const literalReads = dataReads(script);
  const declared = new Set(manifest.datasets.map((dataset) => dataset.id));
  for (const id of literalReads) if (!declared.has(id)) diagnostics.push(sourceDiagnostic("claude/unknown-dataset", manifest.entry.script, `dash.data reads undeclared dataset ${id}`));
  const dataCalls = [...script.matchAll(/\bdash\.data\s*\(/g)].length;
  if (dataCalls !== [...script.matchAll(/\bdash\.data\(\s*["'][^"']+["']\s*\)/g)].length) diagnostics.push(sourceDiagnostic("claude/dynamic-dataset", manifest.entry.script, "dash.data identifiers must be string literals for static binding"));
  for (const route of manifest.routes) for (const id of route.datasets) if (!declared.has(id)) diagnostics.push(sourceDiagnostic("claude/unknown-route-dataset", manifestName, `route ${route.id} references undeclared dataset ${id}`));
  const references = sourceReferences(html, css);
  for (const reference of references) if (isExternalReference(reference)) diagnostics.push(sourceDiagnostic("claude/external-asset", manifestName, `external or inline asset reference is not permitted: ${reference}`));
  const declaredAssets = new Set();
  for (const asset of manifest.assets ?? []) {
    const safe = safeLocalAssetPath(asset);
    if (!safe) diagnostics.push(sourceDiagnostic("claude/unsafe-asset-path", manifestName, `asset path is not permitted: ${asset}`));
    else declaredAssets.add(safe);
  }
  const localReferences = [];
  const referencedAssets = new Set();
  for (const reference of references.filter((value) => !isExternalReference(value))) {
    const safe = safeLocalAssetPath(reference);
    if (!safe) {
      diagnostics.push(sourceDiagnostic("claude/unsafe-asset-path", manifestName, `asset reference is not permitted: ${reference}`));
      continue;
    }
    localReferences.push(reference);
    referencedAssets.add(safe);
    if (!declaredAssets.has(safe)) diagnostics.push(sourceDiagnostic("claude/undeclared-asset", manifestName, `asset must be declared in assets: ${safe}`));
  }
  for (const asset of declaredAssets) if (!referencedAssets.has(asset)) diagnostics.push(sourceDiagnostic("claude/unused-asset", manifestName, `declared asset is not referenced: ${asset}`));
  return { diagnostics, dashApis: apis, dataReads: literalReads, assetReferences: localReferences };
}

export async function inspectClaudeDashboard(input) {
  const resolved = path.resolve(input);
  const metadata = await stat(resolved);
  const manifestPath = metadata.isDirectory() ? path.join(resolved, MANIFEST_NAME) : resolved;
  const root = path.dirname(manifestPath);
  const manifest = await loadContract("claude-dashboard-bundle", manifestPath);
  const [html, css, script] = await Promise.all([manifest.entry.html, manifest.entry.css, manifest.entry.script].map(async (relative) => {
    const file = resolveProjectPath(root, relative);
    const content = await readFile(file);
    if (content.length > MAX_SOURCE_BYTES) throw new Error(`Claude Dashboard source exceeds ${MAX_SOURCE_BYTES} bytes: ${relative}`);
    return content.toString("utf8");
  }));
  const syntaxDiagnostics = [];
  try { transformSync(`function __supervisual_mount({ root, dash, d3 }) {\n${script}\n}`, { loader: "js", sourcefile: manifest.entry.script, logLevel: "silent" }); }
  catch (error) { for (const detail of error?.errors ?? [{ text: String(error) }]) syntaxDiagnostics.push({ ...sourceDiagnostic("claude/javascript-syntax", manifest.entry.script, detail.text), ...(detail.location?.line ? { line: Math.max(1, detail.location.line - 1) } : {}) }); }
  const policy = inspectClaudeDashboardSourcePolicy({ manifest, sources: { html, css, script }, syntaxDiagnostics });
  return { ok: policy.diagnostics.length === 0, input: root, manifestPath, manifest, sources: { html, css, script }, ...policy };
}

async function vendorAssets(inspection) {
  let html = inspection.sources.html;
  let css = inspection.sources.css;
  let total = 0;
  const assets = [];
  for (const reference of inspection.assetReferences) {
    const relative = normalPath(path.posix.normalize(reference.split(/[?#]/)[0]));
    const extension = path.extname(relative).toLowerCase();
    const mediaType = MIME_TYPES.get(extension);
    if (!mediaType) throw new Error(`Unsupported Claude Dashboard asset type: ${relative}`);
    const content = await readFile(resolveProjectPath(inspection.input, relative));
    if (content.length > MAX_ASSET_BYTES) throw new Error(`Claude Dashboard asset exceeds ${MAX_ASSET_BYTES} bytes: ${relative}`);
    total += content.length;
    if (total > MAX_TOTAL_ASSET_BYTES) throw new Error(`Claude Dashboard assets exceed ${MAX_TOTAL_ASSET_BYTES} bytes in total`);
    if (extension === ".svg" && /<\s*script\b|\son[a-z]+\s*=|\b(?:href|src)\s*=\s*["'](?:https?:|\/\/)/i.test(content.toString("utf8"))) throw new Error(`SVG asset contains executable or external content: ${relative}`);
    const dataUri = `data:${mediaType};base64,${content.toString("base64")}`;
    html = html.replaceAll(reference, dataUri);
    css = css.replaceAll(reference, dataUri);
    assets.push({ path: relative, sha256: sha256(content), mediaType, bytes: content.length });
  }
  return { html, css, assets };
}

function generatedApplication(bundleModule = "./report/claudeDashboard.generated") {
  return `import type { ReactElement } from "react";\nimport type { ReportApplicationProps } from "./reportRuntime";\nimport { ClaudeDashboardApplication } from "./claudeDashboard";\nimport { CLAUDE_DASHBOARD_BINDINGS, CLAUDE_DASHBOARD_BUNDLE, CLAUDE_DASHBOARD_DEFAULT_PARAMS } from "${bundleModule}";\n\nexport function ReportApplication(props: ReportApplicationProps): ReactElement {\n  void props.model.datasets;\n  void props.onVisibleDatasetsChange;\n  return <ClaudeDashboardApplication {...props} bundle={CLAUDE_DASHBOARD_BUNDLE} bindings={CLAUDE_DASHBOARD_BINDINGS} defaultParams={CLAUDE_DASHBOARD_DEFAULT_PARAMS} />;\n}\n`;
}
function generatedBundle(inspection, vendored) {
  return `// @ts-nocheck\n// Generated by @datashow/super-visual-adapter-claude-dashboard. Do not edit by hand.\nimport type { ClaudeDatasetBinding } from "../claudeDashboard/materialize";\nimport type { ClaudeDashboardBundle } from "../claudeDashboard/surface";\nimport type { ClaudeParams } from "../claudeDashboard/types";\n\nexport const CLAUDE_DASHBOARD_BINDINGS: readonly ClaudeDatasetBinding[] = ${JSON.stringify(inspection.manifest.datasets, null, 2)};\nexport const CLAUDE_DASHBOARD_DEFAULT_PARAMS: ClaudeParams = ${JSON.stringify(inspection.manifest.defaultParams ?? {}, null, 2)};\nexport const CLAUDE_DASHBOARD_BUNDLE: ClaudeDashboardBundle = {\n  html: ${JSON.stringify(vendored.html)},\n  css: ${JSON.stringify(vendored.css)},\n  mount: ({ root, dash, d3 }) => {\n${inspection.sources.script.split("\n").map((line) => `    ${line}`).join("\n")}\n  },\n};\n`;
}

export async function importClaudeDashboard({ input, projectFile }) {
  const inspection = await inspectClaudeDashboard(input);
  if (!inspection.ok) throw new Error(`Claude Dashboard intake failed:\n${inspection.diagnostics.map((diagnostic) => `- ${diagnostic.code}: ${diagnostic.path} ${diagnostic.message}`).join("\n")}`);
  const project = await loadContract("supervisual-project", projectFile);
  const projectRoot = path.dirname(path.resolve(projectFile));
  const broker = await loadContract("widget-broker", resolveProjectPath(projectRoot, project.semantic.broker));
  const brokerIds = new Set(broker.widgets.map((widget) => widget.id));
  const bindingDiagnostics = inspection.manifest.datasets.flatMap((dataset) => brokerIds.has(dataset.id) ? [] : [`Dataset ${dataset.id} is not present in the target project's widget broker`]);
  if (bindingDiagnostics.length) throw new Error(`Claude Dashboard semantic binding failed:\n- ${bindingDiagnostics.join("\n- ")}`);
  const vendored = await vendorAssets(inspection);
  const reportSourcePath = resolveProjectPath(projectRoot, project.source.bundle);
  const existing = await loadContract("report-source-bundle", reportSourcePath);
  const routeQuestion = new Map(existing.routes.flatMap((route) => route.datasets.map((dataset) => [dataset, route.businessQuestionIds])));
  const source = {
    ...existing,
    designSystem: { id: "claude-dashboard-import", sha256: sha256(vendored.css) },
    acceptedConcept: { id: inspection.manifest.name },
    files: [
      { path: "src/reportApplication.tsx", content: generatedApplication() },
      { path: "src/report/claudeDashboard.generated.ts", content: generatedBundle(inspection, vendored) },
      { path: "style/report-design.less", content: ".claude-dashboard-surface { box-sizing: border-box; width: 100%; min-height: 100%; }\n" },
    ],
    routes: inspection.manifest.routes.map((route) => ({ ...route, businessQuestionIds: [...new Set(route.datasets.flatMap((dataset) => routeQuestion.get(dataset) ?? [`claude-${route.id}`]))] })),
    bindings: inspection.manifest.datasets.map((dataset) => ({ dataset: dataset.id, component: "claude-dashboard", reportWidgetIds: [dataset.id], businessQuestionIds: routeQuestion.get(dataset.id) ?? [`claude-${dataset.id}`] })),
    adapter: { kind: "claude-dashboard", contractVersion: 1, source: "supervisual-claude-dashboard-bundle.v1", dashApis: inspection.dashApis, assets: vendored.assets, parameters: inspection.manifest.parameters ?? [] },
    designRationale: {
      direction: "Imported without translating the dashboard DOM, CSS, D3 drawing code, or interactions.",
      pageCompositions: inspection.manifest.routes.map((route) => `${route.title}: ${route.datasets.join(", ")}`),
      dataVisualisation: ["Original Claude-style dashboard rendering is mounted through the compatibility runtime."],
      responsiveBehaviour: ["The imported dashboard remains responsible for its declared responsive CSS."],
      accessibility: ["Semantic HTML and ARIA authored in the source bundle are preserved."],
      risks: ["Claude Dashboards is beta; this bundle is a Super Visual interchange contract, not an Anthropic export standard."],
    },
  };
  const compliance = validateSourceBundle(source);
  if (compliance.length) throw new Error(`Generated Claude Dashboard source failed compliance:\n${compliance.map((item) => `- ${item.code}: ${item.path} ${item.message}`).join("\n")}`);
  await writeFile(reportSourcePath, `${JSON.stringify(source, null, 2)}\n`);
  const provenancePath = path.join(projectRoot, "contracts", "claude-import.provenance.json");
  await writeFile(provenancePath, `${JSON.stringify({ contractVersion: 1, adapter: "claude-dashboard", sourceManifest: path.basename(inspection.manifestPath), manifestSha256: sha256(await readFile(inspection.manifestPath)), dashApis: inspection.dashApis, dataReads: inspection.dataReads, assets: vendored.assets }, null, 2)}\n`);
  return { ok: true, adapter: "claude-dashboard", contractVersion: 1, projectFile: path.resolve(projectFile), reportSource: reportSourcePath, provenance: provenancePath, datasets: inspection.manifest.datasets.map((dataset) => dataset.id), routes: inspection.manifest.routes.map((route) => route.id), dashApis: inspection.dashApis, assets: vendored.assets };
}

export const CLAUDE_DASHBOARD_ADAPTER = Object.freeze({ id: "claude-dashboard", contract: "claude-dashboard-bundle.v1", manifest: MANIFEST_NAME, supportedDashApis: [...SUPPORTED_DASH_APIS].sort() });
