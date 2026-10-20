import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const designHash = "cb6129f16bffcc202ae700d58f207f12112151f712d32ed4f081a1e96780e8ca";
const bundle = {
  contractVersion: 1,
  designSystem: { id: "datashow-analytical", sha256: designHash },
  acceptedConcept: { id: "adventureworks-product-ledger" },
  entry: "src/reportApplication.tsx",
  files: [
    { path: "src/reportApplication.tsx", content: await readFile(path.join(root, "source", "reportApplication.tsx"), "utf8") },
    { path: "style/report-design.less", content: await readFile(path.join(root, "source", "report-design.less"), "utf8") },
  ],
  routes: [
    { id: "overview", title: "Executive Overview", datasets: ["trend", "category", "territory"], businessQuestionIds: ["business-health", "growth-drivers", "market-performance"] },
    { id: "products", title: "Product Ledger", datasets: ["product"], businessQuestionIds: ["product-performance"] },
    { id: "customers", title: "Customer Observatory", datasets: ["customer"], businessQuestionIds: ["customer-concentration"] },
    { id: "geography", title: "Territory Fieldbook", datasets: ["territory"], businessQuestionIds: ["market-performance"] },
  ],
  bindings: [
    { dataset: "trend", component: "line", reportWidgetIds: ["trend"], businessQuestionIds: ["business-health"] },
    { dataset: "category", component: "bar", reportWidgetIds: ["category"], businessQuestionIds: ["growth-drivers"] },
    { dataset: "territory", component: "pie", reportWidgetIds: ["territory"], businessQuestionIds: ["market-performance"] },
    { dataset: "customer", component: "sankey", reportWidgetIds: ["customer"], businessQuestionIds: ["customer-concentration"] },
    { dataset: "product", component: "tree", reportWidgetIds: ["product"], businessQuestionIds: ["product-performance"] },
  ],
  designRationale: {
    direction: "Editorial product ledger derived from the proven AdventureWorks Super Visual.",
    pageCompositions: ["Executive overview", "Product ledger", "Customer observatory", "Territory fieldbook"],
    dataVisualisation: ["Line", "bar", "pie", "hierarchy", "flow", "ranked table", "KPI ledger"],
    responsiveBehaviour: ["Twelve-column desktop grid collapses at the proven tablet and mobile breakpoints."],
    accessibility: ["Semantic landmarks, visible focus, direct labels, and reduced-motion styles are retained."],
    risks: ["Live values depend on the deployer's AdventureWorks source and Fabric connection."],
  },
};
await writeFile(path.join(root, "contracts", "report-source.json"), `${JSON.stringify(bundle, null, 2)}\n`);
