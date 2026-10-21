import { execFile, spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { createCommandProgressRenderer, formatPublishPlanResult, formatPublishResult, selectedConnectionDefaults, validateFabricId } from "../src/main.mjs";
import { readProjectTarget } from "../src/project-target.mjs";

const run = promisify(execFile);
const root = path.resolve(".");
const cli = path.join(root, "packages", "cli", "bin", "supervisual.mjs");

describe("supervisual CLI", () => {
  test("animates an in-place ASCII spinner while a terminal step is running", () => {
    const writes = [];
    const scheduled = [];
    const cancelled = [];
    const renderer = createCommandProgressRenderer({
      write: (value) => writes.push(value),
      isTTY: () => true,
      startTimer: (callback, milliseconds) => {
        scheduled.push({ callback, milliseconds });
        return "spinner-timer";
      },
      cancelTimer: (timer) => cancelled.push(timer),
    });

    renderer.handle({ status: "running", message: "Creating the deployment plan" });
    scheduled[0].callback();
    scheduled[0].callback();
    renderer.handle({ status: "passed", message: "Created the deployment plan" });

    expect(scheduled[0].milliseconds).toBe(120);
    expect(writes).toEqual(expect.arrayContaining([
      "> Creating the deployment plan\n",
      "\r| Working...",
      "\r/ Working...",
      "\r- Working...",
      "✓ Created the deployment plan\n",
    ]));
    expect(cancelled).toEqual(["spinner-timer"]);
  });

  test("describes a completed publish and prints its Power BI report URL", () => {
    const result = {
      accepted: true,
      planId: "plan-123",
      workspace: { id: "workspace-1", displayName: "Release Workspace" },
      items: {
        semanticModel: { id: "model-1", displayName: "Sales Report — Super Visual data" },
        report: { id: "report-1", displayName: "Sales Report" },
      },
      verification: {
        binding: { connectionId: "connection-1" },
        refresh: { status: "Completed" },
        acceptance: { rowCount: 1, columnCount: 1, nonNull: true },
      },
      receiptPath: "/tmp/deploy-receipt.json",
    };
    const summary = formatPublishResult(result);

    expect(summary).toContain("Publish complete — Sales Report is live.");
    expect(summary).toContain("Workspace: Release Workspace (workspace-1)");
    expect(summary).toContain("Semantic model: Sales Report — Super Visual data (model-1)");
    expect(summary).toContain("Verification: connection bound · refresh Completed · acceptance query passed (1 row)");
    expect(summary).toContain("Receipt: /tmp/deploy-receipt.json");
    expect(summary).not.toContain("Deployment result (JSON)");
    expect(summary).not.toContain('"reportUrl"');
    expect(summary).toContain("Open the report:\nhttps://app.powerbi.com/groups/workspace-1/reports/report-1");
    expect(summary.trimEnd()).toMatch(/https:\/\/app\.powerbi\.com\/groups\/workspace-1\/reports\/report-1$/);
    expect(summary.trimStart()).not.toMatch(/^\{/);

    const included = formatPublishResult(result, { includeJson: true });
    expect(included).toContain("Receipt: /tmp/deploy-receipt.json\n\nDeployment result (JSON):\n{");
    expect(included).toContain('"reportUrl": "https://app.powerbi.com/groups/workspace-1/reports/report-1"');
    expect(included).toContain("}\n\nOpen the report:\nhttps://app.powerbi.com/groups/workspace-1/reports/report-1");
    expect(included.trimEnd()).toMatch(/https:\/\/app\.powerbi\.com\/groups\/workspace-1\/reports\/report-1$/);
  });

  test("suppresses blocked plan JSON by default and includes it only when requested", () => {
    const url = "https://app.powerbi.com/groups/workspace-1/reports/report-1";
    const result = {
      ok: false,
      status: "blocked",
      workspace: { id: "workspace-1", displayName: "Release Workspace" },
      actions: [
        { key: "semanticModel", operation: "blocked", existingId: "model-1" },
        { key: "report", operation: "blocked", existingId: "report-1" },
      ],
      blockers: ["Report already exists"],
      planId: "plan-123",
      planPath: "/tmp/deploy-plan.json",
    };
    const output = formatPublishPlanResult(result);

    expect(output).toContain("Publishing stopped — the deployment plan has blockers.");
    expect(output).toContain("Plan ID: plan-123");
    expect(output).toContain("Blockers:\n  - Report already exists");
    expect(output).not.toContain('"reportUrl"');
    expect(output).toContain(`Open the report:\n${url}\n`);
    expect(output.trimEnd().endsWith(url)).toBe(true);

    const included = formatPublishPlanResult(result, { includeJson: true });
    expect(included).toContain("\nDeployment plan (JSON):\n{");
    expect(included).toContain(`"reportUrl": "${url}"`);
    expect(included).toContain(`\n}\n\nOpen the report:\n${url}\n`);
    expect(included.trimEnd().endsWith(url)).toBe(true);
  });

  test("exposes a discoverable command surface and version", async () => {
    const help = await run(process.execPath, [cli, "--help"], { cwd: root });
    expect(help.stdout).toContain("discover");
    expect(help.stdout).toContain("init");
    expect(help.stdout).toContain("migrate");
    expect(help.stdout).toContain("package");
    expect(help.stdout).toContain("import");
    expect(help.stdout).toContain("semantic");
    expect(help.stdout).toContain("dev");
    expect(help.stdout).toContain("publish");
    expect(help.stdout).toContain("preview");
    expect(help.stdout).toContain("certify");
    expect(help.stdout).toContain("deploy");
    const version = await run(process.execPath, [cli, "--version"], { cwd: root });
    expect(version.stdout.trim()).toBe("0.2.0-alpha.3");
    const deployHelp = await run(process.execPath, [cli, "deploy", "--help"], { cwd: root });
    expect(deployHelp.stdout).toContain("discover");
    expect(deployHelp.stdout).toContain("workspaces");
    expect(deployHelp.stdout).toContain("diff");
    expect(deployHelp.stdout).toContain("restore");
    expect(deployHelp.stdout).toContain("status");
    const semanticHelp = await run(process.execPath, [cli, "semantic", "--help"], { cwd: root });
    expect(semanticHelp.stdout).toContain("discover");
    expect(semanticHelp.stdout).toContain("check");
    const previewHelp = await run(process.execPath, [cli, "preview", "--help"], { cwd: root });
    expect(previewHelp.stdout).toContain("test");
    const publishHelp = await run(process.execPath, [cli, "publish", "--help"], { cwd: root });
    expect(publishHelp.stdout).toContain("--pre-authorize");
    expect(publishHelp.stdout).toContain("--semantic-model-id");
    expect(publishHelp.stdout).toContain("--include-json");
    expect(publishHelp.stdout).not.toContain("--semantic-model-name");
  }, 15000);

  test("uses human output by default and exposes explicit JSON modes", async () => {
    const human = await run(process.execPath, [cli, "templates"], { cwd: root });
    expect(human.stdout).toContain("2 project templates available:");
    expect(human.stdout).toContain("hello-world");
    expect(human.stdout).not.toContain("Details (JSON)");
    expect(human.stdout).not.toContain('"templates"');

    const included = await run(process.execPath, [cli, "templates", "--include-json"], { cwd: root });
    expect(included.stdout).toContain("2 project templates available:");
    expect(included.stdout).toContain("\nDetails (JSON):\n{");
    const includedJson = included.stdout.split("\nDetails (JSON):\n")[1].trim();
    expect(JSON.parse(includedJson)).toMatchObject({ ok: true, templates: expect.any(Array) });

    const machine = await run(process.execPath, [cli, "templates", "--json"], { cwd: root });
    expect(JSON.parse(machine.stdout)).toMatchObject({ ok: true, templates: expect.any(Array) });
    expect(machine.stdout).not.toContain("project templates available");
  });

  test("treats legacy saved model IDs as internal managed state", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-cli-target-"));
    try {
      await mkdir(path.join(temporary, ".supervisual"));
      await writeFile(path.join(temporary, ".supervisual", "target.json"), `${JSON.stringify({ contractVersion: 1, kind: "supervisual-project-target", workspace: { id: "workspace-1" }, semanticModel: { id: "legacy-managed-model" } })}\n`);
      expect(await readProjectTarget(temporary)).toMatchObject({ contractVersion: 2, managedSemanticModel: { id: "legacy-managed-model" } });
      expect((await readProjectTarget(temporary)).semanticModel).toBeUndefined();
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test("reuses one selected-model SQL connection without user-supplied adapter settings", () => {
    expect(selectedConnectionDefaults([{ id: "connection-1", connectivityType: "ShareableCloud", connectionDetails: { type: "SQL", path: "server.example.com;Sales" } }])).toEqual({
      connectionId: "connection-1",
      connectionMode: "ShareableCloud",
      semanticParameters: { server: "server.example.com", database: "Sales" },
    });
    expect(selectedConnectionDefaults([
      { id: "connection-1", connectionDetails: { type: "SQL", path: "one;Sales" } },
      { id: "connection-2", connectionDetails: { type: "SQL", path: "two;Sales" } },
    ])).toBeNull();
  });

  test("rejects malformed Fabric IDs before attempting live validation", async () => {
    const validWorkspaceId = "ca9d62ac-0a1c-4fa2-b384-5d6604f1b664";
    expect(validateFabricId(validWorkspaceId, "--workspace-id")).toBeUndefined();
    expect(() => validateFabricId("a9d62ac-0a1c-4fa2-b384-5d6604f1b664", "--workspace-id")).toThrow(/--workspace-id must be a 36-character GUID.*35 characters/);

    const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-cli-invalid-id-"));
    const project = path.join(temporary, "invalid-binding");
    try {
      await expect(run(process.execPath, [
        cli, "init", project,
        "--workspace-id", "a9d62ac-0a1c-4fa2-b384-5d6604f1b664",
        "--semantic-model-id", "408d70eb-491e-45ac-8230-8d76e6be525a",
      ], { cwd: root })).rejects.toMatchObject({
        stderr: expect.stringMatching(/Super Visual could not initialize the project because the workspace ID is not valid\.[\s\S]*Copy the complete workspace ID from Fabric[\s\S]*Technical details: --workspace-id must be a 36-character GUID.*35 characters/),
      });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
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
  }, 15000);

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

  test("initializes, checks, compiles, and verifies the blank starter", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-cli-test-"));
    const project = path.join(temporary, "first-dashboard");
    try {
      const initialized = await run(process.execPath, [cli, "init", project, "--title", "First Dashboard", "--json"], { cwd: root });
      expect(JSON.parse(initialized.stdout)).toMatchObject({ ok: true, template: "blank", application: { id: "first-dashboard", title: "First Dashboard" } });
      const checked = await run(process.execPath, [cli, "check", project, "--json"], { cwd: root });
      expect(JSON.parse(checked.stdout).ok).toBe(true);
      const sourcePath = path.join(project, "source", "reportApplication.tsx");
      const source = (await readFile(sourcePath, "utf8")).replace("Your full-page React canvas is ready", "This edit came from the live source directory");
      await writeFile(sourcePath, source);
      const built = await run(process.execPath, [cli, "compile", project, "--json"], { cwd: root });
      expect(JSON.parse(built.stdout).fileCount).toBeGreaterThan(35);
      expect(await readFile(path.join(project, "dist", "Visual", "src", "reportApplication.tsx"), "utf8")).toContain("This edit came from the live source directory");
      const verified = await run(process.execPath, [cli, "verify", project, "--json"], { cwd: root });
      expect(JSON.parse(verified.stdout).ok).toBe(true);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }, 15000);

  test("explains initialization and validation without dumping JSON by default", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-cli-human-init-"));
    const project = path.join(temporary, "hello-human");
    const projectWithJson = path.join(temporary, "hello-with-json");
    try {
      const initialized = await run(process.execPath, [cli, "init", project, "--template", "hello-world"], { cwd: root });
      expect(initialized.stderr).toContain("Super Visual init");
      expect(initialized.stderr).toContain(`> Creating hello-world project in ${project}`);
      expect(initialized.stderr).toContain("✓ Created project files from the hello-world template");
      expect(initialized.stderr).toContain("> Synchronizing React source and report-source contract");
      expect(initialized.stderr).toContain("> Validating generated contracts, bindings, and source policy");
      expect(initialized.stderr).toContain("✓ 6 local validation checks passed with no diagnostics");
      expect(initialized.stderr.indexOf("> Creating hello-world project")).toBeLessThan(initialized.stderr.indexOf("✓ Created project files"));
      expect(initialized.stdout).toContain("Initialization complete — Hello Human is ready.");
      expect(initialized.stdout).not.toContain("Initialization manifest (JSON):");
      expect(initialized.stdout).not.toContain('"validation"');
      expect(initialized.stdout).toContain("supervisual dev --open");

      const included = await run(process.execPath, [cli, "init", projectWithJson, "--template", "hello-world", "--include-json"], { cwd: root });
      expect(included.stdout).toContain("Initialization complete — Hello With Json is ready.");
      expect(included.stdout).toContain("\nInitialization manifest (JSON):\n{");
      const manifestText = included.stdout.split("Initialization manifest (JSON):\n")[1].split("\n\nNext:\n")[0];
      expect(JSON.parse(manifestText)).toMatchObject({
        ok: true,
        status: "ready",
        template: "hello-world",
        validation: {
          local: { ok: true, status: "passed", checks: expect.arrayContaining(["project-contract", "widget-broker"]) },
          live: { status: "not-run", scope: "fabric-read-only" },
        },
      });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test("streams publish progress before Fabric validation completes", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-cli-publish-progress-"));
    const project = path.join(temporary, "publish-progress");
    const fakeBin = path.join(temporary, "bin");
    const fakeAz = path.join(fakeBin, "az");
    try {
      await run(process.execPath, [
        cli, "init", project,
        "--workspace-id", "11111111-1111-1111-1111-111111111111",
        "--semantic-model-id", "22222222-2222-2222-2222-222222222222",
        "--skip-live-validation",
        "--json",
      ], { cwd: root });
      await mkdir(fakeBin);
      await writeFile(fakeAz, `#!/usr/bin/env node\nsetTimeout(() => { process.stderr.write("delayed mock authentication failure\\n"); process.exit(1); }, 1000);\n`);
      await chmod(fakeAz, 0o755);

      const child = spawn(process.execPath, [cli, "publish", project], {
        cwd: root,
        env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}` },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      const completed = new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) => resolve(code));
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Publish did not stream progress before timeout:\n${stderr}`)), 5000);
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
          if (stderr.includes("> Checking Fabric workspace 11111111-1111-1111-1111-111111111111")) {
            clearTimeout(timer);
            resolve();
          }
        });
      });

      expect(child.exitCode).toBeNull();
      expect(stderr).toContain("Super Visual publish");
      expect(stderr).toContain("> Loading and validating the Super Visual project");
      expect(stderr).toContain("✓ Loaded and validated the Super Visual project");
      expect(stderr).toContain("> Loading the saved Fabric workspace and semantic-model binding");
      expect(await completed).not.toBe(0);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }, 15000);

  test("initializes a project with a reusable Fabric binding and existing React application", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-cli-bound-"));
    const project = path.join(temporary, "bound-dashboard");
    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const semanticModelId = "22222222-2222-2222-2222-222222222222";
    try {
      const initialized = await run(process.execPath, [
        cli, "init", project,
        "--app", "examples/hello-world/source",
        "--workspace-id", workspaceId,
        "--workspace-name", "Sandbox",
        "--semantic-model-id", semanticModelId,
        "--report-name", "Bound Dashboard",
        "--skip-live-validation",
        "--json",
      ], { cwd: root });
      expect(JSON.parse(initialized.stdout)).toMatchObject({
        ok: true,
        template: "blank",
        reactApplication: path.resolve("examples/hello-world/source"),
        binding: {
          workspace: { id: workspaceId, name: "Sandbox" },
          semanticModel: { id: semanticModelId },
          report: { name: "Bound Dashboard" },
        },
      });
      const target = JSON.parse(await readFile(path.join(project, ".supervisual", "target.json"), "utf8"));
      expect(target).toMatchObject({ contractVersion: 2, kind: "supervisual-project-target", workspace: { id: workspaceId }, semanticModel: { id: semanticModelId } });
      const checked = await run(process.execPath, [cli, "check", project, "--json"], { cwd: root });
      expect(JSON.parse(checked.stdout).ok).toBe(true);
      const devHelp = await run(process.execPath, [cli, "dev", "--help"], { cwd: root });
      expect(devHelp.stdout).not.toContain("required option '--workspace-id");
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
  }, 15000);

  test("builds hello world with an untracked hosted source profile", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-cli-profile-"));
    const project = path.join(temporary, "hosted-hello");
    const profile = path.join(temporary, "source-profile.json");
    try {
      await run(process.execPath, [cli, "init", project, "--template", "hello-world", "--json"], { cwd: root });
      const initializedSource = JSON.parse(await readFile(path.join(project, "contracts", "report-source.json"), "utf8"));
      expect(initializedSource.files.find((file) => file.path === "src/reportApplication.tsx")?.content).toContain("TYPE_ORDER");
      expect(initializedSource.files.find((file) => file.path === "src/reportApplication.tsx")?.content).toContain("selected semantic model");
      await writeFile(profile, `${JSON.stringify({ contractVersion: 1, kind: "fabric-sql-source", source: { server: "warehouse.example.fabric.microsoft.com", database: "SuperVisualSandbox" } }, null, 2)}\n`);
      const built = await run(process.execPath, [cli, "compile", project, "--parameters-file", profile, "--json"], { cwd: root });
      expect(JSON.parse(built.stdout)).toMatchObject({ ok: true, sourceProfileApplied: true });
      const expressions = await readFile(path.join(project, "dist", "SemanticAdapter.SemanticModel", "definition", "expressions.tmdl"), "utf8");
      expect(expressions).toContain("warehouse.example.fabric.microsoft.com");
      expect(expressions).toContain("SuperVisualSandbox");
      const catalog = await readFile(path.join(project, "dist", "SemanticAdapter.SemanticModel", "definition", "tables", "Super Visual Model Catalog.tmdl"), "utf8");
      expect(catalog).toContain("Entity Count");
      await expect(readFile(path.join(project, "dist", "Base.SemanticModel", "definition", "tables", "Super Visual Model Catalog.tmdl"), "utf8")).rejects.toThrow();
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
