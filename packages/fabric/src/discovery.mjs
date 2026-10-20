import { decodePart } from "./parts.mjs";
import { executeAcceptanceQuery } from "./operations.mjs";

function publicConnection(connection) {
  return {
    id: connection.id,
    displayName: connection.displayName ?? null,
    connectivityType: connection.connectivityType ?? null,
    connectionDetails: connection.connectionDetails ? { type: connection.connectionDetails.type ?? null, path: connection.connectionDetails.path ?? null } : null,
    gatewayId: connection.gatewayId ?? null,
  };
}

function connectionStringValue(connectionString, key) {
  if (typeof connectionString !== "string") return null;
  const segments = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < connectionString.length; index += 1) {
    const character = connectionString[index];
    if (character === '"') {
      if (quoted && connectionString[index + 1] === '"') {
        current += '""';
        index += 1;
        continue;
      }
      quoted = !quoted;
    }
    if (character === ";" && !quoted) {
      segments.push(current);
      current = "";
    } else current += character;
  }
  segments.push(current);
  for (const segment of segments) {
    const separator = segment.indexOf("=");
    if (separator < 1 || segment.slice(0, separator).trim().toLowerCase() !== key.toLowerCase()) continue;
    const raw = segment.slice(separator + 1).trim();
    return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1).replaceAll('""', '"') : raw;
  }
  return null;
}

export async function discoverFabricWorkspaces({ client }) {
  const workspaces = await client.listWorkspaces();
  return {
    ok: true,
    workspaces: workspaces.map((workspace) => ({
      id: workspace.id,
      displayName: workspace.displayName,
      capacityId: workspace.capacityId ?? null,
      capacityAssigned: Boolean(workspace.capacityId),
    })).sort((left, right) => left.displayName.localeCompare(right.displayName) || String(left.id).localeCompare(String(right.id))),
  };
}

export async function discoverFabric({ client, workspaceId, workspaceName, includeConnections = false }) {
  if (!workspaceId) throw new Error("A Fabric workspace ID is required; display-name-only discovery is not safe");
  const workspace = await client.getWorkspace(workspaceId);
  if (!workspace || workspace.id !== workspaceId) throw new Error(`Fabric workspace ${workspaceId} was not found`);
  if (workspaceName && workspace.displayName !== workspaceName) throw new Error(`Workspace ID ${workspaceId} is ${workspace.displayName}, not ${workspaceName}`);
  const [semanticModels, reports, connections] = await Promise.all([
    client.listItems(workspaceId, "SemanticModel"),
    client.listItems(workspaceId, "Report"),
    includeConnections ? client.listConnections() : Promise.resolve([]),
  ]);
  return {
    ok: true,
    workspace: { id: workspace.id, displayName: workspace.displayName, capacityId: workspace.capacityId ?? null },
    capacityAssigned: Boolean(workspace.capacityId),
    items: {
      semanticModels: semanticModels.map(({ id, displayName, type }) => ({ id, displayName, type: type ?? "SemanticModel" })),
      reports: reports.map(({ id, displayName, type }) => ({ id, displayName, type: type ?? "Report" })),
    },
    connections: connections.map(publicConnection),
  };
}

export async function readDeploymentStatus({ client, workspaceId, workspaceName, semanticModelId, reportId, connectionId, acceptanceDax }) {
  const discovery = await discoverFabric({ client, workspaceId, workspaceName, includeConnections: Boolean(connectionId) });
  const semanticModel = semanticModelId ? discovery.items.semanticModels.find((item) => String(item.id) === String(semanticModelId)) : null;
  const report = reportId ? discovery.items.reports.find((item) => String(item.id) === String(reportId)) : null;
  if (semanticModelId && !semanticModel) throw new Error(`Semantic model ${semanticModelId} was not found in workspace ${workspaceId}`);
  if (reportId && !report) throw new Error(`Report ${reportId} was not found in workspace ${workspaceId}`);
  let semantic = null;
  if (semanticModel) {
    const [references, refreshes] = await Promise.all([
      client.getSemanticConnections(workspaceId, semanticModel.id),
      client.getRefreshHistory(workspaceId, semanticModel.id),
    ]);
    const selectedConnection = connectionId ? discovery.connections.find((item) => String(item.id) === String(connectionId)) ?? null : null;
    const bindingMatches = connectionId ? references.length > 0 && references.every((reference) => String(reference.id) === String(connectionId)) : null;
    const acceptance = acceptanceDax ? await executeAcceptanceQuery({ client, workspaceId, semanticModelId: semanticModel.id, query: acceptanceDax }) : null;
    semantic = { ...semanticModel, connections: references.map(publicConnection), selectedConnection, bindingMatches, latestRefresh: refreshes[0] ?? null, acceptance };
  }
  let reportState = null;
  if (report) {
    const definition = await client.getDefinition(workspaceId, "Report", report.id, "PBIR");
    const pbir = definition.parts?.find((part) => part.path === "definition.pbir");
    const parsed = pbir ? JSON.parse(decodePart(pbir).toString("utf8")) : {};
    const connectionString = parsed.datasetReference?.byConnection?.connectionString ?? null;
    const boundSemanticModelId = connectionStringValue(connectionString, "semanticmodelid");
    reportState = { ...report, connectionString, boundSemanticModelId, bindingMatches: semanticModelId ? String(boundSemanticModelId).toLowerCase() === String(semanticModelId).toLowerCase() : null };
  }
  const accepted = Boolean(semantic && reportState && connectionId && semantic.selectedConnection && semantic.bindingMatches === true && reportState.bindingMatches === true && semantic.latestRefresh?.status === "Completed" && semantic.acceptance);
  return { ok: true, status: accepted ? "accepted" : "observed", workspace: discovery.workspace, semanticModel: semantic, report: reportState };
}
