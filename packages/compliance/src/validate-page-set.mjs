export const CHART_PRIMITIVE_PACKAGES = Object.freeze({
  line: "@nivo/line",
  bar: "@nivo/bar",
  pie: "@nivo/pie",
  sankey: "@nivo/sankey",
  tree: "@nivo/tree",
  "small-multiples": "@nivo/line",
});

export const NON_CHART_PRIMITIVES = Object.freeze([
  "ranked-table",
  "ticker",
  "kpi-ledger",
]);

export function validatePageSetPrimitives(pageSet) {
  const errors = [];
  const pageIds = new Set();
  const widgetIds = new Set();
  for (const page of pageSet?.pages ?? []) {
    if (pageIds.has(page.id)) errors.push(`duplicate page id ${page.id}`);
    pageIds.add(page.id);
    let occupiedColumns = 0;
    for (const widget of page.widgets ?? []) {
      if (widgetIds.has(widget.id)) errors.push(`duplicate widget id ${widget.id}`);
      widgetIds.add(widget.id);
      if (!(widget.primitive in CHART_PRIMITIVE_PACKAGES) && !NON_CHART_PRIMITIVES.includes(widget.primitive)) {
        errors.push(`${page.id}.${widget.id} uses unsupported primitive ${widget.primitive}`);
      }
      const columns = Number(widget.layout?.columns);
      if (Number.isFinite(columns)) {
        if (occupiedColumns + columns > 12) {
          if (occupiedColumns !== 0) errors.push(`${page.id} leaves ${12 - occupiedColumns} empty grid columns before ${widget.id}`);
          occupiedColumns = 0;
        }
        occupiedColumns = (occupiedColumns + columns) % 12;
      }
    }
    if (occupiedColumns !== 0) errors.push(`${page.id} ends with ${12 - occupiedColumns} empty grid columns`);
  }
  if (!pageIds.has(pageSet?.shell?.defaultPage)) errors.push("shell.defaultPage must name a declared page");
  for (const item of pageSet?.shell?.navigation ?? []) {
    if (!pageIds.has(item.page)) errors.push(`navigation item ${item.page} does not resolve to a declared page`);
  }
  return errors;
}
