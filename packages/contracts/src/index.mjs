import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaNames = ["supervisual-project", "report-app", "page-set", "widget-broker", "report-source-bundle", "claude-dashboard-bundle", "live-certification-record"];
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

async function readStructured(filePath) {
  const source = await readFile(filePath, "utf8");
  return { source, value: filePath.endsWith(".json") ? JSON.parse(source) : YAML.parse(source) };
}

async function writeStructuredAtomic(filePath, value) {
  const temporary = `${filePath}.supervisual-migrate.tmp`;
  const source = filePath.endsWith(".json")
    ? `${JSON.stringify(value, null, 2)}\n`
    : YAML.stringify(value);
  await writeFile(temporary, source, { flag: "wx" });
  await rename(temporary, filePath);
}

/**
 * Inspect or migrate source contracts without touching disposable generated output.
 * The initial migration adds the v1 marker to legacy unversioned widget brokers.
 */
export async function migrateProjectContracts(projectFile, { write = false, backupDirectory } = {}) {
  const absoluteProject = path.resolve(projectFile);
  const root = path.dirname(absoluteProject);
  const projectDocument = await readStructured(absoluteProject);
  const projectValidation = validateContract("supervisual-project", projectDocument.value);
  if (!projectValidation.ok) {
    throw new Error(`supervisual-project contract is invalid and cannot be migrated safely:\n${projectValidation.errors.map((error) => `- ${error.path} ${error.message}`).join("\n")}`);
  }
  const descriptors = [
    { contract: "supervisual-project", file: absoluteProject, allowLegacyBroker: false },
    { contract: "semantic-model", file: resolveProjectPath(root, projectDocument.value.semantic.model), allowLegacyBroker: false },
    { contract: "widget-broker", file: resolveProjectPath(root, projectDocument.value.semantic.broker), allowLegacyBroker: true },
    { contract: "page-set", file: resolveProjectPath(root, projectDocument.value.semantic.pageSet), allowLegacyBroker: false },
    { contract: "report-source-bundle", file: resolveProjectPath(root, projectDocument.value.source.bundle), allowLegacyBroker: false },
  ];
  const documents = [];
  const migrations = [];
  for (const descriptor of descriptors) {
    const document = descriptor.file === absoluteProject ? projectDocument : await readStructured(descriptor.file);
    const version = document.value?.contractVersion;
    const relativePath = path.relative(root, descriptor.file).split(path.sep).join("/") || path.basename(descriptor.file);
    if (version === 1) {
      documents.push({ contract: descriptor.contract, path: relativePath, version: 1, status: "current" });
      continue;
    }
    if (descriptor.allowLegacyBroker && version === undefined) {
      const migration = { contract: descriptor.contract, path: relativePath, from: "legacy-unversioned", to: 1, changes: ["add /contractVersion = 1"] };
      documents.push({ contract: descriptor.contract, path: relativePath, version: null, status: "migration-available" });
      migrations.push({ ...migration, descriptor, document, migrated: { contractVersion: 1, ...document.value } });
      continue;
    }
    throw new Error(`${descriptor.contract} ${relativePath} uses unsupported contractVersion ${JSON.stringify(version)}; this CLI only supports version 1`);
  }
  if (!migrations.length) return { ok: true, status: "current", dryRun: !write, currentVersion: 1, documents, migrations: [] };
  const publicMigrations = migrations.map(({ contract, path: migrationPath, from, to, changes }) => ({ contract, path: migrationPath, from, to, changes }));
  if (!write) return { ok: true, status: "planned", dryRun: true, currentVersion: 1, documents, migrations: publicMigrations };
  const migrationId = createHash("sha256").update(JSON.stringify(migrations.map((item) => ({ path: item.path, source: item.document.source })))).digest("hex").slice(0, 16);
  const backupRoot = path.resolve(backupDirectory ?? path.join(root, ".supervisual", "migrations", migrationId));
  for (const migration of migrations) {
    const backupFile = resolveProjectPath(backupRoot, migration.path);
    await mkdir(path.dirname(backupFile), { recursive: true });
    await writeFile(backupFile, migration.document.source, { flag: "wx" });
  }
  for (const migration of migrations) await writeStructuredAtomic(migration.descriptor.file, migration.migrated);
  return { ok: true, status: "migrated", dryRun: false, currentVersion: 1, documents, migrations: publicMigrations, backupDirectory: backupRoot };
}

export function evaluateLiveCertification(record) {
  const validation = validateContract("live-certification-record", record);
  if (!validation.ok) return { ok: false, status: "invalid", checks: [], errors: validation.errors };
  const checks = [
    { id: "identity.commit", pass: !/^0+$/.test(record.commit) },
    { id: "identity.plan", pass: !/^0+$/.test(record.plan.id) },
    { id: "identity.operator", pass: !/^replace-/i.test(record.operator) },
    { id: "cli.accepted", pass: record.cli.status === "accepted" },
    { id: "binding.connection", pass: record.cli.connectionBinding === true },
    { id: "binding.report", pass: record.cli.reportBinding === true },
    { id: "refresh.completed", pass: record.cli.refresh === "Completed" },
    { id: "acceptance.rows", pass: record.cli.acceptance.rowCount > 0 },
    { id: "acceptance.columns", pass: record.cli.acceptance.columnCount > 0 },
    { id: "acceptance.nonNull", pass: record.cli.acceptance.nonNull === true },
    ...Object.entries(record.browser).map(([id, pass]) => ({ id: `browser.${id}`, pass: pass === true })),
    { id: "evidence.receipt", pass: record.evidence.some((item) => item.kind === "receipt") },
    { id: "evidence.screenshot", pass: record.evidence.some((item) => item.kind === "screenshot") },
    { id: "evidence.resolved", pass: record.evidence.every((item) => !/^replace-/i.test(item.reference) && !/^0+$/.test(item.sha256)) },
  ];
  const ok = checks.every((check) => check.pass);
  return { ok, status: ok ? "certified" : "incomplete", checks, errors: [] };
}

export function resolveProjectPath(projectRoot, relativePath) {
  const resolvedRoot = path.resolve(projectRoot);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Project path escapes its root: ${relativePath}`);
  }
  return resolved;
}
