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
  "docs/recipes/hello-world.md",
  "docs/recipes/adventureworks.md",
  "docs/commands.md",
  "docs/claude-dashboard-migration.md",
  "docs/adapter-compatibility.md",
  "docs/troubleshooting.md",
  "docs/release-proof.md",
  "docs/security-assurance.md",
  "docs/threat-model.md",
  "docs/agent-evals.md",
  "docs/certification/live-run-template.md",
  "docs/certification/agent-skill-proof.md",
  "docs/certification/security-scan-proof.md",
  "docs/certification/openssf-best-practices-readiness.md",
  "docs/certification/live-run.example.json",
  "docs/reference/deployed-baseline.json",
];

await Promise.all(required.map((file) => access(path.join(root, file))));
const decisions = (await readdir(path.join(root, "docs/decisions"))).filter((file) => file.endsWith(".md"));
if (decisions.length !== 8) throw new Error(`Expected 8 architecture decisions; found ${decisions.length}`);

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", ".artifacts", ".supervisual", "dist", "node_modules"].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(target);
  }
  return files;
}

const markdown = await markdownFiles(root);
const brokenLinks = [];
for (const file of markdown) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
    if (/^(?:[a-z]+:|#)/i.test(target)) continue;
    target = decodeURIComponent(target.split("#")[0]);
    try {
      await access(path.resolve(path.dirname(file), target));
    } catch {
      brokenLinks.push(`${path.relative(root, file)} -> ${target}`);
    }
  }
}
if (brokenLinks.length) throw new Error(`Broken local documentation links:\n${brokenLinks.join("\n")}`);

const legacyPhrases = [
  "<deployed-adapter-model-guid>",
  "<adapter-model-guid>",
  "deployed report-specific semantic adapter",
];
for (const file of markdown) {
  const source = (await readFile(file, "utf8")).toLowerCase();
  const found = legacyPhrases.find((phrase) => source.includes(phrase));
  if (found) throw new Error(`Legacy documentation phrase '${found}' remains in ${path.relative(root, file)}`);
}

const currentWorkflowFiles = [
  "README.md",
  "docs/getting-started.md",
  "docs/recipes/hello-world.md",
  "examples/hello-world/README.md",
  "examples/hello-world/deployment/CERTIFICATION.md",
  "packages/cli/templates/hello-world/README.md",
  "packages/cli/templates/hello-world/deployment/CERTIFICATION.md",
];
for (const file of currentWorkflowFiles) {
  const source = await readFile(path.join(root, file), "utf8");
  for (const requiredText of ["--semantic-model-id", "supervisual publish"]) {
    if (!source.includes(requiredText)) throw new Error(`${file} does not document the current '${requiredText}' workflow`);
  }
}

const helloWorldOperationalDocs = currentWorkflowFiles.filter((file) => file !== "README.md" && file !== "docs/getting-started.md");
for (const file of helloWorldOperationalDocs) {
  const source = await readFile(path.join(root, file), "utf8");
  for (const legacyOption of ["--semantic-model-name", "--parameters-file", "source-profile.example.json"]) {
    if (source.includes(legacyOption)) throw new Error(`${file} still documents the legacy Hello World option '${legacyOption}'`);
  }
}

const baseline = JSON.parse(await readFile(path.join(root, "docs/reference/deployed-baseline.json"), "utf8"));
if (baseline.schemaVersion !== 1 || baseline.visual?.version !== "1.0.0.38") {
  throw new Error("The deployed reference manifest is missing or has an unexpected version");
}

process.stdout.write(`Stage 1 verified: ${required.length} required documents, ${markdown.length} Markdown files, ${decisions.length} decisions\n`);
