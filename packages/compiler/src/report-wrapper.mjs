import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function id(seed, length = 20) {
  return createHash("sha256").update(seed).digest("hex").slice(0, length);
}

function uuid(seed) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function json(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function projection(role, property, kind = "Column") {
  return {
    field: { [kind]: { Expression: { SourceRef: { Entity: "Widget Axis" } }, Property: property } },
    queryRef: `Widget Axis.${property}`,
    nativeQueryRef: property,
  };
}

export async function generateReportWrapper({ outputDirectory, title, visualGuid, semanticPath = "../SemanticAdapter.SemanticModel", background = "#F6F5EF" }) {
  const pageName = id(`${title}:page`);
  const visualName = id(`${title}:visual`);
  const definition = path.join(outputDirectory, "definition");
  await json(path.join(outputDirectory, ".platform"), {
    $schema: "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
    metadata: { type: "Report", displayName: title },
    config: { version: "2.0", logicalId: uuid(`${title}:report`) },
  });
  await json(path.join(outputDirectory, "definition.pbir"), {
    $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json",
    version: "4.0", datasetReference: { byPath: { path: semanticPath } },
  });
  await json(path.join(definition, "version.json"), { version: "1.0.0", schemaVersion: "1.0.0" });
  await json(path.join(definition, "report.json"), {
    $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.3.0/schema.json",
    themeCollection: { baseTheme: { name: "CY24SU10", reportVersionAtImport: { visual: "2.6.0", report: "3.1.0", page: "2.3.0" }, type: "SharedResources" } },
    resourcePackages: [],
    settings: { useStylableVisualContainerHeader: true, exportDataMode: "AllowSummarized" },
  });
  await json(path.join(definition, "pages", "pages.json"), {
    $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json",
    pageOrder: [pageName], activePageName: pageName,
  });
  await json(path.join(definition, "pages", pageName, "page.json"), {
    $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
    name: pageName, displayName: title, displayOption: "FitToPage", height: 1080, width: 1920,
    objects: Object.fromEntries(["background", "outspace"].map((name) => [name, [{ properties: { color: { solid: { color: { expr: { Literal: { Value: `'${background}'` } } } } }, transparency: { expr: { Literal: { Value: "0D" } } } } }]])),
  });
  await json(path.join(definition, "pages", pageName, "visuals", visualName, "visual.json"), {
    $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.12.0/schema.json",
    name: visualName,
    position: { x: 0, y: 0, z: 0, height: 1080, width: 1920, tabOrder: 0 },
    visual: {
      visualType: visualGuid,
      query: { queryState: {
        widgetId: { projections: [projection("widgetId", "WidgetId")] },
        axisKey: { projections: [projection("axisKey", "AxisKey")] },
        label: { projections: [projection("label", "Label")] },
        sort: { projections: [projection("sort", "Sort")] },
        seriesKey: { projections: [projection("seriesKey", "SeriesKey")] },
        seriesLabel: { projections: [projection("seriesLabel", "SeriesLabel")] },
        value: { projections: [projection("value", "Widget Value", "Measure")] },
        context: { projections: [projection("context", "Broker Context", "Measure")] },
      } },
      visualContainerObjects: {
        general: [{ properties: { altText: { expr: { Literal: { Value: `'${title.replaceAll("'", "''")} compiled analytical application.'` } } } } }],
        title: [{ properties: { show: { expr: { Literal: { Value: "false" } } } } }],
        background: [{ properties: { show: { expr: { Literal: { Value: "false" } } } } }],
        border: [{ properties: { show: { expr: { Literal: { Value: "false" } } } } }],
        visualHeader: [{ properties: { show: { expr: { Literal: { Value: "false" } } } } }],
      },
    },
  });
  return { pageName, visualName, outputDirectory };
}
