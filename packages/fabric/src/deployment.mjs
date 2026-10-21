import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { bindReportToSemanticModel, connectionStringValue, decodePart, encodeDefinition, verifyDefinitionParts } from "./parts.mjs";
import { bindSemanticModelConnection, executeAcceptanceQuery, refreshSemanticModel } from "./operations.mjs";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]));
  return value;
}

function planId(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex").slice(0, 20);
}

function definitionHash(parts) {
  const canonical = [...parts].sort((left, right) => left.path.localeCompare(right.path)).map(({ path: partPath, payloadType, payload }) => ({ path: partPath, payloadType, payload }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function oneByName(items, displayName, type) {
  const matches = items.filter((item) => item.displayName === displayName && (!item.type || item.type === type));
  if (matches.length > 1) throw new Error(`Found ${matches.length} ${type} items named ${displayName}; deployment names must be unambiguous`);
  return matches[0];
}

function tmdlStringExpression(text, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^expression\\s+(?:'${escapedName}'|${escapedName})\\s*=\\s*\"((?:\"\"|[^\"])*)\"`, "mi"));
  return match ? match[1].replaceAll('""', '"') : null;
}

async function expectedLocalConnection(solutionDirectory) {
  const expressionsPath = path.join(solutionDirectory, "SemanticAdapter.SemanticModel", "definition", "expressions.tmdl");
  const expressions = await readFile(expressionsPath, "utf8");
  const server = tmdlStringExpression(expressions, "Server");
  const database = tmdlStringExpression(expressions, "Database");
  if (!server || !database) throw new Error("Post-deployment binding requires literal Server and Database parameters in the packaged semantic model");
  return { type: "SQL", path: `${server};${database}` };
}

async function preflightPostDeploymentConnection({ client, solutionDirectory, postDeployment }) {
  if (!postDeployment) return null;
  const expected = await expectedLocalConnection(solutionDirectory);
  const connections = await client.listConnections();
  const connection = connections.find((item) => String(item.id) === String(postDeployment.connectionId));
  if (!connection) throw new Error(`Fabric connection ${postDeployment.connectionId} is not accessible`);
  if (connection.connectivityType !== postDeployment.connectivityType) throw new Error(`Fabric connection ${postDeployment.connectionId} uses ${connection.connectivityType}, not ${postDeployment.connectivityType}`);
  const actual = connection.connectionDetails;
  if (actual?.type !== expected.type || actual?.path !== expected.path) throw new Error(`Fabric connection ${postDeployment.connectionId} does not exactly match packaged semantic source ${expected.type} ${expected.path}`);
  return { connectionId: connection.id, connectivityType: connection.connectivityType, connectionDetails: expected };
}

async function deploymentTarget({ client, workspaceId, workspaceName, semanticModelName, reportName }) {
  if (!workspaceId) throw new Error("A Fabric workspace ID is required; display-name-only deployment is not safe");
  const workspace = await client.getWorkspace(workspaceId);
  if (!workspace || workspace.id !== workspaceId) throw new Error(`Fabric workspace ${workspaceId} was not found`);
  if (workspaceName && workspace.displayName !== workspaceName) throw new Error(`Workspace ID ${workspaceId} is ${workspace.displayName}, not ${workspaceName}`);
  if (!workspace.capacityId) throw new Error(`Workspace ${workspace.displayName} is not assigned to Fabric capacity`);
  const [semanticItems, reportItems] = await Promise.all([client.listItems(workspaceId, "SemanticModel"), client.listItems(workspaceId, "Report")]);
  return {
    workspace,
    semantic: oneByName(semanticItems, semanticModelName, "SemanticModel"),
    report: oneByName(reportItems, reportName, "Report"),
  };
}

export async function createDeploymentDiff({ client, workspaceId, workspaceName, solutionDirectory, semanticModelName, reportName }) {
  const target = await deploymentTarget({ client, workspaceId, workspaceName, semanticModelName, reportName });
  const descriptors = [
    { key: "semanticModel", type: "SemanticModel", format: "TMDL", displayName: semanticModelName, existing: target.semantic, directory: "SemanticAdapter.SemanticModel" },
    { key: "report", type: "Report", format: "PBIR", displayName: reportName, existing: target.report, directory: "Report.Report" },
  ];
  const actions = [];
  for (const descriptor of descriptors) {
    const transform = descriptor.type === "Report" && target.semantic?.id ? bindReportToSemanticModel(target.semantic.id) : undefined;
    const localParts = await encodeDefinition(path.join(solutionDirectory, descriptor.directory), transform);
    verifyDefinitionParts(localParts, descriptor.format);
    const localDefinitionHash = definitionHash(localParts);
    let remoteDefinitionHash = null;
    if (descriptor.existing) {
      const remote = await client.getDefinition(workspaceId, descriptor.type, descriptor.existing.id, descriptor.format);
      verifyDefinitionParts(remote.parts, descriptor.format, { allowLegacyReportVersion: true });
      remoteDefinitionHash = definitionHash(remote.parts);
    }
    const change = !descriptor.existing ? "create" : remoteDefinitionHash === localDefinitionHash ? "unchanged" : "update";
    actions.push({ key: descriptor.key, type: descriptor.type, format: descriptor.format, displayName: descriptor.displayName, existingId: descriptor.existing?.id ?? null, change, localDefinitionHash, remoteDefinitionHash });
  }
  return {
    ok: true,
    workspace: { id: target.workspace.id, displayName: target.workspace.displayName, capacityId: target.workspace.capacityId },
    actions,
    summary: { create: actions.filter((action) => action.change === "create").length, update: actions.filter((action) => action.change === "update").length, unchanged: actions.filter((action) => action.change === "unchanged").length },
  };
}

export async function createDeploymentPlan({ client, workspaceId, workspaceName, solutionDirectory, semanticModelName, reportName, allowUpdates = false, postDeployment = null }) {
  const { workspace, semantic, report } = await deploymentTarget({ client, workspaceId, workspaceName, semanticModelName, reportName });
  const actions = [
    { key: "semanticModel", type: "SemanticModel", format: "TMDL", displayName: semanticModelName, operation: semantic ? (allowUpdates ? "update" : "blocked") : "create", existingId: semantic?.id ?? null, directory: "SemanticAdapter.SemanticModel" },
    { key: "report", type: "Report", format: "PBIR", displayName: reportName, operation: report ? (allowUpdates ? "update" : "blocked") : "create", existingId: report?.id ?? null, directory: "Report.Report" },
  ];
  for (const action of actions) {
    const localParts = await encodeDefinition(path.join(solutionDirectory, action.directory));
    verifyDefinitionParts(localParts, action.format);
    action.contentHash = definitionHash(localParts);
    action.remoteDefinitionHash = null;
    if (action.operation === "update") {
      const remote = await client.getDefinition(workspaceId, action.type, action.existingId, action.format);
      verifyDefinitionParts(remote.parts, action.format, { allowLegacyReportVersion: true });
      action.remoteDefinitionHash = definitionHash(remote.parts);
    }
  }
  const resolvedSolutionDirectory = path.resolve(solutionDirectory);
  const core = { contractVersion: 1, workspace: { id: workspace.id, displayName: workspace.displayName, capacityId: workspace.capacityId }, solutionDirectory: resolvedSolutionDirectory, allowUpdates, actions, postDeployment };
  const blockers = actions.filter((action) => action.operation === "blocked").map((action) => `${action.type} ${action.displayName} already exists; create a plan with updates explicitly enabled`);
  if (postDeployment) {
    try {
      await preflightPostDeploymentConnection({ client, solutionDirectory: resolvedSolutionDirectory, postDeployment });
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { ...core, planId: planId(core), createdAt: new Date().toISOString(), blockers };
}

async function backup(client, workspaceId, action, directory) {
  if (!action.existingId) return null;
  const remote = await client.getDefinition(workspaceId, action.type, action.existingId, action.format);
  verifyDefinitionParts(remote.parts, action.format, { allowLegacyReportVersion: true });
  const root = path.join(directory, `${action.type}-${action.existingId}`);
  for (const part of remote.parts) {
    const target = path.resolve(root, part.path);
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error(`Unsafe backup part ${part.path}`);
    await mkdir(path.dirname(target), { recursive: true });
    // The remote payload is an expected backup artifact; verifyDefinitionParts and the rooted path check above bound the write.
    await writeFile(target, decodePart(part));
  }
  return { key: action.key, type: action.type, format: action.format, displayName: action.displayName, itemId: action.existingId, directory: path.relative(path.resolve(directory), root), definitionHash: definitionHash(remote.parts) };
}

export async function applyDeploymentPlan({ client, plan, confirmPlanId, backupDirectory, resumeState = null, onProgress = null }) {
  if (plan.blockers.length) throw new Error(`Deployment plan is blocked:\n- ${plan.blockers.join("\n- ")}`);
  if (confirmPlanId !== plan.planId) throw new Error(`Deployment requires exact plan confirmation ${plan.planId}`);
  if (resumeState && (resumeState.contractVersion !== 1 || resumeState.kind !== "supervisual-deployment-receipt" || resumeState.planId !== plan.planId || String(resumeState.workspace?.id) !== String(plan.workspace.id))) throw new Error("Resume receipt does not match the deployment plan and workspace");
  const completed = resumeState?.items ?? {};
  const workspace = await client.getWorkspace(plan.workspace.id);
  if (!workspace || workspace.displayName !== plan.workspace.displayName || workspace.capacityId !== plan.workspace.capacityId) throw new Error("Workspace identity or capacity changed after planning; create a new plan");
  const currentByType = new Map();
  for (const type of ["SemanticModel", "Report"]) currentByType.set(type, await client.listItems(plan.workspace.id, type));
  const semanticAction = plan.actions.find((action) => action.key === "semanticModel");
  const plannedSemanticModelId = completed.semanticModel?.id ?? semanticAction?.existingId ?? null;
  for (const action of plan.actions) {
    const current = oneByName(currentByType.get(action.type), action.displayName, action.type);
    const recorded = completed[action.key];
    if (recorded) {
      if (!current || String(current.id) !== String(recorded.id)) throw new Error(`${action.type} ${action.displayName} no longer matches the resume receipt`);
    } else if (action.operation === "create" && current) throw new Error(`${action.type} ${action.displayName} appeared after planning; create a new plan`);
    if (action.operation === "update" && current?.id !== action.existingId) throw new Error(`${action.type} ${action.displayName} changed identity after planning; create a new plan`);
    const localParts = await encodeDefinition(path.join(plan.solutionDirectory, action.directory));
    verifyDefinitionParts(localParts, action.format);
    if (definitionHash(localParts) !== action.contentHash) throw new Error(`${action.type} ${action.displayName} local definition changed after planning; create a new plan`);
    if (recorded) {
      const transform = action.type === "Report" ? bindReportToSemanticModel(plannedSemanticModelId) : undefined;
      const expectedParts = await encodeDefinition(path.join(plan.solutionDirectory, action.directory), transform);
      const remote = await client.getDefinition(plan.workspace.id, action.type, recorded.id, action.format);
      verifyDefinitionParts(remote.parts, action.format);
      if (definitionHash(remote.parts) !== definitionHash(expectedParts)) throw new Error(`${action.type} ${action.displayName} does not match the completed resume step`);
    } else if (action.operation === "update") {
      const remote = await client.getDefinition(plan.workspace.id, action.type, action.existingId, action.format);
      verifyDefinitionParts(remote.parts, action.format, { allowLegacyReportVersion: true });
      if (definitionHash(remote.parts) !== action.remoteDefinitionHash) throw new Error(`${action.type} ${action.displayName} remote definition changed after planning; create a new plan`);
    }
  }
  await preflightPostDeploymentConnection({ client, solutionDirectory: plan.solutionDirectory, postDeployment: plan.postDeployment });
  const updateActions = plan.actions.filter((action) => action.operation === "update" && !completed[action.key]);
  if (updateActions.length && !backupDirectory) throw new Error("Updates require a backup directory");
  const allUpdateActions = plan.actions.filter((action) => action.operation === "update");
  if (resumeState && allUpdateActions.length) {
    if (!backupDirectory) throw new Error("Resuming updates requires the original backup directory");
    const { manifest } = await loadBackupManifest(backupDirectory);
    if (manifest.sourcePlanId !== plan.planId || manifest.items.length !== allUpdateActions.length) throw new Error("Resume backup manifest does not match the deployment plan");
    for (const action of allUpdateActions) {
      const backedUp = manifest.items.find((item) => item.key === action.key && String(item.itemId) === String(action.existingId));
      if (!backedUp || backedUp.definitionHash !== action.remoteDefinitionHash) throw new Error(`${action.type} ${action.displayName} resume backup does not match the planned remote definition`);
    }
  } else if (updateActions.length) {
    const items = [];
    for (const action of updateActions) items.push(await backup(client, plan.workspace.id, action, backupDirectory));
    const manifest = { contractVersion: 1, kind: "supervisual-fabric-backup", createdAt: new Date().toISOString(), sourcePlanId: plan.planId, workspace: plan.workspace, items };
    await mkdir(backupDirectory, { recursive: true });
    await writeFile(path.join(backupDirectory, "backup-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const results = {};
  let semanticModelId = plannedSemanticModelId;
  for (const action of plan.actions) {
    if (completed[action.key]) {
      const itemId = completed[action.key].id;
      if (action.type === "SemanticModel") semanticModelId = itemId;
      results[action.key] = { id: itemId, displayName: action.displayName, operation: action.operation, resumed: true };
      continue;
    }
    const transform = action.type === "Report" ? bindReportToSemanticModel(semanticModelId) : undefined;
    const parts = await encodeDefinition(path.join(plan.solutionDirectory, action.directory), transform);
    verifyDefinitionParts(parts, action.format);
    const result = action.operation === "create"
      ? await client.createItem(plan.workspace.id, action.type, action.displayName, action.format, parts)
      : await client.updateItem(plan.workspace.id, action.type, action.existingId, action.format, parts);
    const itemId = result?.id ?? action.existingId;
    if (!itemId) throw new Error(`${action.type} ${action.displayName} did not return an item ID`);
    const deployed = await client.getDefinition(plan.workspace.id, action.type, itemId, action.format);
    verifyDefinitionParts(deployed.parts, action.format);
    if (action.type === "SemanticModel") semanticModelId = itemId;
    if (action.type === "Report") {
      const pbir = deployed.parts.find((part) => part.path === "definition.pbir");
      const parsed = JSON.parse(decodePart(pbir).toString("utf8"));
      const boundSemanticModelId = connectionStringValue(parsed.datasetReference?.byConnection?.connectionString, "semanticmodelid");
      if (String(boundSemanticModelId).toLowerCase() !== String(semanticModelId).toLowerCase()) throw new Error("Deployed report is not bound to the deployed semantic model");
    }
    results[action.key] = { id: itemId, displayName: action.displayName, operation: action.operation };
    if (onProgress) await onProgress({ action: action.key, item: results[action.key] });
  }
  let verification = null;
  if (plan.postDeployment) {
    const binding = await bindSemanticModelConnection({ client, workspaceId: plan.workspace.id, semanticModelId, connectionId: plan.postDeployment.connectionId, connectivityType: plan.postDeployment.connectivityType });
    const refresh = await refreshSemanticModel({ client, workspaceId: plan.workspace.id, semanticModelId, timeoutSeconds: plan.postDeployment.timeoutSeconds ?? 900 });
    const acceptance = plan.postDeployment.acceptanceDax ? await executeAcceptanceQuery({ client, workspaceId: plan.workspace.id, semanticModelId, query: plan.postDeployment.acceptanceDax }) : null;
    verification = { binding, refresh: { status: refresh.status }, acceptance };
  }
  const accepted = Boolean(verification?.binding && verification?.refresh?.status === "Completed" && verification?.acceptance);
  const reportUrl = results.report?.id
    ? `https://app.powerbi.com/groups/${encodeURIComponent(plan.workspace.id)}/reports/${encodeURIComponent(results.report.id)}`
    : null;
  return {
    planId: plan.planId,
    workspace: plan.workspace,
    items: results,
    verification,
    accepted,
    status: accepted ? "accepted" : "published-unverified",
    ...(reportUrl ? { reportUrl } : {}),
  };
}

async function loadBackupManifest(backupDirectory) {
  const root = path.resolve(backupDirectory);
  const manifest = JSON.parse(await readFile(path.join(root, "backup-manifest.json"), "utf8"));
  if (manifest?.contractVersion !== 1 || manifest?.kind !== "supervisual-fabric-backup" || !Array.isArray(manifest.items) || !manifest.items.length) throw new Error("Backup manifest is missing or invalid");
  return { root, manifest };
}

function backupItemRoot(root, item) {
  const itemRoot = path.resolve(root, item.directory);
  if (!itemRoot.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe backup directory ${item.directory}`);
  return itemRoot;
}

export async function createRestorePlan({ client, backupDirectory, workspaceId, workspaceName }) {
  const { root, manifest } = await loadBackupManifest(backupDirectory);
  if (String(manifest.workspace?.id) !== String(workspaceId)) throw new Error(`Backup belongs to workspace ${String(manifest.workspace?.id)}, not ${workspaceId}`);
  const workspace = await client.getWorkspace(workspaceId);
  if (!workspace || String(workspace.id) !== String(workspaceId)) throw new Error(`Fabric workspace ${workspaceId} was not found`);
  if (workspaceName && workspace.displayName !== workspaceName) throw new Error(`Workspace ID ${workspaceId} is ${workspace.displayName}, not ${workspaceName}`);
  if (workspace.displayName !== manifest.workspace.displayName || workspace.capacityId !== manifest.workspace.capacityId) throw new Error("Backup workspace identity or capacity no longer matches the target");
  const actions = [];
  for (const item of manifest.items) {
    const currentItems = await client.listItems(workspaceId, item.type);
    const current = currentItems.find((candidate) => String(candidate.id) === String(item.itemId));
    if (!current || current.displayName !== item.displayName) throw new Error(`${item.type} ${item.itemId} no longer has the backed-up identity`);
    const backupParts = await encodeDefinition(backupItemRoot(root, item));
    verifyDefinitionParts(backupParts, item.format, { allowLegacyReportVersion: true });
    const backupHash = definitionHash(backupParts);
    if (backupHash !== item.definitionHash) throw new Error(`${item.type} ${item.displayName} backup content failed integrity verification`);
    const currentDefinition = await client.getDefinition(workspaceId, item.type, item.itemId, item.format);
    verifyDefinitionParts(currentDefinition.parts, item.format, { allowLegacyReportVersion: true });
    actions.push({ key: item.key, type: item.type, format: item.format, displayName: item.displayName, itemId: item.itemId, directory: item.directory, backupDefinitionHash: backupHash, currentDefinitionHash: definitionHash(currentDefinition.parts), operation: "restore" });
  }
  const core = { contractVersion: 1, kind: "supervisual-fabric-restore", workspace: manifest.workspace, backupDirectory: root, sourcePlanId: manifest.sourcePlanId, actions };
  return { ...core, planId: planId(core), createdAt: new Date().toISOString(), blockers: [] };
}

export async function applyRestorePlan({ client, plan, confirmPlanId }) {
  if (plan?.contractVersion !== 1 || plan?.kind !== "supervisual-fabric-restore") throw new Error("Restore plan is missing or invalid");
  if (confirmPlanId !== plan.planId) throw new Error(`Restore requires exact plan confirmation ${plan.planId}`);
  const workspace = await client.getWorkspace(plan.workspace.id);
  if (!workspace || workspace.displayName !== plan.workspace.displayName || workspace.capacityId !== plan.workspace.capacityId) throw new Error("Workspace identity or capacity changed after restore planning; create a new restore plan");
  const prepared = [];
  for (const action of plan.actions) {
    const currentItems = await client.listItems(plan.workspace.id, action.type);
    const current = currentItems.find((candidate) => String(candidate.id) === String(action.itemId));
    if (!current || current.displayName !== action.displayName) throw new Error(`${action.type} ${action.itemId} changed identity after restore planning`);
    const currentDefinition = await client.getDefinition(plan.workspace.id, action.type, action.itemId, action.format);
    verifyDefinitionParts(currentDefinition.parts, action.format, { allowLegacyReportVersion: true });
    if (definitionHash(currentDefinition.parts) !== action.currentDefinitionHash) throw new Error(`${action.type} ${action.displayName} changed after restore planning; create a new restore plan`);
    const root = path.resolve(plan.backupDirectory);
    const parts = await encodeDefinition(backupItemRoot(root, action));
    verifyDefinitionParts(parts, action.format, { allowLegacyReportVersion: true });
    if (definitionHash(parts) !== action.backupDefinitionHash) throw new Error(`${action.type} ${action.displayName} backup changed after restore planning; create a new restore plan`);
    prepared.push({ action, parts });
  }
  const items = {};
  for (const { action, parts } of prepared) {
    await client.updateItem(plan.workspace.id, action.type, action.itemId, action.format, parts);
    const restored = await client.getDefinition(plan.workspace.id, action.type, action.itemId, action.format);
    verifyDefinitionParts(restored.parts, action.format, { allowLegacyReportVersion: true });
    if (definitionHash(restored.parts) !== action.backupDefinitionHash) throw new Error(`${action.type} ${action.displayName} restore verification failed`);
    items[action.key] = { id: action.itemId, displayName: action.displayName, operation: "restore" };
  }
  return { planId: plan.planId, sourcePlanId: plan.sourcePlanId, workspace: plan.workspace, items, accepted: false, status: "restored-unverified" };
}
