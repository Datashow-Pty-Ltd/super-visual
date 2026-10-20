import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSolution, loadProject, validateCompilation } from "@datashow/super-visual-compiler";
import { checkSemanticCompatibility, inspectSemanticModel } from "@datashow/super-visual-fabric";
import { createServer } from "vite";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewTemplate = path.join(packageRoot, "templates", "semantic-preview");
const require = createRequire(import.meta.url);
const BROKER_FIELDS = ["WidgetId", "AxisKey", "Label", "Sort", "SeriesKey", "SeriesLabel", "WidgetValue", "BrokerContext"];
const BROKER_COLUMNS = BROKER_FIELDS.slice(0, 6);
const BROKER_MEASURES = ["Widget Value", "Broker Context"];
const PREVIEW_RESPONSE_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function daxString(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function daxReference(reference) {
  const separator = typeof reference === "string" && reference.endsWith("]")
    ? reference.lastIndexOf("[", reference.length - 2)
    : -1;
  if (separator <= 0 || separator === reference.length - 2) throw new Error(`Semantic filter target must use Table[Column] notation: ${reference}`);
  const table = reference.slice(0, separator);
  const column = reference.slice(separator + 1, -1);
  const escapedColumn = column.replaceAll("]", "]]");
  return { table, column, dax: `'${table.replaceAll("'", "''")}'[${escapedColumn}]` };
}

function semanticColumn(semanticModel, reference) {
  const target = daxReference(reference);
  const table = semanticModel.tables.find((candidate) => candidate.name === target.table);
  const column = table?.columns?.find((candidate) => candidate.name === target.column);
  if (!column) throw new Error(`Unknown semantic column ${reference}`);
  return { ...target, dataType: column.dataType };
}

function daxValue(value, dataType) {
  if (["Int64", "Decimal", "Double"].includes(dataType)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error(`Selection value is not valid for ${dataType}`);
    return String(numeric);
  }
  if (dataType === "Boolean") {
    if (value === true || String(value).toLowerCase() === "true") return "TRUE()";
    if (value === false || String(value).toLowerCase() === "false") return "FALSE()";
    throw new Error("Selection value is not valid for Boolean");
  }
  if (dataType === "DateTime") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (!match) throw new Error("Selection value must use YYYY-MM-DD for DateTime");
    return `DATE(${Number(match[1])}, ${Number(match[2])}, ${Number(match[3])})`;
  }
  return daxString(value);
}

function filterExpression(semanticModel, reference, values) {
  const target = semanticColumn(semanticModel, reference);
  if (!Array.isArray(values) || values.length === 0) return null;
  return `TREATAS({ ${values.map((value) => daxValue(value, target.dataType)).join(", ")} }, ${target.dax})`;
}

function parameterValues(parameter, value) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((candidate) => {
    if (candidate === null || candidate === undefined || candidate === "") return [];
    const resolved = parameter.values?.[String(candidate)] ?? candidate;
    return [resolved];
  });
}

function validateQueryRequest(request, loaded) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new Error("Preview query body must be an object");
  const unexpected = Object.keys(request).filter((key) => !["widgets", "selections", "parameters"].includes(key));
  if (unexpected.length) throw new Error(`Preview query contains unsupported fields: ${unexpected.join(", ")}`);
  const widgetById = new Map(loaded.broker.widgets.map((widget) => [widget.id, widget]));
  const knownWidgets = new Set(widgetById.keys());
  const widgets = Array.isArray(request.widgets) ? [...new Set(request.widgets)] : [];
  if (!widgets.length || widgets.some((widget) => typeof widget !== "string" || !knownWidgets.has(widget))) throw new Error("Preview query contains an unknown or empty widget selection");
  const selections = request.selections && typeof request.selections === "object" && !Array.isArray(request.selections) ? request.selections : {};
  for (const [widget, value] of Object.entries(selections)) {
    if (!knownWidgets.has(widget)) throw new Error(`Preview selection references unknown widget ${widget}`);
    if (widgetById.get(widget).selectable !== true) throw new Error(`Preview selection references non-selectable widget ${widget}`);
    if (!["string", "number", "boolean"].includes(typeof value)) throw new Error(`Preview selection for ${widget} must be a scalar value`);
  }
  const parameters = request.parameters && typeof request.parameters === "object" && !Array.isArray(request.parameters) ? request.parameters : {};
  const knownParameters = new Set((loaded.reportSource.adapter?.parameters ?? []).map((parameter) => parameter.name));
  for (const [name, value] of Object.entries(parameters)) {
    if (!knownParameters.has(name)) throw new Error(`Preview request references unknown parameter ${name}`);
    const values = Array.isArray(value) ? value : [value];
    if (values.some((candidate) => !["string", "number", "boolean"].includes(typeof candidate))) throw new Error(`Preview parameter ${name} must contain only scalar values`);
  }
  return { widgets, selections, parameters };
}

export function buildSemanticPreviewQuery({ broker, semanticModel, reportSource }, request) {
  const loaded = { broker, semanticModel, reportSource };
  const { widgets, selections, parameters } = validateQueryRequest(request, loaded);
  const widgetById = new Map(broker.widgets.map((widget) => [widget.id, widget]));
  const filters = [
    `TREATAS({ ${widgets.map(daxString).join(", ")} }, 'Widget Axis'[WidgetId])`,
    ...Object.entries(selections).map(([widget, value]) => filterExpression(semanticModel, widgetById.get(widget).axis, [value])),
    ...Object.entries(parameters).map(([name, value]) => {
      const parameter = reportSource.adapter.parameters.find((candidate) => candidate.name === name);
      return filterExpression(semanticModel, parameter.target, parameterValues(parameter, value));
    }),
  ].filter(Boolean);
  return `EVALUATE
VAR __BrokerRows =
    CALCULATETABLE(
        SELECTCOLUMNS(
            'Widget Axis',
            "WidgetId", 'Widget Axis'[WidgetId],
            "AxisKey", 'Widget Axis'[AxisKey],
            "Label", 'Widget Axis'[Label],
            "Sort", 'Widget Axis'[Sort],
            "SeriesKey", 'Widget Axis'[SeriesKey],
            "SeriesLabel", 'Widget Axis'[SeriesLabel],
            "WidgetValue", [Widget Value],
            "BrokerContext", [Broker Context]
        ),
        ${filters.join(",\n        ")}
    )
RETURN
    FILTER(__BrokerRows, NOT ISBLANK([WidgetValue]))
ORDER BY [WidgetId], [Sort], [AxisKey], [SeriesKey]`;
}

function rowValue(row, field) {
  if (Object.hasOwn(row, field)) return row[field];
  if (Object.hasOwn(row, `[${field}]`)) return row[`[${field}]`];
  const key = Object.keys(row).find((candidate) => candidate.endsWith(`[${field}]`));
  return key ? row[key] : null;
}

export function normalizeSemanticBrokerRows(rows) {
  if (!Array.isArray(rows)) throw new Error("Power BI executeQueries did not return a row array");
  return rows.map((row) => Object.fromEntries(BROKER_FIELDS.map((field) => [field, rowValue(row, field)])));
}

export async function executeSemanticPreviewQuery({ client, workspaceId, semanticModelId, loaded, request }) {
  const validated = validateQueryRequest(request, loaded);
  const query = buildSemanticPreviewQuery(loaded, validated);
  const started = performance.now();
  const rows = normalizeSemanticBrokerRows(await client.executeDax(workspaceId, semanticModelId, query));
  return { rows, metadata: { requestedWidgets: validated.widgets, rowCount: rows.length, elapsedMs: Math.round(performance.now() - started) } };
}

export function previewBrokerSurfaceDiagnostics(inspection) {
  const broker = inspection.tables.find((table) => table.name === "Widget Axis");
  if (!broker) return [{ code: "preview.broker.missing", message: "The semantic model does not contain the generated Widget Axis table." }];
  const columns = new Set((broker.columns ?? []).map((column) => column.name));
  const measures = new Set((broker.measures ?? []).map((measure) => measure.name));
  return [
    ...BROKER_COLUMNS.filter((name) => !columns.has(name)).map((name) => ({ code: "preview.broker.column.missing", message: `Widget Axis[${name}] was not found.` })),
    ...BROKER_MEASURES.filter((name) => !measures.has(name)).map((name) => ({ code: "preview.broker.measure.missing", message: `[${name}] was not found on Widget Axis.` })),
  ];
}

function packageDirectory(name) {
  let current = path.dirname(require.resolve(name));
  while (current !== path.dirname(current) && !existsSync(path.join(current, "package.json"))) current = path.dirname(current);
  if (!existsSync(path.join(current, "package.json"))) throw new Error(`Could not locate preview dependency ${name}`);
  return current;
}

function dependencyAliases() {
  return ["react", "react-dom", "react-router-dom", "@fontsource/source-serif-4", "@nivo/bar", "@nivo/line", "@nivo/pie", "@nivo/sankey", "@nivo/tree", "d3"]
    .map((name) => ({ find: name, replacement: packageDirectory(name) }));
}

async function readJsonBody(request, maximumBytes = 64 * 1024) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximumBytes) throw new Error("Preview request body exceeds 64 KiB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function semanticGateway({ client, workspaceId, semanticModelId, loaded, token }) {
  return {
    name: "supervisual-semantic-gateway",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url !== "/__supervisual/query") return next();
        const expectedOrigin = `http://${request.headers.host}`;
        if (request.method !== "POST"
          || request.headers["content-type"]?.split(";", 1)[0] !== "application/json"
          || request.headers.origin !== expectedOrigin
          || request.headers["x-supervisual-preview-token"] !== token) {
          return sendJson(response, 403, { ok: false, error: "Preview gateway request was rejected." });
        }
        try {
          const result = await executeSemanticPreviewQuery({ client, workspaceId, semanticModelId, loaded, request: await readJsonBody(request) });
          return sendJson(response, 200, { ok: true, ...result });
        } catch (error) {
          return sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}

function previewResponseHeaders() {
  return {
    name: "supervisual-preview-response-headers",
    configureServer(server) {
      server.middlewares.use((_request, response, next) => {
        for (const [name, value] of Object.entries(PREVIEW_RESPONSE_HEADERS)) response.setHeader(name, value);
        next();
      });
    },
  };
}

async function writePreviewHost(root, token) {
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await cp(previewTemplate, root, { recursive: true });
  await writeFile(path.join(root, "src", "config.ts"), `export const PREVIEW_TOKEN = ${JSON.stringify(token)};\n`);
}

export async function startSemanticPreview({ client, projectFile, workspaceId, workspaceName, semanticModelId, host = "127.0.0.1", port = 5173, open = false }) {
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("Semantic preview may bind only to a loopback host");
  const loaded = await loadProject(projectFile);
  const diagnostics = validateCompilation(loaded);
  if (diagnostics.length) throw new Error(`Preview validation failed:\n- ${diagnostics.join("\n- ")}`);
  const inspected = await inspectSemanticModel({ client, workspaceId, workspaceName, semanticModelId });
  const compatibility = checkSemanticCompatibility(inspected.semanticModel, loaded.semanticModel, loaded.broker);
  const brokerDiagnostics = previewBrokerSurfaceDiagnostics(inspected.semanticModel);
  if (!compatibility.ok || brokerDiagnostics.length) {
    const messages = [...compatibility.diagnostics.map((item) => item.message), ...brokerDiagnostics.map((item) => item.message)];
    throw new Error(`Semantic preview compatibility failed:\n- ${messages.join("\n- ")}`);
  }

  const previewRoot = path.join(loaded.root, ".supervisual", "semantic-preview");
  const solutionRoot = path.join(previewRoot, "solution");
  const hostRoot = path.join(previewRoot, "host");
  await buildSolution(projectFile, { outputDirectory: solutionRoot });
  const token = randomBytes(24).toString("base64url");
  await writePreviewHost(hostRoot, token);
  const server = await createServer({
    root: hostRoot,
    logLevel: "silent",
    resolve: {
      alias: dependencyAliases(),
      dedupe: ["react", "react-dom"],
      // Vite rejects Windows 8.3 short-name paths even when their parent is allow-listed.
      preserveSymlinks: true,
    },
    server: {
      host,
      port: Number(port),
      strictPort: Number(port) !== 0,
      open,
      allowedHosts: [host],
      cors: false,
      headers: PREVIEW_RESPONSE_HEADERS,
      fs: { strict: true, allow: [previewRoot] },
    },
    plugins: [previewResponseHeaders(), semanticGateway({ client, workspaceId, semanticModelId, loaded, token })],
  });
  await server.listen();
  const address = server.httpServer?.address();
  const actualPort = typeof address === "object" && address ? address.port : Number(port);
  const urlHost = host === "::1" ? "[::1]" : host;
  return {
    ok: true,
    status: "ready",
    mode: "live-semantic-model",
    url: `http://${urlHost}:${actualPort}/`,
    workspace: inspected.workspace,
    semanticModel: { id: inspected.semanticModel.id, displayName: inspected.semanticModel.displayName },
    compatibility: compatibility.summary,
    project: projectFile,
    generatedDirectory: previewRoot,
    close: () => server.close(),
  };
}

export async function runSemanticPreviewTest(options) {
  const preview = await startSemanticPreview({ ...options, port: 0, open: false });
  let browser;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.goto(preview.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    try {
      await page.waitForFunction(() => window.__SUPERVISUAL_PREVIEW__?.snapshot().status === "ready", null, { timeout: options.timeoutMs });
    } catch (error) {
      const snapshot = await page.evaluate(() => window.__SUPERVISUAL_PREVIEW__?.snapshot?.() ?? null).catch(() => null);
      throw new Error(`Semantic preview did not become ready: ${JSON.stringify({ snapshot, browserErrors, cause: error instanceof Error ? error.message : String(error) })}`);
    }
    const baseline = await page.evaluate(() => window.__SUPERVISUAL_PREVIEW__.snapshot());
    if (baseline.receivedRowCount < 1) throw new Error("Semantic preview returned no broker rows");

    let interaction = { available: false, tested: false, widget: null, selected: null };
    let pagesTested = 1;
    let selector = page.locator("select[data-filter-widget]").first();
    if (!(await selector.count()) || await selector.locator("option").count() < 2) {
      const links = page.locator('nav[aria-label="Report pages"] a');
      for (let index = 0; index < await links.count(); index += 1) {
        const beforeNavigation = (await page.evaluate(() => window.__SUPERVISUAL_PREVIEW__.snapshot())).requestSequence;
        await links.nth(index).click();
        pagesTested += 1;
        await page.waitForFunction((sequence) => {
          const snapshot = window.__SUPERVISUAL_PREVIEW__?.snapshot();
          return snapshot?.status === "ready" && snapshot.requestSequence > sequence;
        }, beforeNavigation, { timeout: options.timeoutMs });
        selector = page.locator("select[data-filter-widget]").first();
        if (await selector.count() && await selector.locator("option").count() > 1) break;
      }
    }
    if (await selector.count() && await selector.locator("option").count() > 1) {
      interaction.available = true;
      interaction.widget = await selector.getAttribute("data-filter-widget");
      const before = (await page.evaluate(() => window.__SUPERVISUAL_PREVIEW__.snapshot())).requestSequence;
      await selector.selectOption({ index: 1 });
      await page.waitForFunction((sequence) => {
        const snapshot = window.__SUPERVISUAL_PREVIEW__?.snapshot();
        return snapshot?.status === "ready" && snapshot.requestSequence > sequence && Object.keys(snapshot.activeSelections).length > 0;
      }, before, { timeout: options.timeoutMs });
      const selected = await page.evaluate(() => window.__SUPERVISUAL_PREVIEW__.snapshot());
      interaction.selected = { requestSequence: selected.requestSequence, receivedRowCount: selected.receivedRowCount, rowCounts: selected.rowCounts };
      const beforeClear = selected.requestSequence;
      await selector.selectOption("");
      await page.waitForFunction((sequence) => {
        const snapshot = window.__SUPERVISUAL_PREVIEW__?.snapshot();
        return snapshot?.status === "ready" && snapshot.requestSequence > sequence && Object.keys(snapshot.activeSelections).length === 0;
      }, beforeClear, { timeout: options.timeoutMs });
      interaction.tested = true;
    }
    const final = await page.evaluate(() => window.__SUPERVISUAL_PREVIEW__.snapshot());
    if (browserErrors.length) throw new Error(`Preview browser errors: ${browserErrors.join("; ")}`);
    const evidence = (snapshot) => ({
      status: snapshot.status,
      requestSequence: snapshot.requestSequence,
      receivedWidgets: snapshot.receivedWidgets,
      receivedRowCount: snapshot.receivedRowCount,
      rowCounts: snapshot.rowCounts,
      error: snapshot.error,
    });
    return { ok: true, status: "passed", mode: preview.mode, workspace: preview.workspace, semanticModel: preview.semanticModel, baseline: evidence(baseline), final: evidence(final), pagesTested, interaction };
  } finally {
    await browser?.close();
    await preview.close();
  }
}
