import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "README.md",
  "docs/vision.md",
  "docs/architecture.md",
  "docs/contracts.md",
  "docs/powerbi-constraints.md",
  "docs/extraction-inventory.md",
  "docs/roadmap.md",
  "docs/cli-product-roadmap.md",
  "docs/getting-started.md",
  "docs/commands.md",
  "docs/claude-dashboard-migration.md",
  "docs/adapter-compatibility.md",
  "docs/troubleshooting.md",
  "docs/release-proof.md",
  "docs/security-assurance.md",
  "docs/threat-model.md",
  "docs/agent-evals.md",
  "docs/certification/live-run-template.md",
  "docs/reference/deployed-baseline.json",
];

await Promise.all(required.map((file) => access(path.join(root, file))));
const decisions = (await readdir(path.join(root, "docs/decisions"))).filter((file) => file.endsWith(".md"));
if (decisions.length !== 8) throw new Error(`Expected 8 architecture decisions; found ${decisions.length}`);

const baseline = JSON.parse(await readFile(path.join(root, "docs/reference/deployed-baseline.json"), "utf8"));
if (baseline.schemaVersion !== 1 || baseline.visual?.version !== "1.0.0.38") {
  throw new Error("The deployed reference manifest is missing or has an unexpected version");
}

process.stdout.write(`Stage 1 verified: ${required.length} documents, ${decisions.length} decisions\n`);
