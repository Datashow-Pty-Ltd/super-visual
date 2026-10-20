import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source-root");
const explicitSource = sourceIndex >= 0 ? args[sourceIndex + 1] : undefined;
const baseline = JSON.parse(await readFile(path.join(root, "docs/reference/deployed-baseline.json"), "utf8"));
const runtime = JSON.parse(await readFile(path.join(root, "docs/reference/runtime-source-hashes.json"), "utf8"));
const sourceRoot = path.resolve(root, explicitSource ?? baseline.sourceRoot);

const expected = {
  [baseline.visual.path]: baseline.visual.sha256,
  "generated/adventureworks-report-app.yaml": baseline.inputs.reportAppSha256,
  "generated/semantic-model.yaml": baseline.inputs.semanticModelSha256,
  "build/AdventureWorksDashboardAdapter.SemanticModel/definition/model.tmdl": baseline.outputs.adapterModelSha256,
  "build/AdventureWorksBroker.Report/definition/report.json": baseline.outputs.reportDefinitionSha256,
  "docs/f2-super-dashboard-broker-results.md": baseline.evidence.brokerResultsSha256,
  "docs/f2-super-dashboard-native-broker-results.md": baseline.evidence.nativeBrokerResultsSha256,
  ...runtime.files,
};

const failures = [];
for (const [relative, expectedHash] of Object.entries(expected)) {
  const content = await readFile(path.join(sourceRoot, relative));
  const actualHash = createHash("sha256").update(content).digest("hex");
  if (actualHash !== expectedHash) failures.push(`${relative}: expected ${expectedHash}, received ${actualHash}`);
}

if (failures.length) throw new Error(`Golden reference changed:\n- ${failures.join("\n- ")}`);
process.stdout.write(`Stage 2 verified: ${Object.keys(expected).length} deployed reference artifacts match their recorded hashes\n`);
