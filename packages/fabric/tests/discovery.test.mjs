import { describe, expect, test } from "vitest";
import { discoverFabric, discoverFabricWorkspaces, readDeploymentStatus } from "../src/index.mjs";

function encoded(value) { return Buffer.from(JSON.stringify(value)).toString("base64"); }

class DiscoveryClient {
  async listWorkspaces() { return [{ id: "workspace-2", displayName: "Sandbox" }, { id: "workspace-1", displayName: "Release", capacityId: "capacity-1", description: "must-not-leak" }]; }
  async getWorkspace(id) { return { id, displayName: "Release", capacityId: "capacity-1" }; }
  async listItems(_workspaceId, type) { return type === "SemanticModel" ? [{ id: "model-1", type, displayName: "Sales model" }] : [{ id: "report-1", type, displayName: "Sales report" }]; }
  async listConnections() { return [{ id: "connection-1", displayName: "Warehouse", connectivityType: "ShareableCloud", connectionDetails: { type: "SQL", path: "server;database", credentialDetails: "must-not-leak" } }]; }
  async getSemanticConnections() { return [{ id: "connection-1", connectivityType: "ShareableCloud", connectionDetails: { type: "SQL", path: "server;database" } }]; }
  async getRefreshHistory() { return [{ status: "Completed", startTime: "2026-10-20T00:00:00Z" }]; }
  async getDefinition() { return { format: "PBIR", parts: [{ path: "definition.pbir", payloadType: "InlineBase64", payload: encoded({ datasetReference: { byConnection: { connectionString: "Data Source=\"powerbi://api.powerbi.com/v1.0/myorg/Release\";initial catalog=\"Sales; governed\";semanticmodelid=model-1" } } }) }] }; }
  async executeDax() { return [{ Sales: 100 }]; }
}

describe("read-only Fabric discovery and status", () => {
  test("lists sorted immutable workspace identities without extra tenant metadata", async () => {
    const result = await discoverFabricWorkspaces({ client: new DiscoveryClient() });
    expect(result).toEqual({ ok: true, workspaces: [
      { id: "workspace-1", displayName: "Release", capacityId: "capacity-1", capacityAssigned: true },
      { id: "workspace-2", displayName: "Sandbox", capacityId: null, capacityAssigned: false },
    ] });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  test("lists immutable workspace identity, items, and sanitized connections", async () => {
    const result = await discoverFabric({ client: new DiscoveryClient(), workspaceId: "workspace-1", workspaceName: "Release", includeConnections: true });
    expect(result).toMatchObject({ ok: true, capacityAssigned: true, workspace: { id: "workspace-1" }, items: { semanticModels: [{ id: "model-1" }], reports: [{ id: "report-1" }] }, connections: [{ id: "connection-1" }] });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  test("reports accepted only when binding, refresh, report binding, and DAX all pass", async () => {
    const result = await readDeploymentStatus({ client: new DiscoveryClient(), workspaceId: "workspace-1", semanticModelId: "model-1", reportId: "report-1", connectionId: "connection-1", acceptanceDax: "EVALUATE ROW(\"Sales\", 100)" });
    expect(result).toMatchObject({ ok: true, status: "accepted", semanticModel: { bindingMatches: true, latestRefresh: { status: "Completed" }, acceptance: { rowCount: 1 } }, report: { boundSemanticModelId: "model-1", bindingMatches: true } });
  });
});
