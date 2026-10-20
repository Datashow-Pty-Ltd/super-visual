import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(".");
const cli = path.join(root, "packages", "cli", "bin", "supervisual.mjs");
const project = path.join(root, "examples", "hello-world");

for (const command of [["check", project], [process.argv.includes("--package") ? "package" : "compile", project], ["verify", project]]) {
  const { stdout } = await run(process.execPath, [cli, ...command, "--json"], { cwd: root, maxBuffer: 30 * 1024 * 1024 });
  const result = JSON.parse(stdout);
  if (!result.ok) throw new Error(`Hello World ${command[0]} failed: ${stdout}`);
}

const baseCatalog = path.join(project, "dist", "Base.SemanticModel", "definition", "tables", "Super Visual Model Catalog.tmdl");
const adapterCatalog = path.join(project, "dist", "SemanticAdapter.SemanticModel", "definition", "tables", "Super Visual Model Catalog.tmdl");
try {
  await readFile(baseCatalog, "utf8");
  throw new Error("Hello World generated catalog must not mutate Base.SemanticModel");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const catalog = await readFile(adapterCatalog, "utf8");
if (!catalog.includes("Value.NativeQuery") || !catalog.includes("Entity Count")) throw new Error("Hello World semantic catalog was not compiled as a source-backed adapter table");

process.stdout.write(`Hello World verified${process.argv.includes("--package") ? " and packaged" : ""}\n`);
