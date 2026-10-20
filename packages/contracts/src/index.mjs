import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaNames = ["supervisual-project", "report-app", "page-set", "widget-broker", "report-source-bundle", "claude-dashboard-bundle"];
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validators = new Map();
for (const name of schemaNames) {
  const schema = JSON.parse(await readFile(path.join(packageRoot, "schemas", `${name}.schema.json`), "utf8"));
  validators.set(name, ajv.compile(schema));
}

export function validateContract(name, value) {
  const validate = validators.get(name);
  if (!validate) throw new Error(`Unknown Super Visual contract ${name}`);
  const ok = validate(value);
  return {
    ok: Boolean(ok),
    errors: (validate.errors ?? []).map((error) => ({
      path: error.instancePath || "/",
      keyword: error.keyword,
      message: error.message ?? "invalid value",
    })),
  };
}

export async function loadContract(name, filePath) {
  const source = await readFile(filePath, "utf8");
  const value = filePath.endsWith(".json") ? JSON.parse(source) : YAML.parse(source);
  const result = validateContract(name, value);
  if (!result.ok) {
    throw new Error(`${name} contract is invalid:\n${result.errors.map((error) => `- ${error.path} ${error.message}`).join("\n")}`);
  }
  return value;
}

export function resolveProjectPath(projectRoot, relativePath) {
  const resolvedRoot = path.resolve(projectRoot);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Project path escapes its root: ${relativePath}`);
  }
  return resolved;
}
