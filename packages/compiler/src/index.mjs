import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { validatePageSetPrimitives, validateReportGraphBindings, validateSourceBundle, validateWidgetBrokerContract } from "@datashow/super-visual-compliance";

function moduleText(comment, name, value) {
  return `${comment}\nexport const ${name} = ${JSON.stringify(value, null, 2)} as const;\n`;
}

export function validateCompilation({ semanticModel, broker, pageSet, reportSource }) {
  return [
    ...validateWidgetBrokerContract(broker, semanticModel),
    ...validateReportGraphBindings(pageSet, broker),
    ...validatePageSetPrimitives(pageSet),
    ...validateSourceBundle(reportSource).map((diagnostic) => `${diagnostic.code}: ${diagnostic.path} ${diagnostic.message}`),
  ];
}

export async function generateRuntimeManifests({ broker, pageSet, reportSource }, outputRoot) {
  const referenced = new Set((pageSet.pages ?? []).flatMap((page) => [
    page.summary?.emphasisBinding?.dataset,
    page.search?.dataset,
    ...(page.kpis ?? []).map((kpi) => kpi.binding?.dataset),
    ...(page.widgets ?? []).map((widget) => widget.dataset),
  ]).filter(Boolean));
  for (const interaction of pageSet.interactions ?? []) for (const id of interaction.invalidates ?? []) referenced.add(id);
  const widgets = broker.widgets.filter((widget) => referenced.has(widget.id));
  const sourceRoot = path.join(outputRoot, "src");
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(path.join(sourceRoot, "datasetRegistry.ts"), `export const DATASET_KEYS = ${JSON.stringify(widgets.map((widget) => widget.id))} as const;\nexport type DatasetKey = string;\n`);
  await writeFile(path.join(sourceRoot, "pageSetManifest.ts"), moduleText("/* Generated from the page-set contract. */", "PAGE_SET_MANIFEST", pageSet));
  const dependencies = Object.fromEntries(widgets.filter((widget) => widget.selectable).map((widget) => [widget.id, widget.invalidates.filter((id) => referenced.has(id))]));
  await writeFile(path.join(sourceRoot, "dependencyManifest.ts"), `import type { DatasetKey } from "./datasetRegistry";\nexport const SELECTION_DEPENDENCIES: Record<DatasetKey, DatasetKey[]> = ${JSON.stringify(dependencies, null, 2)};\n`);
  const manifest = Object.fromEntries(widgets.map((widget) => [widget.id, { id: widget.id, order: ["top-by-value", "bottom-by-value"].includes(widget.rowSelection) ? "value" : "axis", selectable: widget.selectable }]));
  await writeFile(path.join(sourceRoot, "widgetManifest.ts"), `import type { DatasetKey } from "./model";\nexport const WIDGET_MANIFEST: Record<DatasetKey, { id: DatasetKey; order: "axis" | "value"; selectable: boolean }> = ${JSON.stringify(manifest, null, 2)};\n`);
  const targets = Object.fromEntries(widgets.map((widget) => {
    const match = widget.axis.match(/^(.+)\[([^\]]+)\]$/);
    if (!match) throw new Error(`Broker axis must use Table[Column] notation: ${widget.axis}`);
    return [widget.id, { table: match[1], column: match[2] }];
  }));
  await writeFile(path.join(sourceRoot, "filterTargets.ts"), `import type { DatasetKey } from "./model";\nimport type { FilterTarget } from "./filter";\nexport const FILTER_TARGETS: Record<DatasetKey, FilterTarget> = ${JSON.stringify(targets, null, 2)};\n`);
  const claudeParameters = reportSource.adapter?.kind === "claude-dashboard" ? reportSource.adapter.parameters : [];
  const claudeTargets = Object.fromEntries(claudeParameters.map((parameter) => {
    const match = parameter.target.match(/^(.+)\[([^\]]+)\]$/);
    if (!match) throw new Error(`Claude parameter target must use Table[Column] notation: ${parameter.target}`);
    return [parameter.name, { table: match[1], column: match[2] }];
  }));
  const claudeValueMaps = Object.fromEntries(claudeParameters.filter((parameter) => parameter.values).map((parameter) => [parameter.name, parameter.values]));
  await writeFile(path.join(sourceRoot, "claudeParamTargets.ts"), `import type { FilterTarget, FilterValue } from "./filter";\nexport const CLAUDE_PARAM_FILTER_TARGETS: Record<string, FilterTarget> = ${JSON.stringify(claudeTargets, null, 2)};\nconst CLAUDE_PARAM_VALUE_MAPS: Record<string, Record<string, FilterValue>> = ${JSON.stringify(claudeValueMaps, null, 2)};\nexport function claudeFilterValues(name: string, value: unknown): FilterValue[] {\n  const values = Array.isArray(value) ? value : [value];\n  const mapped = CLAUDE_PARAM_VALUE_MAPS[name] ?? {};\n  return values.flatMap((candidate) => {\n    if (candidate === null || candidate === undefined || candidate === \"\") return [];\n    const resolved = mapped[String(candidate)] ?? candidate;\n    return typeof resolved === \"string\" || typeof resolved === \"number\" || typeof resolved === \"boolean\" ? [resolved] : [];\n  });\n}\n`);
  for (const file of reportSource.files) {
    const target = path.resolve(outputRoot, file.path);
    if (target !== path.resolve(outputRoot) && !target.startsWith(`${path.resolve(outputRoot)}${path.sep}`)) throw new Error(`Generated source escapes output: ${file.path}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
  return { datasets: widgets.map((widget) => widget.id), generatedFiles: 6 + reportSource.files.length };
}

export { buildSolution, loadProject, refreshSolutionManifest, verifySolutionManifest } from "./build-solution.mjs";
export { generateReportWrapper } from "./report-wrapper.mjs";
export { embedVisualPackage } from "./embed-visual.mjs";
