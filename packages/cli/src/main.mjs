import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Command, CommanderError } from "commander";
import { buildSolution, embedVisualPackage, loadProject, refreshSolutionManifest, validateCompilation, verifySolutionManifest } from "@datashow/super-visual-compiler";
import { applyDeploymentPlan, createDeploymentPlan } from "@datashow/super-visual-fabric";
import { discoverInput, initializeProject, inspectProject, supportedAdapters, supportedTemplates } from "./project.mjs";
import { FabricHttpClient } from "./fabric-client.mjs";

const run = promisify(execFile);
const VERSION = "0.1.0-rc.0";

function projectFile(input = ".") {
  const resolved = path.resolve(input);
  return path.extname(resolved) ? resolved : path.join(resolved, "supervisual.yaml");
}

function output(value, json) {
  process.stdout.write(`${json ? JSON.stringify(value) : typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
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

async function build(project, shouldPackage) {
  const result = await buildSolution(projectFile(project));
  const artifact = shouldPackage ? await packageVisual(result) : null;
  const verified = await verifySolutionManifest(result.outputDirectory);
  return {
    ok: verified.ok,
    outputDirectory: result.outputDirectory,
    fileCount: verified.fileCount,
    ...(artifact ? { visualPackage: artifact } : {}),
  };
}

function addJsonOption(command) {
  return command.option("--json", "emit one machine-readable JSON value");
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

  addJsonOption(program.command("templates"))
    .description("list project templates available to init")
    .action((options, command) => output({ ok: true, templates: supportedTemplates() }, jsonEnabled(command)));

  addJsonOption(program.command("adapters"))
    .description("list source adapters and their compatibility status")
    .action((options, command) => output({ ok: true, adapters: supportedAdapters() }, jsonEnabled(command)));

  addJsonOption(program.command("init <directory>"))
    .description("create a new Super Visual project")
    .option("--template <name>", "project template", "hello-world")
    .option("--name <id>", "project identifier")
    .option("--title <title>", "display title")
    .option("--force", "write into an existing empty directory")
    .action(async (directory, options, command) => {
      const result = await initializeProject({ directory, template: options.template, name: options.name, title: options.title, force: options.force });
      output(result, jsonEnabled(command));
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
    .action(async (project = ".", options, command) => output(await build(project, Boolean(options.package)), jsonEnabled(command)));

  addJsonOption(program.command("package [project]"))
    .description("compile, package, embed, and verify a deployable solution")
    .action(async (project = ".", options, command) => output(await build(project, true), jsonEnabled(command)));

  addJsonOption(program.command("verify [project]"))
    .description("verify every generated file against the solution manifest")
    .action(async (project = ".", options, command) => {
      const loaded = await loadProject(projectFile(project));
      const result = await verifySolutionManifest(path.resolve(loaded.root, loaded.project.output.directory));
      output(result, jsonEnabled(command));
      if (!result.ok) process.exitCode = 1;
      return result;
    });

  const deploy = program.command("deploy").description("plan and apply guarded Microsoft Fabric deployments");
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
    .option("--timeout <seconds>", "Fabric operation timeout", "900")
    .action(async (project = ".", options, command) => {
      await loadProject(projectFile(project));
      const planPath = path.resolve(options.plan);
      const plan = JSON.parse(await readFile(planPath, "utf8"));
      const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout) });
      const result = await applyDeploymentPlan({ client, plan, confirmPlanId: options.confirm, backupDirectory: options.backup ? path.resolve(options.backup) : undefined });
      output({ ok: true, ...result }, jsonEnabled(command));
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
