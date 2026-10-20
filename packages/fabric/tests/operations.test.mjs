import { describe, expect, test } from "vitest";
import { bindSemanticModelConnection, executeAcceptanceQuery, refreshSemanticModel } from "../src/index.mjs";

test("binds an exact connection, refreshes, and executes acceptance DAX", async () => {
  let bound = false;
  const client = {
    async getSemanticConnections() { return bound ? [{ id: "connection-1", connectivityType: "ShareableCloud", connectionDetails: { type: "SQL", path: "server;database" } }] : [{ connectionDetails: { type: "SQL", path: "server;database" } }]; },
    async listConnections() { return [{ id: "connection-1", connectivityType: "ShareableCloud", connectionDetails: { type: "SQL", path: "server;database" } }]; },
    async bindSemanticConnection() { bound = true; },
    async triggerRefresh() {},
    async getRefreshHistory() { return [{ status: "Completed", startTime: new Date().toISOString() }]; },
    async executeDax() { return [{ Sales: 100 }]; },
  };
  expect((await bindSemanticModelConnection({ client, workspaceId: "w", semanticModelId: "m", connectionId: "connection-1", pollIntervalMs: 0 })).referenceCount).toBe(1);
  expect((await refreshSemanticModel({ client, workspaceId: "w", semanticModelId: "m", pollIntervalMs: 0 })).status).toBe("Completed");
  expect((await executeAcceptanceQuery({ client, workspaceId: "w", semanticModelId: "m", query: "EVALUATE ROW(\"Sales\", [Sales])" })).rowCount).toBe(1);
});

test("fails a deployment refresh whose latest operation failed", async () => {
  const client = {
    async triggerRefresh() {},
    async getRefreshHistory() { return [{ status: "Failed", startTime: new Date().toISOString(), serviceExceptionJson: "source unavailable" }]; },
  };
  await expect(refreshSemanticModel({ client, workspaceId: "w", semanticModelId: "m", pollIntervalMs: 0 })).rejects.toThrow(/refresh Failed.*source unavailable/);
});
