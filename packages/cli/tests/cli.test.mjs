import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const run = promisify(execFile);
const root = path.resolve(".");
const cli = path.join(root, "packages", "cli", "bin", "supervisual.mjs");

describe("supervisual CLI", () => {
  test("exposes a discoverable command surface and version", async () => {
    const help = await run(process.execPath, [cli, "--help"], { cwd: root });
    expect(help.stdout).toContain("discover");
    expect(help.stdout).toContain("init");
    expect(help.stdout).toContain("migrate");
    expect(help.stdout).toContain("package");
    expect(help.stdout).toContain("import");
    expect(help.stdout).toContain("semantic");
    expect(help.stdout).toContain("certify");
    expect(help.stdout).toContain("deploy");
    const version = await run(process.execPath, [cli, "--version"], { cwd: root });
    expect(version.stdout.trim()).toBe("0.1.0-rc.0");
    const deployHelp = await run(process.execPath, [cli, "deploy", "--help"], { cwd: root });
    expect(deployHelp.stdout).toContain("discover");
    expect(deployHelp.stdout).toContain("workspaces");
    expect(deployHelp.stdout).toContain("diff");
    expect(deployHelp.stdout).toContain("restore");
    expect(deployHelp.stdout).toContain("status");
    const semanticHelp = await run(process.execPath, [cli, "semantic", "--help"], { cwd: root });
    expect(semanticHelp.stdout).toContain("discover");
    expect(semanticHelp.stdout).toContain("check");
  });

  test("discovers and inspects a Claude-style bundle", async () => {
    const discovered = await run(process.execPath, [cli, "discover", "examples/claude-dashboard-bundle", "--json"], { cwd: root });
    expect(JSON.parse(discovered.stdout)).toMatchObject({ ok: true, type: "claude-dashboard-bundle", adapter: "claude-dashboard" });
    const inspected = await run(process.execPath, [cli, "import", "claude-dashboard", "examples/claude-dashboard-bundle", "--project", "examples/hello-world", "--inspect-only", "--json"], { cwd: root });
    expect(JSON.parse(inspected.stdout)).toMatchObject({ ok: true, adapter: "claude-dashboard", dataReads: ["sales"] });
  });

  test("imports and compiles a Claude-style bundle", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-cli-claude-"));
    const project = path.join(temporary, "claude-dashboard");
    try {
      await run(process.execPath, [cli, "init", project, "--json"], { cwd: root });
      const imported = await run(process.execPath, [cli, "import", "claude-dashboard", "examples/claude-dashboard-bundle", "--project", project, "--json"], { cwd: root });
      expect(JSON.parse(imported.stdout)).toMatchObject({ ok: true, adapter: "claude-dashboard", datasets: ["sales"] });
      const checked = await run(process.execPath, [cli, "check", project, "--json"], { cwd: root });
      expect(JSON.parse(checked.stdout).ok).toBe(true);
      const built = await run(process.execPath, [cli, "compile", project, "--json"], { cwd: root });
      expect(JSON.parse(built.stdout).fileCount).toBeGreaterThan(40);
      const verified = await run(process.execPath, [cli, "verify", project, "--json"], { cwd: root });
      expect(JSON.parse(verified.stdout).ok).toBe(true);
    } finally { await rm(temporary, { recursive: true, force: true }); }
  });

  test("discovers and inspects a project", async () => {
    const discovered = await run(process.execPath, [cli, "discover", "examples/adventureworks", "--json"], { cwd: root });
    expect(JSON.parse(discovered.stdout)).toMatchObject({ ok: true, type: "supervisual-project", supported: true });
    const inspected = await run(process.execPath, [cli, "inspect", "examples/adventureworks", "--json"], { cwd: root });
    expect(JSON.parse(inspected.stdout)).toMatchObject({ ok: true, application: { id: "adventureworks-product-ledger" } });
  });

  test("validates a complete live certification record", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-certification-"));
    const file = path.join(temporary, "record.json");
    try {
      const record = {
        contractVersion: 1,
        kind: "super-visual-live-certification",
        recordedAt: "2026-10-20T08:00:00Z",
        commit: "a".repeat(40),
        operator: "test operator",
        environment: "disposable-sandbox",
        workspace: { id: "workspace-1", displayName: "Sandbox" },
        plan: { id: "b".repeat(20), operations: ["create"] },
        items: { semanticModelId: "model-1", reportId: "report-1" },
        connectionId: "connection-1",
        cli: { status: "accepted", connectionBinding: true, reportBinding: true, refresh: "Completed", acceptance: { rowCount: 1, columnCount: 2, nonNull: true } },
        browser: { reportOpens: true, visualRenders: true, labelsAndValues: true, keyboardNavigation: true, selectionInteraction: true, noUnexpectedErrors: true },
        evidence: [{ kind: "receipt", reference: "receipt.json", sha256: "c".repeat(64) }, { kind: "screenshot", reference: "report.png", sha256: "d".repeat(64) }],
      };
      await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
      const certified = await run(process.execPath, [cli, "certify", "validate", file, "--json"], { cwd: root });
      expect(JSON.parse(certified.stdout)).toMatchObject({ ok: true, status: "certified" });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test("initializes, checks, compiles, and verifies hello world", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-cli-test-"));
    const project = path.join(temporary, "first-dashboard");
    try {
      const initialized = await run(process.execPath, [cli, "init", project, "--title", "First Dashboard", "--json"], { cwd: root });
      expect(JSON.parse(initialized.stdout)).toMatchObject({ ok: true, template: "hello-world", application: { id: "first-dashboard", title: "First Dashboard" } });
      const checked = await run(process.execPath, [cli, "check", project, "--json"], { cwd: root });
      expect(JSON.parse(checked.stdout).ok).toBe(true);
      const built = await run(process.execPath, [cli, "compile", project, "--json"], { cwd: root });
      expect(JSON.parse(built.stdout).fileCount).toBeGreaterThan(35);
      const verified = await run(process.execPath, [cli, "verify", project, "--json"], { cwd: root });
      expect(JSON.parse(verified.stdout).ok).toBe(true);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test("plans and applies a recoverable legacy broker migration", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-cli-migrate-"));
    const project = path.join(temporary, "legacy-dashboard");
    try {
      await run(process.execPath, [cli, "init", project, "--json"], { cwd: root });
      const brokerPath = path.join(project, "contracts", "widget-broker.json");
      const legacy = JSON.parse(await readFile(brokerPath, "utf8"));
      delete legacy.contractVersion;
      await writeFile(brokerPath, `${JSON.stringify(legacy, null, 2)}\n`);
      const planned = await run(process.execPath, [cli, "migrate", project, "--json"], { cwd: root });
      expect(JSON.parse(planned.stdout)).toMatchObject({ ok: true, status: "planned", dryRun: true, migrations: [{ contract: "widget-broker", from: "legacy-unversioned", to: 1 }] });
      expect(JSON.parse(await readFile(brokerPath, "utf8")).contractVersion).toBeUndefined();
      const applied = await run(process.execPath, [cli, "migrate", project, "--write", "--json"], { cwd: root });
      const migrated = JSON.parse(applied.stdout);
      expect(migrated).toMatchObject({ ok: true, status: "migrated", dryRun: false });
      expect(JSON.parse(await readFile(brokerPath, "utf8")).contractVersion).toBe(1);
      expect(JSON.parse(await readFile(path.join(migrated.backupDirectory, "contracts", "widget-broker.json"), "utf8")).contractVersion).toBeUndefined();
      const current = await run(process.execPath, [cli, "migrate", project, "--json"], { cwd: root });
      expect(JSON.parse(current.stdout)).toMatchObject({ ok: true, status: "current", migrations: [] });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test("builds hello world with an untracked hosted source profile", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-cli-profile-"));
    const project = path.join(temporary, "hosted-hello");
    const profile = path.join(temporary, "source-profile.json");
    try {
      await run(process.execPath, [cli, "init", project, "--json"], { cwd: root });
      await writeFile(profile, `${JSON.stringify({ contractVersion: 1, kind: "fabric-sql-source", source: { server: "warehouse.example.fabric.microsoft.com", database: "SuperVisualSandbox" } }, null, 2)}\n`);
      const built = await run(process.execPath, [cli, "compile", project, "--parameters-file", profile, "--json"], { cwd: root });
      expect(JSON.parse(built.stdout)).toMatchObject({ ok: true, sourceProfileApplied: true });
      const expressions = await readFile(path.join(project, "dist", "SemanticAdapter.SemanticModel", "definition", "expressions.tmdl"), "utf8");
      expect(expressions).toContain("warehouse.example.fabric.microsoft.com");
      expect(expressions).toContain("SuperVisualSandbox");
      const manifest = JSON.parse(await readFile(path.join(project, "dist", "supervisual.manifest.json"), "utf8"));
      expect(manifest.provenance.semanticParameterOverrides).toEqual(["database", "server"]);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test("checks the standalone sample with machine-readable output", async () => {
    const { stdout } = await run(process.execPath, [cli, "check", "examples/adventureworks", "--json"], { cwd: root });
    expect(JSON.parse(stdout).ok).toBe(true);
  });
  test("builds and verifies the standalone sample", async () => {
    const built = await run(process.execPath, [cli, "build", "examples/adventureworks", "--json"], { cwd: root });
    expect(JSON.parse(built.stdout).fileCount).toBeGreaterThan(50);
    const verified = await run(process.execPath, [cli, "verify", "examples/adventureworks", "--json"], { cwd: root });
    expect(JSON.parse(verified.stdout).ok).toBe(true);
  });
});
