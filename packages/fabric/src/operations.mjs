export async function bindSemanticModelConnection({ client, workspaceId, semanticModelId, connectionId, connectivityType = "ShareableCloud", pollAttempts = 15, pollIntervalMs = 2000 }) {
  if (!connectionId) throw new Error("An explicit Fabric connection ID is required");
  const references = await client.getSemanticConnections(workspaceId, semanticModelId);
  if (!references.length) throw new Error("The semantic model exposes no data-source reference to bind");
  const connections = await client.listConnections();
  const connection = connections.find((item) => String(item.id) === connectionId);
  if (!connection) throw new Error(`Fabric connection ${connectionId} is not accessible`);
  if (connection.connectivityType !== connectivityType) throw new Error(`Fabric connection ${connectionId} uses ${connection.connectivityType}, not ${connectivityType}`);
  for (const reference of references) {
    const expected = reference.connectionDetails;
    const actual = connection.connectionDetails;
    if (!expected || actual?.type !== expected.type || actual?.path !== expected.path) throw new Error(`Fabric connection ${connectionId} does not exactly match semantic source ${String(expected?.type)} ${String(expected?.path)}`);
    await client.bindSemanticConnection(workspaceId, semanticModelId, { id: connectionId, connectivityType, connectionDetails: expected });
  }
  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    const bound = await client.getSemanticConnections(workspaceId, semanticModelId);
    const complete = references.every((reference) => bound.some((item) => item.connectionDetails?.type === reference.connectionDetails?.type && item.connectionDetails?.path === reference.connectionDetails?.path && String(item.id) === connectionId && item.connectivityType === connectivityType));
    if (complete) return { connectionId, referenceCount: references.length };
    if (attempt + 1 < pollAttempts) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error("Semantic model connection binding did not converge");
}

export async function refreshSemanticModel({ client, workspaceId, semanticModelId, timeoutSeconds = 900, pollIntervalMs = 5000 }) {
  const triggeredAt = Date.now();
  await client.triggerRefresh(workspaceId, semanticModelId);
  while ((Date.now() - triggeredAt) / 1000 < timeoutSeconds) {
    const history = await client.getRefreshHistory(workspaceId, semanticModelId);
    const refresh = history.find((item) => {
      const start = Date.parse(String(item.startTime ?? ""));
      return Number.isFinite(start) && start >= triggeredAt - 30_000;
    });
    const status = String(refresh?.status ?? "");
    if (status === "Completed") return { status, refresh };
    if (["Failed", "Disabled", "Cancelled"].includes(status)) throw new Error(`Semantic model refresh ${status}: ${String(refresh?.serviceExceptionJson ?? "no detail")}`);
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Semantic model refresh exceeded ${timeoutSeconds}s`);
}

export async function executeAcceptanceQuery({ client, workspaceId, semanticModelId, query }) {
  if (!/^\s*EVALUATE\b/i.test(query ?? "")) throw new Error("Acceptance DAX must be an EVALUATE query");
  const rows = await client.executeDax(workspaceId, semanticModelId, query);
  if (!rows.length) throw new Error("Acceptance DAX returned no rows");
  if (rows.some((row) => Object.values(row).some((value) => value === null || value === undefined))) throw new Error("Acceptance DAX returned null values");
  return { rowCount: rows.length, rows };
}
