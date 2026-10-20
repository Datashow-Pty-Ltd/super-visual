#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const deploymentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(deploymentDirectory, "..");
const repositoryRoot = path.resolve(projectDirectory, "../..");
const cli = path.join(repositoryRoot, "packages/cli/bin/supervisual.mjs");
const stateDirectory = path.join(projectDirectory, ".supervisual");
const defaultProfile = path.join(stateDirectory, "adventureworks-source.json");
const defaultDatabaseReceipt = path.join(stateDirectory, "adventureworks-database-receipt.json");
const defaultPlan = path.join(stateDirectory, "deploy-plan.json");
const defaultReceipt = path.join(stateDirectory, "deploy-receipt.json");
const defaultBackup = path.join(stateDirectory, "backups");

const help = `AdventureWorks end-to-end deployment helper

This helper provisions the proven Azure SQL source and delegates Fabric item
deployment to the Super Visual JSON CLI. It never starts or stops capacity.

Usage:
  npm run adventureworks:deploy -- database [options]
  npm run adventureworks:deploy -- plan [options]
  npm run adventureworks:deploy -- apply [options]
  npm run adventureworks:deploy -- status [options]

database (creates or explicitly reuses the AdventureWorks source)
  --resource-group <name>       Azure resource group
  --location <region>           Azure region, for example australiaeast
  --server <name>               Globally unique Azure SQL logical server name
  --database <name>             Database name (default: AdventureWorksDW2025)
  --bacpac <file>               AdventureWorks BACPAC used for a new source
  --confirm-source <target>     Exact <server>/<database> confirmation
  --allow-azure-services        Acknowledge the Azure-services firewall rule
  --reuse-existing              Reuse an existing Online database without changes
  --profile <file>              Source profile output
  --receipt <file>              Redacted database receipt output

plan (read-only in Fabric; builds locally and writes an immutable plan)
  --workspace-id <guid>         Immutable Fabric workspace ID
  --workspace-name <name>       Expected workspace display name
  --connection-id <guid>        Existing Fabric cloud connection for the source
  --semantic-model-name <name>  Target semantic model name
  --report-name <name>          Target report name
  --profile <file>              Source profile created by database
  --plan <file>                 Deployment plan output
  --allow-updates               Intentionally plan full-definition replacement
  --timeout <seconds>           Fabric timeout (default: 900)

apply (mutating; requires exact human-authorized Super Visual plan ID)
  --plan <file>                 Plan created by the plan command
  --confirm <plan-id>           Exact authorized plan ID
  --backup <directory>          Backup destination (required for updates)
  --receipt <file>              Deployment receipt output
  --timeout <seconds>           Fabric timeout (default: 900)

status (read-only post-deployment acceptance)
  --plan <file>                 Applied plan
  --receipt <file>              Apply receipt containing deployed item IDs
  --timeout <seconds>           Fabric timeout (default: 900)

Every command emits JSON. Tenant identifiers, credentials, plans, receipts,
and generated artifacts belong under .supervisual/ or dist/ and are ignored.
`;

function parseArguments(argv) {
  const command = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (["allow-azure-services", "reuse-existing", "allow-updates", "help"].includes(key)) {
      options[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function required(options, key) {
  const value = options[key];
  if (!value) throw new Error(`--${key} is required`);
  return value;
}

function run(executable, args, { allowedExitCodes = [0] } = {}) {
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw new Error(`Could not start ${path.basename(executable)}: ${result.error.message}`);
  if (!allowedExitCodes.includes(result.status)) {
    const detail = (result.stderr || result.stdout || "command failed").trim();
    throw new Error(`${path.basename(executable)} failed: ${detail}`);
  }
  return result.stdout.trim();
}

function runJson(executable, args, options) {
  const output = run(executable, args, options);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${path.basename(executable)} did not return JSON`);
  }
}

function azJson(args) {
  return runJson("az", [...args, "--output", "json"]);
}

function superVisualJson(args, options) {
  return runJson(process.execPath, [cli, ...args, "--json"], options);
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function absolute(value, fallback) {
  return path.resolve(value ?? fallback);
}

function safeServerName(value) {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(value)) {
    throw new Error("--server must be a 3-63 character lowercase Azure SQL server name");
  }
  return value;
}

function temporaryStorageName() {
  return `svaw${Date.now().toString(36)}${randomBytes(4).toString("hex")}`.slice(0, 24);
}

function administratorPassword() {
  return `${randomBytes(24).toString("base64url").slice(0, 28)}Aa1!`;
}

async function database(options) {
  const resourceGroup = required(options, "resource-group");
  const location = required(options, "location");
  const server = safeServerName(required(options, "server"));
  const databaseName = options.database ?? "AdventureWorksDW2025";
  const exactTarget = `${server}/${databaseName}`;
  if (options["confirm-source"] !== exactTarget) {
    throw new Error(`Database provisioning requires --confirm-source ${exactTarget}`);
  }
  const profilePath = absolute(options.profile, defaultProfile);
  const receiptPath = absolute(options.receipt, defaultDatabaseReceipt);

  const account = azJson(["account", "show"]);
  const servers = azJson(["sql", "server", "list", "--resource-group", resourceGroup]);
  const existingServer = servers.find((candidate) => candidate.name === server);
  if (existingServer) {
    if (!options["reuse-existing"]) {
      throw new Error(`Azure SQL server ${server} already exists; pass --reuse-existing only after verifying ownership`);
    }
    const databases = azJson(["sql", "db", "list", "--resource-group", resourceGroup, "--server", server]);
    const existingDatabase = databases.find((candidate) => candidate.name === databaseName);
    if (!existingDatabase || existingDatabase.status !== "Online") {
      throw new Error(`Existing source ${exactTarget} is not an Online database; refusing to modify it`);
    }
    const profile = {
      contractVersion: 1,
      kind: "fabric-sql-source",
      source: { server: `${server}.database.windows.net`, database: databaseName },
    };
    const receipt = {
      contractVersion: 1,
      kind: "supervisual-adventureworks-database-receipt",
      status: "ready",
      operation: "reuse",
      subscriptionId: account.id,
      resourceGroup,
      location: existingServer.location,
      server: profile.source.server,
      database: databaseName,
      databaseStatus: existingDatabase.status,
      verifiedAt: new Date().toISOString(),
    };
    await writeJson(profilePath, profile);
    await writeJson(receiptPath, receipt);
    return { ok: true, profilePath, receiptPath, database: receipt };
  }

  if (!options["allow-azure-services"]) {
    throw new Error("A new source requires --allow-azure-services to acknowledge the Azure SQL firewall rule used by Fabric");
  }
  const bacpacPath = absolute(required(options, "bacpac"));
  await access(bacpacPath);

  const signedIn = azJson(["ad", "signed-in-user", "show"]);
  const adminName = signedIn.userPrincipalName ?? signedIn.displayName;
  const adminObjectId = signedIn.id;
  if (!adminName || !adminObjectId) throw new Error("Could not resolve the signed-in Microsoft Entra user for Azure SQL administration");

  const sqlAdministrator = "svimportadmin";
  const sqlPassword = administratorPassword();
  const storageAccount = temporaryStorageName();
  const container = "bacpac";
  const blob = path.basename(bacpacPath);
  let storageCreated = false;

  run("az", ["sql", "server", "create", "--resource-group", resourceGroup, "--name", server, "--location", location, "--admin-user", sqlAdministrator, "--admin-password", sqlPassword, "--enable-public-network", "true", "--minimal-tls-version", "1.2", "--output", "none"]);
  run("az", ["sql", "server", "ad-admin", "create", "--resource-group", resourceGroup, "--server-name", server, "--display-name", adminName, "--object-id", adminObjectId, "--output", "none"]);
  run("az", ["sql", "server", "firewall-rule", "create", "--resource-group", resourceGroup, "--server", server, "--name", "AllowAzureServices", "--start-ip-address", "0.0.0.0", "--end-ip-address", "0.0.0.0", "--output", "none"]);
  run("az", ["sql", "db", "create", "--resource-group", resourceGroup, "--server", server, "--name", databaseName, "--edition", "Standard", "--service-objective", "S3", "--backup-storage-redundancy", "Local", "--output", "none"]);

  try {
    run("az", ["storage", "account", "create", "--resource-group", resourceGroup, "--name", storageAccount, "--location", location, "--sku", "Standard_LRS", "--kind", "StorageV2", "--output", "none"]);
    storageCreated = true;
    const keys = azJson(["storage", "account", "keys", "list", "--resource-group", resourceGroup, "--account-name", storageAccount]);
    const storageKey = keys[0]?.value;
    if (!storageKey) throw new Error("Temporary storage account did not return an access key");
    run("az", ["storage", "container", "create", "--name", container, "--account-name", storageAccount, "--account-key", storageKey, "--output", "none"]);
    run("az", ["storage", "blob", "upload", "--account-name", storageAccount, "--account-key", storageKey, "--container-name", container, "--name", blob, "--file", bacpacPath, "--overwrite", "--output", "none"]);
    run("az", ["sql", "db", "import", "--resource-group", resourceGroup, "--server", server, "--name", databaseName, "--admin-user", sqlAdministrator, "--admin-password", sqlPassword, "--auth-type", "SQL", "--storage-key-type", "StorageAccessKey", "--storage-key", storageKey, "--storage-uri", `https://${storageAccount}.blob.core.windows.net/${container}/${blob}`, "--output", "none"]);
  } finally {
    if (storageCreated) {
      run("az", ["storage", "account", "delete", "--resource-group", resourceGroup, "--name", storageAccount, "--yes", "--output", "none"]);
    }
  }

  const deployed = azJson(["sql", "db", "show", "--resource-group", resourceGroup, "--server", server, "--name", databaseName]);
  if (deployed.status !== "Online") throw new Error(`Imported database finished in unexpected state: ${deployed.status ?? "unknown"}`);
  const profile = {
    contractVersion: 1,
    kind: "fabric-sql-source",
    source: { server: `${server}.database.windows.net`, database: databaseName },
  };
  const receipt = {
    contractVersion: 1,
    kind: "supervisual-adventureworks-database-receipt",
    status: "ready",
    operation: "create",
    subscriptionId: account.id,
    resourceGroup,
    location,
    server: profile.source.server,
    database: databaseName,
    databaseStatus: deployed.status,
    serviceObjective: deployed.currentServiceObjectiveName,
    temporaryStorageDeleted: true,
    createdAt: new Date().toISOString(),
  };
  await writeJson(profilePath, profile);
  await writeJson(receiptPath, receipt);
  return { ok: true, profilePath, receiptPath, database: receipt };
}

async function plan(options) {
  const workspaceId = required(options, "workspace-id");
  const workspaceName = required(options, "workspace-name");
  const connectionId = required(options, "connection-id");
  const semanticModelName = options["semantic-model-name"] ?? "AdventureWorks Super Visual";
  const reportName = options["report-name"] ?? "AdventureWorks Product Ledger";
  const profilePath = absolute(options.profile, defaultProfile);
  const planPath = absolute(options.plan, defaultPlan);
  const timeout = options.timeout ?? "900";
  await access(profilePath);

  const checked = superVisualJson(["check", projectDirectory]);
  const packaged = superVisualJson(["package", projectDirectory, "--parameters-file", profilePath]);
  const verified = superVisualJson(["verify", projectDirectory]);
  const discovered = superVisualJson(["deploy", "discover", "--workspace-id", workspaceId, "--workspace-name", workspaceName, "--connections", "--timeout", timeout]);
  const args = ["deploy", "plan", projectDirectory, "--workspace-id", workspaceId, "--workspace-name", workspaceName, "--semantic-model-name", semanticModelName, "--report-name", reportName, "--connection-id", connectionId, "--connection-mode", "ShareableCloud", "--acceptance-query-file", path.join(projectDirectory, "acceptance.dax"), "--output", planPath, "--timeout", timeout];
  if (options["allow-updates"]) args.push("--allow-updates");
  const deploymentPlan = superVisualJson(args, { allowedExitCodes: [0, 2] });
  return {
    ok: deploymentPlan.blockers?.length === 0,
    stages: { check: checked.ok, package: packaged.ok, verify: verified.ok, discover: discovered.ok },
    planId: deploymentPlan.planId,
    planPath,
    workspace: deploymentPlan.workspace,
    actions: deploymentPlan.actions,
    blockers: deploymentPlan.blockers,
  };
}

async function apply(options) {
  const planPath = absolute(options.plan, defaultPlan);
  const confirm = required(options, "confirm");
  const backup = absolute(options.backup, defaultBackup);
  const receipt = absolute(options.receipt, defaultReceipt);
  const timeout = options.timeout ?? "900";
  const deploymentPlan = await readJson(planPath);
  if (deploymentPlan.planId !== confirm) {
    throw new Error(`Deployment requires exact plan confirmation ${deploymentPlan.planId}`);
  }
  const result = superVisualJson(["deploy", "apply", projectDirectory, "--plan", planPath, "--confirm", confirm, "--backup", backup, "--receipt", receipt, "--timeout", timeout], { allowedExitCodes: [0, 3] });
  return { ...result, ok: result.status === "accepted", planPath, receiptPath: receipt };
}

async function status(options) {
  const planPath = absolute(options.plan, defaultPlan);
  const receiptPath = absolute(options.receipt, defaultReceipt);
  const timeout = options.timeout ?? "900";
  const deploymentPlan = await readJson(planPath);
  const deploymentReceipt = await readJson(receiptPath);
  const semanticModelId = deploymentReceipt.items?.semanticModel?.id;
  const reportId = deploymentReceipt.items?.report?.id;
  const connectionId = deploymentPlan.postDeployment?.connectionId;
  if (!semanticModelId || !reportId || !connectionId) {
    throw new Error("Plan and receipt do not contain the semantic model, report, and connection IDs needed for status");
  }
  const result = superVisualJson(["deploy", "status", "--workspace-id", deploymentPlan.workspace.id, "--workspace-name", deploymentPlan.workspace.displayName, "--semantic-model-id", semanticModelId, "--report-id", reportId, "--connection-id", connectionId, "--acceptance-query-file", path.join(projectDirectory, "acceptance.dax"), "--timeout", timeout]);
  return { ...result, ok: result.status === "accepted" };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (!command || command === "help" || command === "--help" || options.help) {
    process.stdout.write(help);
    return;
  }
  let result;
  if (command === "database") result = await database(options);
  else if (command === "plan") result = await plan(options);
  else if (command === "apply") result = await apply(options);
  else if (command === "status") result = await status(options);
  else throw new Error(`Unknown command: ${command}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.ok === false) process.exitCode = 2;
}

main().catch((error) => {
  const failure = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
  process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exitCode = 1;
});
