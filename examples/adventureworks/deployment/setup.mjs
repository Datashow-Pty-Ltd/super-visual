#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const deploymentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(deploymentDirectory, "..");
const repositoryRoot = path.resolve(projectDirectory, "../..");
const deployHelper = path.join(deploymentDirectory, "deploy.mjs");
const stateDirectory = path.join(projectDirectory, ".supervisual");
const assetDirectory = path.join(stateDirectory, "assets");
const officialRepository = "microsoft/sql-server-samples";
const officialReleaseTag = "adventureworks";
const officialBackupName = "AdventureWorksDW2025.bak";
const officialReleaseApi = `https://api.github.com/repos/${officialRepository}/releases/tags/${officialReleaseTag}`;

const help = `Super Visual AdventureWorks guided setup

This wizard guides the supported AdventureWorks setup in order:

  official Microsoft sample asset or an existing database
    -> Azure SQL source
    -> Fabric cloud connection
    -> Power BI semantic model
    -> Super Visual report

Usage:
  npm run adventureworks:setup
  npm run adventureworks:setup -- --download-only
  npm run adventureworks:setup -- --answers <non-secret-json> --dry-run

Options:
  --answers <file>    Supply non-secret answers for a repeatable dry run
  --dry-run           Show the checks and commands without changing anything
  --download-only     Download the official Microsoft DW2025 backup and stop
  --help              Show this help

The wizard never asks for, prints, or stores passwords, access tokens, client
secrets, or connection credentials. Azure CLI owns Azure sign-in. Fabric owns
the SQL connection credential. A live deployment still requires the human to
type the exact immutable plan ID after reviewing its target and actions.
`;

function parseArguments(argv) {
  const options = { dryRun: false, downloadOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") options.help = true;
    else if (token === "--dry-run") options.dryRun = true;
    else if (token === "--download-only") options.downloadOnly = true;
    else if (token === "--answers") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--answers requires a JSON file");
      options.answers = path.resolve(value);
      index += 1;
    } else throw new Error(`Unknown option: ${token}`);
  }
  return options;
}

function hasSecretKey(value, trail = []) {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    const next = [...trail, key];
    if (/(password|passwd|secret|token|credential|private[-_]?key)/i.test(key)) return next.join(".");
    const nested = hasSecretKey(child, next);
    if (nested) return nested;
  }
  return null;
}

async function loadAnswers(file) {
  if (!file) return {};
  const value = JSON.parse(await readFile(file, "utf8"));
  const unsafeKey = hasSecretKey(value);
  if (unsafeKey) throw new Error(`The answers file contains a secret-like field (${unsafeKey}); remove it and use the provider sign-in flow`);
  return value;
}

function commandText(executable, args) {
  const quote = (value) => (/^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : JSON.stringify(value));
  return [executable, ...args].map(quote).join(" ");
}

function spinner(label) {
  if (!process.stderr.isTTY) {
    process.stderr.write(`... ${label}\n`);
    return () => {};
  }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let index = 0;
  process.stderr.write(`\u001b[?25l${frames[0]} ${label}`);
  const timer = setInterval(() => {
    index = (index + 1) % frames.length;
    process.stderr.write(`\r${frames[index]} ${label}`);
  }, 80);
  return (ok = true) => {
    clearInterval(timer);
    process.stderr.write(`\r${ok ? "✓" : "✗"} ${label}\u001b[K\n\u001b[?25h`);
  };
}

function runCaptured(executable, args, { label, cwd = repositoryRoot, allowedExitCodes = [0] } = {}) {
  return new Promise((resolve, reject) => {
    const stop = spinner(label ?? commandText(executable, args));
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      stop(false);
      reject(new Error(`Could not start ${path.basename(executable)}: ${error.message}`));
    });
    child.on("close", (code) => {
      stop(code === 0);
      const result = { code, stdout: stdout.trim(), stderr: stderr.trim() };
      if (allowedExitCodes.includes(code)) resolve(result);
      else reject(new Error((stderr || stdout || `${path.basename(executable)} exited with code ${code}`).trim()));
    });
  });
}

function runInteractive(executable, args, { cwd = repositoryRoot } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(executable)} exited with code ${code}`));
    });
  });
}

function parseJsonResult(result, label) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${label} did not return its expected JSON result`);
  }
}

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function downloadOfficialBackup({ dryRun }) {
  const destination = path.join(assetDirectory, officialBackupName);
  const provenancePath = path.join(assetDirectory, "AdventureWorksDW2025.provenance.json");
  if (dryRun) {
    process.stdout.write(`\nWould resolve ${officialBackupName} from the official ${officialRepository} ${officialReleaseTag} release.\n`);
    process.stdout.write(`Would save it to ${destination} and record its SHA-256 digest.\n`);
    return destination;
  }

  const lookupStop = spinner("Resolving the official Microsoft AdventureWorks release");
  let release;
  try {
    const response = await fetch(officialReleaseApi, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "super-visual-guided-setup" },
    });
    if (!response.ok) throw new Error(`GitHub release lookup returned HTTP ${response.status}`);
    release = await response.json();
    lookupStop(true);
  } catch (error) {
    lookupStop(false);
    throw error;
  }
  const asset = release.assets?.find((candidate) => candidate.name === officialBackupName);
  if (!asset?.browser_download_url) throw new Error(`Official release ${officialReleaseTag} does not contain ${officialBackupName}`);

  await mkdir(assetDirectory, { recursive: true });
  let alreadyDownloaded = true;
  try {
    await access(destination);
  } catch {
    alreadyDownloaded = false;
  }
  if (alreadyDownloaded) {
    let savedProvenance;
    try {
      savedProvenance = JSON.parse(await readFile(provenancePath, "utf8"));
    } catch {
      throw new Error(`Existing ${destination} has no readable provenance record; move or remove it before retrying`);
    }
    const existingDigest = await sha256(destination);
    const trusted = savedProvenance.repository === officialRepository
      && savedProvenance.releaseTag === officialReleaseTag
      && savedProvenance.assetName === officialBackupName
      && savedProvenance.downloadUrl === asset.browser_download_url
      && savedProvenance.sha256 === existingDigest;
    if (!trusted) throw new Error(`Existing ${destination} does not match its official download provenance; move or remove it before retrying`);
    process.stdout.write(`✓ Reusing provenance-verified official asset ${destination}\n`);
  } else {
    const partial = `${destination}.part`;
    const stop = spinner(`Downloading ${officialBackupName} from microsoft/sql-server-samples`);
    try {
      const response = await fetch(asset.browser_download_url, { headers: { "User-Agent": "super-visual-guided-setup" } });
      if (!response.ok || !response.body) throw new Error(`Official asset download returned HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { mode: 0o600 }));
      await rename(partial, destination);
      stop(true);
    } catch (error) {
      stop(false);
      await rm(partial, { force: true });
      throw error;
    }
  }

  const digestStop = spinner("Calculating the downloaded asset SHA-256 digest");
  const digest = await sha256(destination);
  digestStop(true);
  const provenance = {
    contractVersion: 1,
    kind: "supervisual-official-sample-asset",
    repository: officialRepository,
    releaseTag: officialReleaseTag,
    releaseUrl: release.html_url,
    assetName: officialBackupName,
    downloadUrl: asset.browser_download_url,
    sha256: digest,
    downloadedAt: new Date().toISOString(),
  };
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`✓ ${alreadyDownloaded ? "Verified" : "Downloaded"} ${destination}\n`);
  process.stdout.write(`✓ Recorded provenance and SHA-256 ${digest}\n`);
  return destination;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(help);
    return;
  }
  const answers = await loadAnswers(options.answers);
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const ask = async (key, question, { defaultValue, validate } = {}) => {
    let value = answers[key];
    if (value === undefined) {
      if (!process.stdin.isTTY) throw new Error(`A terminal or --answers value is required for ${key}`);
      const suffix = defaultValue === undefined ? "" : ` [${defaultValue}]`;
      value = (await rl.question(`${question}${suffix}: `)).trim();
      if (value === "" && defaultValue !== undefined) value = defaultValue;
    } else {
      process.stdout.write(`• ${question}: ${String(value)}\n`);
    }
    const normalized = typeof value === "string" ? value.trim() : value;
    if (validate && !validate(normalized)) throw new Error(`Invalid answer for ${key}: ${String(normalized)}`);
    return normalized;
  };
  const askYesNo = async (key, question, defaultValue = false) => {
    const value = await ask(key, `${question} (yes/no)`, { defaultValue: defaultValue ? "yes" : "no" });
    if (typeof value === "boolean") return value;
    if (/^(yes|y)$/i.test(value)) return true;
    if (/^(no|n)$/i.test(value)) return false;
    throw new Error(`${key} must be yes or no`);
  };

  try {
    process.stdout.write("\nSuper Visual AdventureWorks guided setup\n\n");
    process.stdout.write("This creates billable Azure/Fabric resources. It does not start or stop Fabric capacity.\n");
    process.stdout.write("Passwords and tokens remain inside Azure and Fabric sign-in flows.\n\n");

    if (options.downloadOnly) {
      await downloadOfficialBackup(options);
      process.stdout.write("\nThe official source is a SQL Server .bak, not an Azure SQL BACPAC. Restore it in SQL Server, export AdventureWorksDW2025 as a BACPAC, then rerun this wizard and choose bacpac.\n");
      return;
    }

    const sourceMode = await ask("sourceMode", "Source (existing-database, bacpac, or download-backup)", {
      defaultValue: "existing-database",
      validate: (value) => ["existing-database", "bacpac", "download-backup"].includes(value),
    });
    if (sourceMode === "download-backup") {
      await downloadOfficialBackup(options);
      process.stdout.write("\nMicrosoft publishes AdventureWorksDW2025 as a SQL Server backup, not a BACPAC.\n");
      process.stdout.write("Restore the downloaded .bak in SQL Server, export that database as a BACPAC with SqlPackage or SSMS, then rerun this wizard and choose bacpac.\n");
      process.stdout.write("No Azure or Fabric resources were changed.\n");
      return;
    }

    process.stdout.write("\n1/5 Check Azure sign-in and source settings\n");
    if (options.dryRun) {
      process.stdout.write("✓ Would check Azure CLI and use `az login` only if needed\n");
    } else {
      const version = await runCaptured("az", ["version"], { label: "Checking Azure CLI" });
      if (!version.stdout) throw new Error("Azure CLI did not report a version");
      let account = await runCaptured("az", ["account", "show", "--output", "json"], { label: "Checking Azure sign-in", allowedExitCodes: [0, 1] });
      if (account.code !== 0) {
        process.stdout.write("Azure sign-in is required. The Azure CLI will open its secure provider flow.\n");
        await runInteractive("az", ["login"]);
        account = await runCaptured("az", ["account", "show", "--output", "json"], { label: "Confirming Azure sign-in" });
      }
      const identity = parseJsonResult(account, "Azure account check");
      process.stdout.write(`✓ Signed in to Azure subscription ${identity.name} (${identity.id})\n`);
    }

    const resourceGroup = await ask("resourceGroup", "Azure resource group");
    const location = await ask("location", "Azure region", { defaultValue: "australiaeast" });
    const server = await ask("server", "Globally unique Azure SQL server name", {
      validate: (value) => /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(value),
    });
    const database = await ask("database", "Database name", { defaultValue: "AdventureWorksDW2025" });
    let bacpac;
    let allowAzureServices = false;
    if (sourceMode === "bacpac") {
      bacpac = path.resolve(await ask("bacpac", "Absolute path to the AdventureWorksDW2025 BACPAC"));
      if (!options.dryRun) await access(bacpac);
      allowAzureServices = await askYesNo("allowAzureServices", "Allow the Azure-services firewall rule required by Fabric");
      if (!allowAzureServices) throw new Error("A new Azure SQL source cannot be created without explicit firewall-rule acknowledgement");
    }

    if (options.dryRun) {
      process.stdout.write(`✓ Would verify access to Azure resource group ${resourceGroup}\n`);
    } else {
      try {
        await runCaptured("az", ["group", "show", "--name", resourceGroup, "--output", "json"], { label: `Verifying access to Azure resource group ${resourceGroup}` });
      } catch (error) {
        throw new Error(`The Azure resource group ${resourceGroup} is missing or not accessible to the signed-in account. ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const databaseArgs = [deployHelper, "database", "--resource-group", resourceGroup, "--location", location, "--server", server, "--database", database, "--confirm-source", `${server}/${database}`];
    if (sourceMode === "existing-database") databaseArgs.push("--reuse-existing");
    else databaseArgs.push("--bacpac", bacpac, "--allow-azure-services");

    process.stdout.write("\n2/5 Prepare the AdventureWorks Azure SQL source\n");
    if (options.dryRun) process.stdout.write(`Would run: ${commandText("node", databaseArgs)}\n`);
    else {
      const result = await runCaptured(process.execPath, databaseArgs, { label: sourceMode === "bacpac" ? "Provisioning and importing the Azure SQL database" : "Verifying the existing Azure SQL database" });
      const databaseResult = parseJsonResult(result, "Database setup");
      process.stdout.write(`✓ Source is ready at ${databaseResult.database.server}/${databaseResult.database.database}\n`);
      process.stdout.write(`✓ Redacted receipt: ${databaseResult.receiptPath}\n`);
    }

    process.stdout.write("\n3/5 Connect Fabric securely\n");
    process.stdout.write(`Create or select a Fabric cloud SQL connection for ${server}.database.windows.net / ${database}.\n`);
    process.stdout.write("Enter its credentials only in Fabric Settings → Manage connections and gateways; this wizard needs only the resulting connection ID.\n");
    const connectionReady = await askYesNo("connectionReady", "Is the Fabric cloud connection ready");
    if (!connectionReady) {
      process.stdout.write("\nSetup paused safely. Create the Fabric connection, then rerun the wizard with the same source choices.\n");
      return;
    }
    const connectionId = await ask("connectionId", "Fabric cloud connection ID");
    const workspaceId = await ask("workspaceId", "Target Fabric workspace ID");
    const workspaceName = await ask("workspaceName", "Expected Fabric workspace name");
    const semanticModelName = await ask("semanticModelName", "Semantic model name", { defaultValue: "AdventureWorks Super Visual" });
    const reportName = await ask("reportName", "Report name", { defaultValue: "AdventureWorks Product Ledger" });
    const allowUpdates = await askYesNo("allowUpdates", "Allow full replacement of same-named Fabric items", false);

    const planArgs = [deployHelper, "plan", "--workspace-id", workspaceId, "--workspace-name", workspaceName, "--connection-id", connectionId, "--semantic-model-name", semanticModelName, "--report-name", reportName];
    if (allowUpdates) planArgs.push("--allow-updates");

    process.stdout.write("\n4/5 Validate, package, discover, and create an immutable plan\n");
    if (options.dryRun) {
      process.stdout.write(`Would run: ${commandText("node", planArgs)}\n`);
      process.stdout.write("Would show the workspace, actions, blockers, and exact plan ID before any mutation.\n");
      process.stdout.write("Would require the human to type that plan ID; an answers file cannot pre-authorize it.\n");
      process.stdout.write("\nGuided setup dry run complete. No Azure or Fabric resources were changed.\n");
      return;
    }

    const planResult = parseJsonResult(await runCaptured(process.execPath, planArgs, { label: "Building and checking the immutable deployment plan", allowedExitCodes: [0, 2] }), "Deployment planning");
    process.stdout.write(`✓ Workspace: ${planResult.workspace?.displayName ?? workspaceName} (${planResult.workspace?.id ?? workspaceId})\n`);
    process.stdout.write(`✓ Plan ID: ${planResult.planId}\n`);
    for (const action of planResult.actions ?? []) process.stdout.write(`  • ${action.action ?? action.operation ?? "change"}: ${action.name ?? action.itemType ?? JSON.stringify(action)}\n`);
    if (planResult.blockers?.length) {
      process.stdout.write("Deployment is blocked:\n");
      for (const blocker of planResult.blockers) process.stdout.write(`  • ${typeof blocker === "string" ? blocker : JSON.stringify(blocker)}\n`);
      process.exitCode = 2;
      return;
    }

    process.stdout.write("\n5/5 Human authorization and live deployment\n");
    process.stdout.write(`Review ${planResult.planPath}. To authorize workspace ${workspaceName} (${workspaceId}), type the exact plan ID.\n`);
    if (!process.stdin.isTTY) throw new Error("Live apply requires an interactive terminal so a human can type the exact plan ID");
    const confirmation = (await rl.question("Plan ID (leave blank to stop safely): ")).trim();
    if (!confirmation) {
      process.stdout.write(`\nNo changes were applied. Resume with:\n  npm run adventureworks:deploy -- apply --plan ${planResult.planPath} --confirm ${planResult.planId}\n`);
      return;
    }
    if (confirmation !== planResult.planId) throw new Error("The typed plan ID does not match the immutable deployment plan; nothing was applied");

    const applyArgs = [deployHelper, "apply", "--plan", planResult.planPath, "--confirm", confirmation];
    const applyResult = parseJsonResult(await runCaptured(process.execPath, applyArgs, { label: "Deploying the semantic model, refreshing it, and publishing the report", allowedExitCodes: [0, 2] }), "Deployment apply");
    if (!applyResult.ok) throw new Error(`Deployment stopped with status ${applyResult.status ?? "unknown"}`);
    process.stdout.write(`✓ Deployment accepted; receipt: ${applyResult.receiptPath}\n`);

    const statusArgs = [deployHelper, "status", "--plan", planResult.planPath, "--receipt", applyResult.receiptPath];
    const statusResult = parseJsonResult(await runCaptured(process.execPath, statusArgs, { label: "Verifying connection binding, refresh, report binding, and live acceptance", allowedExitCodes: [0, 2] }), "Deployment status");
    if (!statusResult.ok) throw new Error(`Post-deployment verification returned ${statusResult.status ?? "an incomplete status"}`);

    const receipt = JSON.parse(await readFile(applyResult.receiptPath, "utf8"));
    const reportId = receipt.items?.report?.id;
    const semanticModelId = receipt.items?.semanticModel?.id;
    const reportUrl = reportId ? `https://app.powerbi.com/groups/${workspaceId}/reports/${reportId}` : null;
    process.stdout.write("\nAdventureWorks setup complete and live acceptance passed.\n");
    if (reportUrl) process.stdout.write(`Report: ${reportUrl}\n`);
    if (semanticModelId) process.stdout.write(`Local semantic preview:\n  npx supervisual dev examples/adventureworks --workspace-id ${workspaceId} --workspace-name ${JSON.stringify(workspaceName)} --semantic-model-id ${semanticModelId} --open\n`);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  process.stderr.write("\nSuper Visual could not complete the guided setup.\n");
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
