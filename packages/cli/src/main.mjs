import { cp, mkdir, mkdtemp, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { writeSync } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import { Command, CommanderError } from "commander";
import { importClaudeDashboard, inspectClaudeDashboard } from "@datashow/super-visual-adapter-claude-dashboard";
import { buildSolution, embedVisualPackage, loadProject, refreshSolutionManifest, validateCompilation, verifySolutionManifest } from "@datashow/super-visual-compiler";
import { evaluateLiveCertification, loadContract, migrateProjectContracts } from "@datashow/super-visual-contracts";
import { applyDeploymentPlan, applyRestorePlan, checkSemanticCompatibility, createDeploymentDiff, createDeploymentPlan, createRestorePlan, discoverFabric, discoverFabricWorkspaces, inspectSemanticModel, readDeploymentStatus } from "@datashow/super-visual-fabric";
import { discoverInput, initializeProject, inspectProject, supportedAdapters, supportedTemplates, syncProjectSource } from "./project.mjs";
import { FabricHttpClient } from "./fabric-client.mjs";
import { resolveProjectTarget, targetUpdate, writeProjectTarget } from "./project-target.mjs";
import { runSemanticPreviewTest, startSemanticPreview } from "./semantic-preview.mjs";

const run = promisify(execFile);
const VERSION = "0.1.0-rc.6";
const FABRIC_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPINNER_FRAMES = ["|", "/", "-", "\\"];
const progressStream = process.stderr;
let activeProgress = null;

function writeProgress(value) {
  try {
    writeSync(2, value);
  } catch {
    progressStream.write(value);
  }
}

export class CliUserError extends Error {
  constructor(message, { summary, guidance } = {}) {
    super(message);
    this.name = "CliUserError";
    this.summary = summary;
    this.guidance = guidance;
  }
}

export function validateFabricId(value, optionName) {
  if (value === undefined) return;
  if (FABRIC_ID_PATTERN.test(value)) return;
  const target = optionName === "--workspace-id" ? "workspace" : "semantic model";
  throw new CliUserError(`${optionName} must be a 36-character GUID in 8-4-4-4-12 format; received "${value}" (${String(value).length} characters).`, {
    summary: `Super Visual could not initialize the project because the ${target} ID is not valid.`,
    guidance: `Copy the complete ${target} ID from Fabric and run the command again.`,
  });
}

function projectFile(input = ".") {
  const resolved = path.resolve(input);
  return path.extname(resolved) ? resolved : path.join(resolved, "supervisual.yaml");
}

function output(value, json) {
  process.stdout.write(`${json ? JSON.stringify(value) : typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
}

export function stopActiveProgress() {
  if (!activeProgress) return;
  clearInterval(activeProgress.timer);
  writeProgress(`\r${" ".repeat(activeProgress.width)}\r`);
  activeProgress = null;
}

export function writeCommandProgress(event) {
  if (event.status === "running") {
    stopActiveProgress();
    writeProgress(`> ${event.message}\n`);
    if (!progressStream.isTTY) return;
    let frame = 0;
    const render = () => {
      const line = `${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]} Working...`;
      writeProgress(`\r${line}`);
      activeProgress.width = Math.max(activeProgress.width, line.length);
      frame += 1;
    };
    activeProgress = { timer: null, width: 12 };
    render();
    activeProgress.timer = setInterval(render, 120);
    return;
  }
  stopActiveProgress();
  const marker = event.status === "passed" ? "✓" : "!";
  writeProgress(`${marker} ${event.message}\n`);
}

function printPreviewResult(result) {
  process.stdout.write(`\nLocal preview is ready.\n`);
  process.stdout.write(`URL: ${result.url}\n`);
  process.stdout.write(`Workspace: ${result.workspace.displayName} (${result.workspace.id})\n`);
  process.stdout.write(`Semantic model: ${result.semanticModel.displayName} (${result.semanticModel.id})\n`);
  process.stdout.write("The preview is using live semantic-model data. Press Ctrl+C to stop it.\n");
}

function semanticInventory(model) {
  const tables = model.tables ?? [];
  return {
    tables: tables.length,
    columns: tables.reduce((total, table) => total + (table.columns?.length ?? 0), 0),
    measures: tables.reduce((total, table) => total + (table.measures?.length ?? 0), 0),
    hierarchies: tables.reduce((total, table) => total + (table.hierarchies?.length ?? 0), 0),
    hierarchyLevels: tables.reduce((total, table) => total + (table.hierarchies ?? []).reduce((levels, hierarchy) => levels + (hierarchy.levels?.length ?? 0), 0), 0),
    relationships: model.relationships?.length ?? 0,
    parameters: model.parameters?.length ?? 0,
  };
}

function printInitializationResult(result) {
  process.stdout.write(`\nInitialization complete — ${result.application.title} is ready.\n`);
  process.stdout.write(`Project: ${result.directory}\n`);
  process.stdout.write(`Project manifest: ${result.projectFile}\n`);
  if (result.binding) {
    if (result.binding.workspace) process.stdout.write(`Workspace: ${result.binding.workspace.name ?? "(name not recorded)"} (${result.binding.workspace.id})\n`);
    if (result.binding.semanticModel) process.stdout.write(`Semantic model: ${result.binding.semanticModel.name ?? "(name not recorded)"} (${result.binding.semanticModel.id})\n`);
  }
  process.stdout.write(`\nInitialization manifest (JSON):\n${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`\nNext:\n${result.next.map((command) => `  ${command}`).join("\n")}\n`);
}

function jsonEnabled(command) {
  return Boolean(command.optsWithGlobals().json);
}

async function packageVisual(result) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-package-"));
  const visual = path.join(temporary, "Visual");
  await cp(path.join(result.outputDirectory, "Visual"), visual, { recursive: true });
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: visual, maxBuffer: 10 * 1024 * 1024 });
  await run("npm", ["run", "typecheck"], { cwd: visual, maxBuffer: 10 * 1024 * 1024 });
  await run("npm", ["run", "package"], { cwd: visual, maxBuffer: 20 * 1024 * 1024 });
  const name = (await readdir(path.join(visual, "dist"))).find((file) => file.endsWith(".pbiviz"));
  if (!name) throw new Error("pbiviz package did not produce a visual archive");
  const artifacts = path.join(result.outputDirectory, "Artifacts");
  await mkdir(artifacts, { recursive: true });
  const destination = path.join(artifacts, name);
  await cp(path.join(visual, "dist", name), destination);
  await embedVisualPackage(destination, path.join(result.outputDirectory, "Report.Report"));
  await refreshSolutionManifest(result.outputDirectory);
  return destination;
}

async function semanticParameters(file) {
  if (!file) return null;
  const profile = JSON.parse(await readFile(path.resolve(file), "utf8"));
  if (profile?.contractVersion !== 1 || profile?.kind !== "fabric-sql-source") throw new Error("Source profile must use contractVersion 1 and kind fabric-sql-source");
  const keys = Object.keys(profile.source ?? {});
  if (!keys.length || keys.some((key) => !["server", "database"].includes(key))) throw new Error("Source profile may contain only source.server and source.database");
  if (!["server", "database"].every((key) => typeof profile.source[key] === "string" && profile.source[key].trim())) throw new Error("Source profile requires non-empty source.server and source.database strings");
  return { server: profile.source.server.trim(), database: profile.source.database.trim() };
}

async function build(project, shouldPackage, parametersFile, semanticCatalogSource = null, semanticParameterOverride = null) {
  await syncProjectSource(projectFile(project));
  const parameters = semanticParameterOverride ?? await semanticParameters(parametersFile);
  const result = await buildSolution(projectFile(project), { semanticParameters: parameters, semanticCatalogSource });
  const artifact = shouldPackage ? await packageVisual(result) : null;
  const verified = await verifySolutionManifest(result.outputDirectory);
  return {
    ok: verified.ok,
    outputDirectory: result.outputDirectory,
    fileCount: verified.fileCount,
    sourceProfileApplied: Boolean(parameters),
    ...(artifact ? { visualPackage: artifact } : {}),
  };
}

export function selectedConnectionDefaults(references) {
  const bound = (references ?? []).filter((reference) => reference?.id && reference?.connectionDetails?.path);
  const identities = new Set(bound.map((reference) => `${reference.id}\u0000${reference.connectivityType ?? "ShareableCloud"}`));
  const paths = new Set(bound.map((reference) => `${reference.connectionDetails.type ?? ""}\u0000${reference.connectionDetails.path}`));
  if (identities.size !== 1 || paths.size !== 1) return null;
  const reference = bound[0];
  const pathParts = String(reference.connectionDetails.path).split(";").map((part) => part.trim()).filter(Boolean);
  const sqlSource = String(reference.connectionDetails.type).toLowerCase().includes("sql") && pathParts.length === 2
    ? { server: pathParts[0], database: pathParts[1] }
    : null;
  return { connectionId: reference.id, connectionMode: reference.connectivityType ?? "ShareableCloud", semanticParameters: sqlSource };
}

function addJsonOption(command) {
  return command.option("--json", "emit one machine-readable JSON value");
}

function usesSemanticCatalog(broker) {
  return (broker.widgets ?? []).some((widget) => [
    widget.axis,
    ...(widget.dimensions ?? []).flatMap((dimension) => [dimension.key, dimension.label]),
    ...(widget.measures ?? []),
  ].some((reference) => typeof reference === "string" && reference.startsWith("Super Visual Model Catalog[")));
}

async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

async function waitForPreviewShutdown(preview) {
  await new Promise((resolve) => {
    const stop = () => resolve();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  await preview.close();
}

async function confirmDeploymentPlan(plan) {
  printDeploymentPlan(plan);
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question(`Type ${plan.planId} to publish, or press Enter to stop: `);
    return answer.trim() === plan.planId;
  } finally {
    prompt.close();
  }
}

function printDeploymentPlan(plan) {
  const operations = plan.actions.map((action) => `${action.operation} ${action.type} “${action.displayName}”`).join("\n  - ");
  process.stdout.write(`\nReady to publish to ${plan.workspace.displayName} (${plan.workspace.id}):\n  - ${operations}\n\nPlan ID: ${plan.planId}\n`);
}

async function applySavedDeployment({ loaded, planPath, confirm, backup, receipt: receiptOption, resume, timeout }) {
  const resolvedPlanPath = path.resolve(planPath);
  const plan = JSON.parse(await readFile(resolvedPlanPath, "utf8"));
  if (confirm !== plan.planId) throw new Error(`Deployment requires exact plan confirmation ${plan.planId}`);
  if (receiptOption && resume && path.resolve(receiptOption) !== path.resolve(resume)) throw new Error("--receipt and --resume must identify the same file when both are supplied");
  const receiptPath = path.resolve(receiptOption ?? resume ?? path.join(loaded.root, ".supervisual", "deploy-receipt.json"));
  const receipt = resume
    ? JSON.parse(await readFile(path.resolve(resume), "utf8"))
    : { contractVersion: 1, kind: "supervisual-deployment-receipt", planId: plan.planId, workspace: plan.workspace, startedAt: new Date().toISOString(), status: "in-progress", items: {} };
  await writeJsonAtomic(receiptPath, receipt);
  const client = new FabricHttpClient({ timeoutSeconds: Number(timeout) });
  try {
    const result = await applyDeploymentPlan({
      client,
      plan,
      confirmPlanId: confirm,
      backupDirectory: backup ? path.resolve(backup) : undefined,
      resumeState: resume ? receipt : null,
      onProgress: async ({ action, item }) => {
        receipt.items[action] = item;
        receipt.status = "in-progress";
        receipt.updatedAt = new Date().toISOString();
        await writeJsonAtomic(receiptPath, receipt);
      },
    });
    receipt.items = result.items;
    receipt.status = result.status;
    receipt.completedAt = new Date().toISOString();
    receipt.verification = result.verification;
    await writeJsonAtomic(receiptPath, receipt);
    return { ...result, receiptPath, planPath: resolvedPlanPath };
  } catch (error) {
    receipt.status = "interrupted";
    receipt.updatedAt = new Date().toISOString();
    await writeJsonAtomic(receiptPath, receipt);
    throw error;
  }
}

function createProgram() {
  const program = new Command();
  program
    .name("supervisual")
    .description("Compile governed React dashboards into deployable Power BI applications.")
    .version(VERSION)
    .showHelpAfterError()
    .configureOutput({
      writeOut: (message) => process.stdout.write(message),
      writeErr: () => {},
    })
    .exitOverride();

  addJsonOption(program.command("discover [input]"))
    .description("detect a Super Visual project or supported dashboard input")
    .action(async (input = ".", options, command) => output(await discoverInput(input), jsonEnabled(command)));

  addJsonOption(program.command("inspect [project]"))
    .description("summarize a project, its bindings, policies, and generated output")
    .action(async (project = ".", options, command) => output(await inspectProject(projectFile(project)), jsonEnabled(command)));

  addJsonOption(program.command("migrate [project]"))
    .description("inspect contract versions and optionally apply recoverable source migrations")
    .option("--write", "apply available migrations; the default is a dry run")
    .option("--backup <directory>", "backup destination used with --write")
    .action(async (project = ".", options, command) => {
      if (options.backup && !options.write) throw new Error("--backup requires --write");
      const result = await migrateProjectContracts(projectFile(project), { write: Boolean(options.write), backupDirectory: options.backup ? path.resolve(options.backup) : undefined });
      output(result, jsonEnabled(command));
      return result;
    });

  addJsonOption(program.command("templates"))
    .description("list project templates available to init")
    .action((options, command) => output({ ok: true, templates: supportedTemplates() }, jsonEnabled(command)));

  addJsonOption(program.command("adapters"))
    .description("list source adapters and their compatibility status")
    .action((options, command) => output({ ok: true, adapters: supportedAdapters() }, jsonEnabled(command)));

  const importCommand = program.command("import").description("import a supported dashboard source into a Super Visual project");
  addJsonOption(importCommand.command("claude-dashboard <input>"))
    .description("statically inspect and import a Super Visual Claude-style dashboard bundle")
    .option("--project <directory>", "existing Super Visual project to update")
    .option("--inspect-only", "validate and report detected APIs without modifying the project")
    .action(async (input, options, command) => {
      if (options.inspectOnly) {
        const inspected = await inspectClaudeDashboard(input);
        const result = { ok: inspected.ok, input: inspected.input, manifestPath: inspected.manifestPath, adapter: "claude-dashboard", dashApis: inspected.dashApis, dataReads: inspected.dataReads, assets: inspected.assetReferences, diagnostics: inspected.diagnostics };
        output(result, jsonEnabled(command));
        if (!result.ok) process.exitCode = 1;
        return result;
      }
      if (!options.project) throw new Error("--project is required unless --inspect-only is used");
      const result = await importClaudeDashboard({ input, projectFile: projectFile(options.project) });
      output(result, jsonEnabled(command));
      return result;
    });

  addJsonOption(program.command("init <directory>"))
    .description("create a new Super Visual project")
    .option("--template <name>", "project template", "blank")
    .option("--app <path>", "existing Super Visual-compatible React application source")
    .option("--name <id>", "project identifier")
    .option("--title <title>", "display title")
    .option("--workspace-id <id>", "bind the project to an immutable Fabric workspace ID")
    .option("--workspace-name <name>", "expected workspace display name")
    .option("--semantic-model-id <id>", "Power BI semantic model that the report uses")
    .option("--report-name <name>", "target report name")
    .option("--connection-id <id>", "advanced override for the selected model's Fabric connection")
    .option("--connection-mode <mode>", "advanced Fabric connectivity override", "ShareableCloud")
    .option("--skip-live-validation", "save the binding without checking the workspace and semantic model")
    .option("--timeout <seconds>", "Fabric validation timeout", "900")
    .option("--force", "write into an existing empty directory")
    .action(async (directory, options, command) => {
      if ((options.workspaceName || options.semanticModelId || options.reportName || options.connectionId) && !options.workspaceId) throw new Error("--workspace-id is required when saving a Fabric binding");
      validateFabricId(options.workspaceId, "--workspace-id");
      validateFabricId(options.semanticModelId, "--semantic-model-id");
      const json = jsonEnabled(command);
      if (!json) writeProgress(`\nSuper Visual init\n\n`);
      let liveValidation = null;
      if (options.workspaceId && options.semanticModelId && !options.skipLiveValidation) {
        let inspected;
        try {
          const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout) });
          inspected = await inspectSemanticModel({
            client,
            workspaceId: options.workspaceId,
            workspaceName: options.workspaceName,
            semanticModelId: options.semanticModelId,
            onProgress: json ? null : writeCommandProgress,
          });
        } catch (error) {
          throw new CliUserError(error instanceof Error ? error.message : String(error), {
            summary: "Super Visual could not verify the Fabric workspace and semantic model.",
            guidance: "Confirm that you are signed in, can access the workspace, and copied both IDs from the same Fabric workspace.",
          });
        }
        liveValidation = {
          ok: true,
          status: "passed",
          scope: "fabric-read-only",
          workspace: inspected.workspace,
          semanticModel: { id: inspected.semanticModel.id, displayName: inspected.semanticModel.displayName, format: inspected.semanticModel.format },
          inventory: semanticInventory(inspected.semanticModel),
        };
        if (!json) writeCommandProgress({ status: "passed", message: `Verified workspace ${inspected.workspace.displayName} and semantic model ${inspected.semanticModel.displayName}` });
      } else if (!json && options.skipLiveValidation) {
        writeProgress("! Live Fabric validation skipped by request\n");
      } else if (!json) {
        writeProgress("! No complete Fabric binding supplied; live validation was not run\n");
      }
      const result = await initializeProject({
        directory,
        template: options.template,
        name: options.name,
        title: options.title,
        app: options.app,
        force: options.force,
        onProgress: json ? null : writeCommandProgress,
      });
      if (options.workspaceId) {
        if (!json) writeCommandProgress({ status: "running", message: "Saving the reusable Fabric project binding" });
        const saved = await writeProjectTarget(result.directory, targetUpdate({
          ...options,
          workspaceName: options.workspaceName ?? liveValidation?.workspace.displayName,
          semanticModelName: liveValidation?.semanticModel.displayName,
          reportName: options.reportName ?? result.application.title,
        }));
        result.binding = { file: saved.file, ...saved.value };
        if (!json) writeCommandProgress({ status: "passed", message: `Saved Fabric binding to ${saved.file}` });
      }
      result.validation = { local: result.validation, live: liveValidation ?? { ok: true, status: "not-run", scope: "fabric-read-only" } };
      if (json) output(result, true);
      else printInitializationResult(result);
    });

  addJsonOption(program.command("check [project]"))
    .description("validate project contracts, semantic bindings, and source policy")
    .action(async (project = ".", options, command) => {
      const loaded = await loadProject(projectFile(project));
      const diagnostics = validateCompilation(loaded);
      const result = { ok: diagnostics.length === 0, project: projectFile(project), diagnostics };
      output(result, jsonEnabled(command));
      if (!result.ok) process.exitCode = 1;
      return result;
    });

  addJsonOption(program.command("build [project]").alias("compile"))
    .description("compile a deterministic, inspectable solution bundle")
    .option("--package", "also create and embed the deployable .pbiviz archive")
    .option("--parameters-file <file>", "deployment source profile with service-reachable server and database")
    .action(async (project = ".", options, command) => output(await build(project, Boolean(options.package), options.parametersFile), jsonEnabled(command)));

  addJsonOption(program.command("package [project]"))
    .description("compile, package, embed, and verify a deployable solution")
    .option("--parameters-file <file>", "deployment source profile with service-reachable server and database")
    .action(async (project = ".", options, command) => output(await build(project, true, options.parametersFile), jsonEnabled(command)));

  addJsonOption(program.command("verify [project]"))
    .description("verify every generated file against the solution manifest")
    .action(async (project = ".", options, command) => {
      const loaded = await loadProject(projectFile(project));
      const result = await verifySolutionManifest(path.resolve(loaded.root, loaded.project.output.directory));
      output(result, jsonEnabled(command));
      if (!result.ok) process.exitCode = 1;
      return result;
    });

  addJsonOption(program.command("dev [project]"))
    .description("serve the local React application against a live semantic model")
    .option("--workspace-id <id>", "immutable Fabric workspace ID; defaults to the saved project binding")
    .option("--workspace-name <name>", "expected workspace display name")
    .option("--semantic-model-id <id>", "Power BI semantic model ID; defaults to the saved project binding")
    .option("--host <host>", "loopback host", "127.0.0.1")
    .option("--port <port>", "local preview port", "5173")
    .option("--open", "open the preview in the default browser")
    .option("--timeout <seconds>", "Fabric operation timeout", "900")
    .action(async (project = ".", options, command) => {
      const json = jsonEnabled(command);
      if (!json) writeProgress(`\nSuper Visual dev\n\n`);
      try {
        if (!json) writeCommandProgress({ status: "running", message: "Synchronizing the React source and report contract" });
        await syncProjectSource(projectFile(project));
        if (!json) writeCommandProgress({ status: "passed", message: "Synchronized the React source and report contract" });
        if (!json) writeCommandProgress({ status: "running", message: "Loading the saved Fabric project binding" });
        const loaded = await loadProject(projectFile(project));
        const target = await resolveProjectTarget(loaded.root, options, { requireSemanticModel: true });
        if (!json) writeCommandProgress({ status: "passed", message: "Loaded the Fabric workspace and semantic-model binding" });
        const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout) });
        const preview = await startSemanticPreview({
          client,
          projectFile: projectFile(project),
          workspaceId: target.workspaceId,
          workspaceName: target.workspaceName,
          semanticModelId: target.semanticModelId ?? target.managedSemanticModelId,
          host: options.host,
          port: Number(options.port),
          open: Boolean(options.open),
          onProgress: json ? null : writeCommandProgress,
        });
        const { close, ...result } = preview;
        if (json) output(result, true);
        else printPreviewResult(result);
        await waitForPreviewShutdown({ close });
      } catch (error) {
        throw new CliUserError(error instanceof Error ? error.message : String(error), {
          summary: "Super Visual could not start the local semantic preview.",
          guidance: "Check the project binding and your Fabric access, then run supervisual dev --open again.",
        });
      }
    });

  const preview = program.command("preview").description("exercise the local React host against a live semantic model");
  addJsonOption(preview.command("test [project]"))
    .description("run a headless semantic-data and interaction smoke test")
    .option("--workspace-id <id>", "immutable Fabric workspace ID; defaults to the saved project binding")
    .option("--workspace-name <name>", "expected workspace display name")
    .option("--semantic-model-id <id>", "Power BI semantic model ID; defaults to the saved project binding")
    .option("--timeout <seconds>", "Fabric operation timeout", "900")
    .option("--browser-timeout <milliseconds>", "browser acceptance timeout", "60000")
    .action(async (project = ".", options, command) => {
      await syncProjectSource(projectFile(project));
      const loaded = await loadProject(projectFile(project));
      const target = await resolveProjectTarget(loaded.root, options, { requireSemanticModel: true });
      const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout) });
      const result = await runSemanticPreviewTest({
        client,
        projectFile: projectFile(project),
        workspaceId: target.workspaceId,
        workspaceName: target.workspaceName,
        semanticModelId: target.semanticModelId ?? target.managedSemanticModelId,
        timeoutMs: Number(options.browserTimeout),
      });
      output(result, jsonEnabled(command));
      return result;
    });

  const certify = program.command("certify").description("validate redacted live deployment and browser evidence");
  addJsonOption(certify.command("validate <record>"))
    .description("validate and grade a live certification record")
    .action(async (record, options, command) => {
      const value = await loadContract("live-certification-record", path.resolve(record));
      const result = evaluateLiveCertification(value);
      output({ ...result, record: path.resolve(record) }, jsonEnabled(command));
      if (!result.ok) process.exitCode = 1;
      return result;
    });

  const semantic = program.command("semantic").description("inspect live semantic models and validate project compatibility without mutation");
  addJsonOption(semantic.command("discover"))
    .description("read a semantic model's TMDL inventory and optionally execute acceptance DAX")
    .requiredOption("--workspace-id <id>", "immutable Fabric workspace ID")
    .option("--workspace-name <name>", "expected workspace display name")
    .requiredOption("--semantic-model-id <id>", "exact semantic model ID")
    .option("--acceptance-query-file <file>", "DAX acceptance query to execute read-only")
    .option("--timeout <seconds>", "Fabric operation timeout", "900")
    .action(async (options, command) => {
      const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout) });
      const acceptanceDax = options.acceptanceQueryFile ? await readFile(path.resolve(options.acceptanceQueryFile), "utf8") : null;
      const result = await inspectSemanticModel({ client, workspaceId: options.workspaceId, workspaceName: options.workspaceName, semanticModelId: options.semanticModelId, acceptanceDax });
      output(result, jsonEnabled(command));
      return result;
    });

  addJsonOption(semantic.command("check [project]"))
    .description("compare a project's semantic and broker contracts with a live semantic model")
    .requiredOption("--workspace-id <id>", "immutable Fabric workspace ID")
    .option("--workspace-name <name>", "expected workspace display name")
    .requiredOption("--semantic-model-id <id>", "exact semantic model ID")
    .option("--acceptance-query-file <file>", "DAX acceptance query to execute read-only")
    .option("--timeout <seconds>", "Fabric operation timeout", "900")
    .action(async (project = ".", options, command) => {
      const loaded = await loadProject(projectFile(project));
      const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout) });
      const acceptanceDax = options.acceptanceQueryFile ? await readFile(path.resolve(options.acceptanceQueryFile), "utf8") : null;
      const inspected = await inspectSemanticModel({ client, workspaceId: options.workspaceId, workspaceName: options.workspaceName, semanticModelId: options.semanticModelId, acceptanceDax });
      const compatibility = checkSemanticCompatibility(inspected.semanticModel, loaded.semanticModel, loaded.broker);
      const result = { ...inspected, ok: compatibility.ok, compatibility };
      output(result, jsonEnabled(command));
      if (!result.ok) process.exitCode = 1;
      return result;
    });

  addJsonOption(program.command("publish [project]"))
    .description("package, plan, and safely publish the report using its saved Fabric binding")
    .option("--workspace-id <id>", "immutable Fabric workspace ID; defaults to the saved project binding")
    .option("--workspace-name <name>", "expected workspace display name")
    .option("--semantic-model-id <id>", "Power BI semantic model ID; defaults to the saved project binding")
    .option("--report-name <name>", "target report name")
    .option("--connection-id <id>", "advanced override for the selected model's Fabric connection")
    .option("--connection-mode <mode>", "advanced Fabric connectivity override", "ShareableCloud")
    .option("--parameters-file <file>", "advanced source-path override for managed deployment")
    .option("--acceptance-query-file <file>", "advanced DAX acceptance override")
    .option("--allow-updates", "allow a plan that replaces same-named remote items")
    .option("--confirm <plan-id>", "apply the previously reviewed exact plan ID")
    .option("--pre-authorize", "authorize and apply the plan generated by this invocation without prompting")
    .option("--plan <file>", "deployment plan path; defaults to .supervisual/deploy-plan.json")
    .option("--backup <directory>", "required backup destination for updates")
    .option("--receipt <file>", "deployment progress receipt destination")
    .option("--resume <file>", "resume from a matching interrupted receipt")
    .option("--timeout <seconds>", "Fabric operation timeout", "900")
    .action(async (project = ".", options, command) => {
      const loaded = await loadProject(projectFile(project));
      const planPath = path.resolve(options.plan ?? path.join(loaded.root, ".supervisual", "deploy-plan.json"));
      if (options.confirm && options.preAuthorize) throw new Error("--confirm and --pre-authorize are mutually exclusive");
      if (options.confirm) {
        const result = await applySavedDeployment({ loaded, planPath, confirm: options.confirm, backup: options.backup, receipt: options.receipt, resume: options.resume, timeout: options.timeout });
        await writeProjectTarget(loaded.root, targetUpdate({
          workspaceId: result.workspace.id,
          workspaceName: result.workspace.displayName,
          managedSemanticModelId: result.items.semanticModel?.id,
          managedSemanticModelName: result.items.semanticModel?.displayName,
          reportId: result.items.report?.id,
          reportName: result.items.report?.displayName,
        }));
        output({ ok: result.accepted, ...result }, jsonEnabled(command));
        if (!result.accepted) process.exitCode = 3;
        return result;
      }

      const target = await resolveProjectTarget(loaded.root, options, { requireSemanticModel: true });
      const reportName = target.reportName ?? loaded.project.application.title;
      const semanticModelName = target.managedSemanticModelName ?? `${reportName} — Super Visual data`;
      const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout) });
      const selectedSemanticModelId = target.semanticModelId ?? target.managedSemanticModelId;
      const inspected = await inspectSemanticModel({ client, workspaceId: target.workspaceId, workspaceName: target.workspaceName, semanticModelId: selectedSemanticModelId });
      const compatibility = usesSemanticCatalog(loaded.broker)
        ? { ok: true, summary: { required: 1, matched: 1, missing: 0, ambiguous: 0 }, diagnostics: [] }
        : checkSemanticCompatibility(inspected.semanticModel, loaded.semanticModel, loaded.broker);
      if (!compatibility.ok) throw new Error(`Selected semantic model is incompatible:\n- ${compatibility.diagnostics.map((item) => item.message).join("\n- ")}`);
      const selectedConnection = selectedConnectionDefaults(await client.getSemanticConnections(target.workspaceId, selectedSemanticModelId));
      const connectionId = target.connectionId ?? selectedConnection?.connectionId;
      const connectionMode = target.connectionId ? target.connectionMode : selectedConnection?.connectionMode ?? target.connectionMode;
      const automaticParameters = options.parametersFile ? null : selectedConnection?.semanticParameters;
      if (!connectionId) throw new Error("The selected semantic model does not expose one reusable Fabric connection. Use the advanced --connection-id override.");
      if (!options.parametersFile && !automaticParameters) throw new Error("The selected semantic model source path cannot be reused automatically. Use the advanced --parameters-file override.");
      const packaged = await build(project, true, options.parametersFile, inspected.semanticModel, automaticParameters);
      if (!packaged.ok) throw new Error("Packaged solution manifest verification failed");
      const acceptanceDax = options.acceptanceQueryFile ? await readFile(path.resolve(options.acceptanceQueryFile), "utf8") : 'EVALUATE ROW("Super Visual", 1)';
      const postDeployment = { connectionId, connectivityType: connectionMode, timeoutSeconds: Number(options.timeout), acceptanceDax };
      const plan = await createDeploymentPlan({
        client,
        workspaceId: target.workspaceId,
        workspaceName: target.workspaceName,
        solutionDirectory: packaged.outputDirectory,
        semanticModelName,
        reportName,
        allowUpdates: Boolean(options.allowUpdates),
        postDeployment,
      });
      await writeJsonAtomic(planPath, plan);
      await writeProjectTarget(loaded.root, targetUpdate({
        workspaceId: target.workspaceId,
        workspaceName: plan.workspace.displayName,
        semanticModelId: target.semanticModelId,
        semanticModelName: target.semanticModelId ? inspected.semanticModel.displayName : target.semanticModelName,
        managedSemanticModelName: semanticModelName,
        reportName,
        connectionId,
        connectionMode,
      }));
      const result = {
        ok: plan.blockers.length === 0,
        status: plan.blockers.length ? "blocked" : "planned",
        packaged,
        selectedSemanticModel: { id: inspected.semanticModel.id, displayName: inspected.semanticModel.displayName, compatibility: compatibility.summary },
        ...plan,
        planPath,
        next: plan.blockers.length ? null : `supervisual publish --confirm ${plan.planId}`,
      };
      if (!plan.blockers.length && options.preAuthorize) {
        if (!jsonEnabled(command)) {
          printDeploymentPlan(plan);
          process.stdout.write("Pre-authorization accepted; applying this generated plan without a second prompt.\n");
        }
        const applied = await applySavedDeployment({ loaded, planPath, confirm: plan.planId, backup: options.backup, receipt: options.receipt, resume: options.resume, timeout: options.timeout });
        await writeProjectTarget(loaded.root, targetUpdate({
          workspaceId: applied.workspace.id,
          workspaceName: applied.workspace.displayName,
          semanticModelId: target.semanticModelId,
          semanticModelName: target.semanticModelName,
          managedSemanticModelId: applied.items.semanticModel?.id,
          managedSemanticModelName: applied.items.semanticModel?.displayName,
          reportId: applied.items.report?.id,
          reportName: applied.items.report?.displayName,
        }));
        output({ ok: applied.accepted, preAuthorized: true, ...applied }, jsonEnabled(command));
        if (!applied.accepted) process.exitCode = 3;
        return applied;
      }
      if (!plan.blockers.length && !jsonEnabled(command) && process.stdin.isTTY && process.stdout.isTTY) {
        const confirmed = await confirmDeploymentPlan(plan);
        if (confirmed) {
          const applied = await applySavedDeployment({ loaded, planPath, confirm: plan.planId, backup: options.backup, receipt: options.receipt, resume: options.resume, timeout: options.timeout });
          await writeProjectTarget(loaded.root, targetUpdate({
            workspaceId: applied.workspace.id,
            workspaceName: applied.workspace.displayName,
            semanticModelId: target.semanticModelId,
            semanticModelName: target.semanticModelName,
            managedSemanticModelId: applied.items.semanticModel?.id,
            managedSemanticModelName: applied.items.semanticModel?.displayName,
            reportId: applied.items.report?.id,
            reportName: applied.items.report?.displayName,
          }));
          output({ ok: applied.accepted, ...applied }, false);
          if (!applied.accepted) process.exitCode = 3;
          return applied;
        }
        output(`Publish cancelled. The reviewed plan is saved at ${planPath}.`, false);
        return result;
      }
      output(result, jsonEnabled(command));
      if (plan.blockers.length) process.exitCode = 2;
      return result;
    });

  const deploy = program.command("deploy").description("plan and apply guarded Microsoft Fabric deployments");
  addJsonOption(deploy.command("workspaces"))
    .description("list accessible Fabric workspaces and immutable IDs without mutation")
    .option("--timeout <seconds>", "Fabric operation timeout", "900")
    .action(async (options, command) => {
      const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout) });
      output(await discoverFabricWorkspaces({ client }), jsonEnabled(command));
    });

  addJsonOption(deploy.command("discover"))
    .description("read workspace identity, items, and optionally accessible connections")
    .requiredOption("--workspace-id <id>", "immutable Fabric workspace ID")
    .option("--workspace-name <name>", "expected workspace display name")
    .option("--connections", "include accessible Fabric connections")
    .option("--timeout <seconds>", "Fabric operation timeout", "900")
    .action(async (options, command) => {
      const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout) });
      output(await discoverFabric({ client, workspaceId: options.workspaceId, workspaceName: options.workspaceName, includeConnections: Boolean(options.connections) }), jsonEnabled(command));
    });

  addJsonOption(deploy.command("status"))
    .description("read deployed binding, refresh, and optional live acceptance status")
    .requiredOption("--workspace-id <id>", "immutable Fabric workspace ID")
    .option("--workspace-name <name>", "expected workspace display name")
    .option("--semantic-model-id <id>", "exact deployed semantic model ID")
    .option("--report-id <id>", "exact deployed report ID")
    .option("--connection-id <id>", "expected bound Fabric connection ID")
    .option("--acceptance-query-file <file>", "DAX acceptance query to execute read-only")
    .option("--timeout <seconds>", "Fabric operation timeout", "900")
    .action(async (options, command) => {
      const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout) });
      const acceptanceDax = options.acceptanceQueryFile ? await readFile(path.resolve(options.acceptanceQueryFile), "utf8") : null;
      const result = await readDeploymentStatus({ client, workspaceId: options.workspaceId, workspaceName: options.workspaceName, semanticModelId: options.semanticModelId, reportId: options.reportId, connectionId: options.connectionId, acceptanceDax });
      output(result, jsonEnabled(command));
    });

  addJsonOption(deploy.command("diff [project]"))
    .description("compare local definitions with exact same-named Fabric items without mutation")
    .requiredOption("--workspace-id <id>", "immutable Fabric workspace ID")
    .option("--workspace-name <name>", "expected workspace display name")
    .requiredOption("--semantic-model-name <name>", "target semantic model name")
    .requiredOption("--report-name <name>", "target report name")
    .option("--timeout <seconds>", "Fabric operation timeout", "900")
    .action(async (project = ".", options, command) => {
      const loaded = await loadProject(projectFile(project));
      const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout) });
      const solutionDirectory = path.resolve(loaded.root, loaded.project.output.directory);
      const result = await createDeploymentDiff({ client, workspaceId: options.workspaceId, workspaceName: options.workspaceName, solutionDirectory, semanticModelName: options.semanticModelName, reportName: options.reportName });
      output(result, jsonEnabled(command));
      return result;
    });

  addJsonOption(deploy.command("plan [project]"))
    .description("inspect Fabric and write an immutable deployment plan")
    .requiredOption("--workspace-id <id>", "immutable Fabric workspace ID")
    .option("--workspace-name <name>", "expected workspace display name")
    .requiredOption("--semantic-model-name <name>", "target semantic model name")
    .requiredOption("--report-name <name>", "target report name")
    .option("--connection-id <id>", "Fabric connection ID for post-deployment binding")
    .option("--connection-mode <mode>", "Fabric connectivity type", "ShareableCloud")
    .option("--acceptance-query-file <file>", "DAX acceptance query to run after refresh")
    .option("--allow-updates", "allow plans that replace same-named remote items")
    .option("--output <file>", "deployment plan destination")
    .option("--timeout <seconds>", "Fabric operation timeout", "900")
    .action(async (project = ".", options, command) => {
      const loaded = await loadProject(projectFile(project));
      const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout) });
      const solutionDirectory = path.resolve(loaded.root, loaded.project.output.directory);
      const acceptanceDax = options.acceptanceQueryFile ? await readFile(path.resolve(options.acceptanceQueryFile), "utf8") : null;
      const postDeployment = options.connectionId ? { connectionId: options.connectionId, connectivityType: options.connectionMode, timeoutSeconds: Number(options.timeout), acceptanceDax } : null;
      const plan = await createDeploymentPlan({ client, workspaceId: options.workspaceId, workspaceName: options.workspaceName, solutionDirectory, semanticModelName: options.semanticModelName, reportName: options.reportName, allowUpdates: Boolean(options.allowUpdates), postDeployment });
      const planPath = path.resolve(options.output ?? path.join(loaded.root, ".supervisual", "deploy-plan.json"));
      await mkdir(path.dirname(planPath), { recursive: true });
      await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
      output({ ...plan, planPath }, jsonEnabled(command));
      if (plan.blockers.length) process.exitCode = 2;
      return plan;
    });

  addJsonOption(deploy.command("apply [project]"))
    .description("apply an exact deployment plan after explicit confirmation")
    .requiredOption("--plan <file>", "deployment plan created by deploy plan")
    .requiredOption("--confirm <plan-id>", "exact plan ID authorized by a human")
    .option("--backup <directory>", "required backup destination for updates")
    .option("--receipt <file>", "deployment progress receipt destination")
    .option("--resume <file>", "resume from a receipt written by an interrupted apply")
    .option("--timeout <seconds>", "Fabric operation timeout", "900")
    .action(async (project = ".", options, command) => {
      const loaded = await loadProject(projectFile(project));
      const result = await applySavedDeployment({ loaded, planPath: options.plan, confirm: options.confirm, backup: options.backup, receipt: options.receipt, resume: options.resume, timeout: options.timeout });
      output({ ok: result.accepted, ...result }, jsonEnabled(command));
      if (!result.accepted) process.exitCode = 3;
      return result;
    });

  const restore = deploy.command("restore").description("plan and apply an exact backup restoration");
  addJsonOption(restore.command("plan"))
    .description("verify a deployment backup and write an immutable restore plan")
    .requiredOption("--backup <directory>", "backup directory containing backup-manifest.json")
    .requiredOption("--workspace-id <id>", "immutable Fabric workspace ID")
    .option("--workspace-name <name>", "expected workspace display name")
    .option("--output <file>", "restore plan destination")
    .option("--timeout <seconds>", "Fabric operation timeout", "900")
    .action(async (options, command) => {
      const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout) });
      const plan = await createRestorePlan({ client, backupDirectory: path.resolve(options.backup), workspaceId: options.workspaceId, workspaceName: options.workspaceName });
      const planPath = path.resolve(options.output ?? path.join(options.backup, "restore-plan.json"));
      await mkdir(path.dirname(planPath), { recursive: true });
      await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
      output({ ...plan, planPath }, jsonEnabled(command));
      return plan;
    });

  addJsonOption(restore.command("apply"))
    .description("restore exact backed-up definitions after explicit plan confirmation")
    .requiredOption("--plan <file>", "restore plan created by deploy restore plan")
    .requiredOption("--confirm <plan-id>", "exact restore plan ID authorized by a human")
    .option("--timeout <seconds>", "Fabric operation timeout", "900")
    .action(async (options, command) => {
      const plan = JSON.parse(await readFile(path.resolve(options.plan), "utf8"));
      const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout) });
      const result = await applyRestorePlan({ client, plan, confirmPlanId: options.confirm });
      output({ ok: false, ...result }, jsonEnabled(command));
      process.exitCode = 3;
      return result;
    });

  return program;
}

export async function main(argv = process.argv.slice(2)) {
  const program = createProgram();
  if (argv.length === 0) argv = ["--help"];
  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError && ["commander.helpDisplayed", "commander.version"].includes(error.code)) return;
    throw error;
  }
}

export { createProgram };
