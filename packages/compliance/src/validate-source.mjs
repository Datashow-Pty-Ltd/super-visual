import path from "node:path";
import { transformSync } from "esbuild";

const DEFAULT_ALLOWED_IMPORTS = new Set([
  "react",
  "react-router-dom",
  "@fontsource/source-serif-4/400.css",
  "@fontsource/source-serif-4/500.css",
  "@fontsource/source-serif-4/600.css",
  "@nivo/line",
  "@nivo/bar",
  "@nivo/pie",
  "@nivo/sankey",
  "@nivo/tree",
]);

const RULES = [
  { code: "core/no-network", pattern: /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/, message: "runtime network access" },
  { code: "core/no-dynamic-code", pattern: /\b(?:eval|Function)\s*\(/, message: "dynamic code execution" },
  { code: "core/no-browser-storage", pattern: /\b(?:localStorage|sessionStorage|indexedDB)\b/, message: "browser storage" },
  { code: "core/no-unsafe-html", pattern: /\b(?:innerHTML|dangerouslySetInnerHTML)\b/, message: "unsafe HTML insertion" },
  { code: "powerbi/no-host-api-in-app", pattern: /powerbi-visuals-api/, message: "Power BI host API in report source" },
  { code: "core/no-preview-fixtures", pattern: /fixtures?\//i, message: "preview fixture import" },
];

function imports(content) {
  const fromClauses = [...content.matchAll(/\bfrom[ \t]*["']([^"'\r\n]+)["']/g)].map((match) => match[1]);
  const sideEffects = [...content.matchAll(/\b(?:import|export)[ \t]*["']([^"'\r\n]+)["']/g)].map((match) => match[1]);
  return [...new Set([...fromClauses, ...sideEffects])];
}

export function validateSourceBundle(bundle, options = {}) {
  const diagnostics = [];
  const allowedImports = new Set(options.allowedImports ?? DEFAULT_ALLOWED_IMPORTS);
  if (bundle?.contractVersion !== 1) diagnostics.push({ code: "contract/version", path: "/contractVersion", message: "must equal 1" });
  if (bundle?.entry !== "src/reportApplication.tsx") diagnostics.push({ code: "contract/entry", path: "/entry", message: "must be src/reportApplication.tsx" });
  const seen = new Set();
  for (const file of bundle?.files ?? []) {
    const relative = String(file?.path ?? "");
    const normalized = path.posix.normalize(relative);
    if (normalized !== relative || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
      diagnostics.push({ code: "core/safe-path", path: relative, message: "source path escapes the generated design boundary" });
    }
    if (!/^(src\/reportApplication\.tsx|src\/report\/[A-Za-z0-9._/-]+\.(?:tsx|ts)|style\/report-design\.less)$/.test(relative)) {
      diagnostics.push({ code: "core/source-boundary", path: relative, message: "source file is outside the generated design boundary" });
    }
    if (seen.has(relative)) diagnostics.push({ code: "core/duplicate-file", path: relative, message: "source path is duplicated" });
    seen.add(relative);
    const content = String(file?.content ?? "");
    if (/\.tsx?$/.test(relative)) {
      try {
        transformSync(content, { loader: relative.endsWith(".tsx") ? "tsx" : "ts", sourcefile: relative, logLevel: "silent" });
      } catch (error) {
        for (const detail of error?.errors ?? [{ text: error instanceof Error ? error.message : String(error) }]) {
          diagnostics.push({ code: "core/typescript-syntax", path: relative, ...(detail.location?.line ? { line: detail.location.line } : {}), message: detail.text });
        }
      }
    }
    for (const rule of RULES) if (rule.pattern.test(content)) diagnostics.push({ code: rule.code, path: relative, message: `contains forbidden ${rule.message}` });
    for (const specifier of imports(content)) {
      if (!specifier.startsWith(".") && !allowedImports.has(specifier)) diagnostics.push({ code: "core/import-allowlist", path: relative, message: `imports unapproved package ${specifier}` });
    }
  }
  const entry = (bundle?.files ?? []).find((file) => file.path === bundle.entry)?.content ?? "";
  if (!/export\s+(?:function|const)\s+ReportApplication\b/.test(entry)) diagnostics.push({ code: "contract/export", path: bundle?.entry ?? "", message: "entry must export ReportApplication" });
  if (!/ReportApplicationProps/.test(entry)) diagnostics.push({ code: "contract/props", path: bundle?.entry ?? "", message: "ReportApplication must use ReportApplicationProps" });
  const source = (bundle?.files ?? []).map((file) => file.content).join("\n");
  if (!/model\.datasets/.test(source)) diagnostics.push({ code: "contract/data-source", path: bundle?.entry ?? "", message: "report source must read model.datasets" });
  if (!/onVisibleDatasetsChange/.test(source)) diagnostics.push({ code: "contract/visibility", path: bundle?.entry ?? "", message: "report source must report route-visible datasets" });
  return diagnostics;
}
