import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { buildSolution, embedVisualPackage, loadProject, refreshSolutionManifest, validateCompilation, verifySolutionManifest } from "@datashow/super-visual-compiler";
import { applyDeploymentPlan, createDeploymentPlan } from "@datashow/super-visual-fabric";
import { FabricHttpClient } from "./fabric-client.mjs";

const run = promisify(execFile);

function parse(argv) {
  const positional = []; const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) positional.push(value);
    else {
      const key = value.slice(2);
      const next = argv[index + 1];
      options[key] = !next || next.startsWith("--") ? true : next;
      if (options[key] !== true) index += 1;
    }
  }
  return { positional, options };
}

function projectFile(input = ".") { const resolved = path.resolve(input); return path.extname(resolved) ? resolved : path.join(resolved, "supervisual.yaml"); }
function output(value, json) { process.stdout.write(`${json ? JSON.stringify(value) : typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`); }
function required(options, key) { if (!options[key] || options[key] === true) throw new Error(`--${key} is required`); return options[key]; }

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

export async function main(argv = process.argv.slice(2)) {
  const { positional, options } = parse(argv);
  const [command, subcommand, input] = positional;
  if (!command || command === "help" || options.help) return output("Usage: supervisual <check|build|verify|deploy plan|deploy apply> <project> [options]", options.json);
  if (command === "check") {
    const loaded = await loadProject(projectFile(subcommand));
    const diagnostics = validateCompilation(loaded);
    const result = { ok: diagnostics.length === 0, project: projectFile(subcommand), diagnostics };
    output(result, options.json); if (!result.ok) process.exitCode = 1; return result;
  }
  if (command === "build") {
    const result = await buildSolution(projectFile(subcommand));
    const artifact = options.package ? await packageVisual(result) : null;
    const verified = await verifySolutionManifest(result.outputDirectory);
    const response = { ok: verified.ok, outputDirectory: result.outputDirectory, fileCount: verified.fileCount, ...(artifact ? { visualPackage: artifact } : {}) };
    output(response, options.json); return response;
  }
  if (command === "verify") {
    const loaded = await loadProject(projectFile(subcommand));
    const result = await verifySolutionManifest(path.resolve(loaded.root, loaded.project.output.directory));
    output(result, options.json); if (!result.ok) process.exitCode = 1; return result;
  }
  if (command === "deploy" && subcommand === "plan") {
    const loaded = await loadProject(projectFile(input));
    const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout ?? 900) });
    const solutionDirectory = path.resolve(loaded.root, loaded.project.output.directory);
    const acceptanceDax = options["acceptance-query-file"] ? await readFile(path.resolve(options["acceptance-query-file"]), "utf8") : null;
    const postDeployment = options["connection-id"] ? { connectionId: options["connection-id"], connectivityType: options["connection-mode"] ?? "ShareableCloud", timeoutSeconds: Number(options.timeout ?? 900), acceptanceDax } : null;
    const plan = await createDeploymentPlan({ client, workspaceId: required(options, "workspace-id"), workspaceName: options["workspace-name"], solutionDirectory, semanticModelName: required(options, "semantic-model-name"), reportName: required(options, "report-name"), allowUpdates: Boolean(options["allow-updates"]), postDeployment });
    const planPath = path.resolve(options.output === true || !options.output ? path.join(loaded.root, ".supervisual", "deploy-plan.json") : options.output);
    await mkdir(path.dirname(planPath), { recursive: true }); await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
    output({ ...plan, planPath }, options.json); if (plan.blockers.length) process.exitCode = 2; return plan;
  }
  if (command === "deploy" && subcommand === "apply") {
    const planPath = path.resolve(required(options, "plan"));
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    const client = new FabricHttpClient({ timeoutSeconds: Number(options.timeout ?? 900) });
    const result = await applyDeploymentPlan({ client, plan, confirmPlanId: required(options, "confirm"), backupDirectory: options.backup ? path.resolve(options.backup) : undefined });
    output({ ok: true, ...result }, options.json); return result;
  }
  throw new Error(`Unknown command: ${positional.join(" ")}`);
}
