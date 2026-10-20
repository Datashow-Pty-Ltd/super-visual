import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { bindReportToSemanticModel, decodePart, encodeDefinition, verifyDefinitionParts } from "./parts.mjs";
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

export async function createDeploymentPlan({ client, workspaceId, workspaceName, solutionDirectory, semanticModelName, reportName, allowUpdates = false, postDeployment = null }) {
  if (!workspaceId) throw new Error("A Fabric workspace ID is required; display-name-only deployment is not safe");
  const workspace = await client.getWorkspace(workspaceId);
  if (!workspace || workspace.id !== workspaceId) throw new Error(`Fabric workspace ${workspaceId} was not found`);
  if (workspaceName && workspace.displayName !== workspaceName) throw new Error(`Workspace ID ${workspaceId} is ${workspace.displayName}, not ${workspaceName}`);
  if (!workspace.capacityId) throw new Error(`Workspace ${workspace.displayName} is not assigned to Fabric capacity`);
  const [semanticItems, reportItems] = await Promise.all([client.listItems(workspaceId, "SemanticModel"), client.listItems(workspaceId, "Report")]);
  const semantic = oneByName(semanticItems, semanticModelName, "SemanticModel");
  const report = oneByName(reportItems, reportName, "Report");
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
      verifyDefinitionParts(remote.parts, action.format);
      action.remoteDefinitionHash = definitionHash(remote.parts);
    }
  }
  const core = { contractVersion: 1, workspace: { id: workspace.id, displayName: workspace.displayName, capacityId: workspace.capacityId }, solutionDirectory: path.resolve(solutionDirectory), allowUpdates, actions, postDeployment };
  return { ...core, planId: planId(core), createdAt: new Date().toISOString(), blockers: actions.filter((action) => action.operation === "blocked").map((action) => `${action.type} ${action.displayName} already exists; create a plan with updates explicitly enabled`) };
}

async function backup(client, workspaceId, action, directory) {
  if (!action.existingId) return null;
  const remote = await client.getDefinition(workspaceId, action.type, action.existingId, action.format);
  verifyDefinitionParts(remote.parts, action.format);
  const root = path.join(directory, `${action.type}-${action.existingId}`);
  for (const part of remote.parts) {
    const target = path.resolve(root, part.path);
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error(`Unsafe backup part ${part.path}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, decodePart(part));
  }
  return root;
}

export async function applyDeploymentPlan({ client, plan, confirmPlanId, backupDirectory }) {
  if (plan.blockers.length) throw new Error(`Deployment plan is blocked:\n- ${plan.blockers.join("\n- ")}`);
  if (confirmPlanId !== plan.planId) throw new Error(`Deployment requires exact plan confirmation ${plan.planId}`);
  const workspace = await client.getWorkspace(plan.workspace.id);
  if (!workspace || workspace.displayName !== plan.workspace.displayName || workspace.capacityId !== plan.workspace.capacityId) throw new Error("Workspace identity or capacity changed after planning; create a new plan");
  const currentByType = new Map();
  for (const type of ["SemanticModel", "Report"]) currentByType.set(type, await client.listItems(plan.workspace.id, type));
  for (const action of plan.actions) {
    const current = oneByName(currentByType.get(action.type), action.displayName, action.type);
    if (action.operation === "create" && current) throw new Error(`${action.type} ${action.displayName} appeared after planning; create a new plan`);
    if (action.operation === "update" && current?.id !== action.existingId) throw new Error(`${action.type} ${action.displayName} changed identity after planning; create a new plan`);
    const localParts = await encodeDefinition(path.join(plan.solutionDirectory, action.directory));
    verifyDefinitionParts(localParts, action.format);
    if (definitionHash(localParts) !== action.contentHash) throw new Error(`${action.type} ${action.displayName} local definition changed after planning; create a new plan`);
    if (action.operation === "update") {
      const remote = await client.getDefinition(plan.workspace.id, action.type, action.existingId, action.format);
      verifyDefinitionParts(remote.parts, action.format);
      if (definitionHash(remote.parts) !== action.remoteDefinitionHash) throw new Error(`${action.type} ${action.displayName} remote definition changed after planning; create a new plan`);
    }
  }
  const updateActions = plan.actions.filter((action) => action.operation === "update");
  if (updateActions.length && !backupDirectory) throw new Error("Updates require a backup directory");
  for (const action of updateActions) await backup(client, plan.workspace.id, action, backupDirectory);
  const results = {};
  let semanticModelId;
  for (const action of plan.actions) {
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
      if (parsed.datasetReference?.byConnection?.connectionString?.toLowerCase() !== `semanticmodelid=${semanticModelId}`.toLowerCase()) throw new Error("Deployed report is not bound to the deployed semantic model");
    }
    results[action.key] = { id: itemId, displayName: action.displayName, operation: action.operation };
  }
  let verification = null;
  if (plan.postDeployment) {
    const binding = await bindSemanticModelConnection({ client, workspaceId: plan.workspace.id, semanticModelId, connectionId: plan.postDeployment.connectionId, connectivityType: plan.postDeployment.connectivityType });
    const refresh = await refreshSemanticModel({ client, workspaceId: plan.workspace.id, semanticModelId, timeoutSeconds: plan.postDeployment.timeoutSeconds ?? 900 });
    const acceptance = plan.postDeployment.acceptanceDax ? await executeAcceptanceQuery({ client, workspaceId: plan.workspace.id, semanticModelId, query: plan.postDeployment.acceptanceDax }) : null;
    verification = { binding, refresh: { status: refresh.status }, acceptance };
  }
  const accepted = Boolean(verification?.binding && verification?.refresh?.status === "Completed" && verification?.acceptance);
  return { planId: plan.planId, workspace: plan.workspace, items: results, verification, accepted, status: accepted ? "accepted" : "published-unverified" };
}
