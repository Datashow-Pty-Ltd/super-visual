import { inspectClaudeDashboardSourcePolicy } from "../packages/adapter-claude-dashboard/src/index.mjs";

export function fuzz(data) {
  const text = data.toString("utf8");
  const boundary = Math.floor(text.length / 3);
  const mode = data.length ? data[0] : 0;
  const sources = {
    html: `${mode & 1 ? '<img src="assets/mark.svg">' : ""}${text.slice(0, boundary)}`,
    css: `${mode & 2 ? ".mark{background:url(assets/mark.svg)}" : ""}${text.slice(boundary, boundary * 2)}`,
    script: `${mode & 4 ? 'dash.data("sales");' : ""}${text.slice(boundary * 2)}`,
  };
  const manifest = {
    entry: { html: "index.html", css: "style.css", script: "dashboard.js" },
    datasets: [{ id: "sales" }],
    routes: [{ id: "overview", datasets: mode & 8 ? ["sales", "missing"] : ["sales"] }],
    assets: mode & 16 ? ["assets/mark.svg", "assets/unused.svg"] : ["assets/mark.svg"],
  };
  const result = inspectClaudeDashboardSourcePolicy({ manifest, sources });
  if (!Array.isArray(result.diagnostics) || !Array.isArray(result.dashApis) || !Array.isArray(result.dataReads) || !Array.isArray(result.assetReferences)) {
    throw new Error("Claude Dashboard source inspection must return bounded collections");
  }
}
