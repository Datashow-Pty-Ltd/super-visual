import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { applyDeploymentPlan, createDeploymentPlan, decodePart } from "../src/index.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "supervisual-deploy-"));
  await mkdir(path.join(root, "SemanticAdapter.SemanticModel", "definition"), { recursive: true });
  await mkdir(path.join(root, "Report.Report", "definition"), { recursive: true });
  await writeFile(path.join(root, "SemanticAdapter.SemanticModel", "definition.pbism"), "{}\n");
  await writeFile(path.join(root, "SemanticAdapter.SemanticModel", "definition", "model.tmdl"), "model Model\n");
  await writeFile(path.join(root, "Report.Report", "definition.pbir"), JSON.stringify({ datasetReference: { byPath: { path: "../SemanticAdapter.SemanticModel" } } }));
  await writeFile(path.join(root, "Report.Report", "definition", "report.json"), "{}\n");
  return root;
}

class FakeClient {
  constructor(items = []) { this.items = items; this.definitions = new Map(); this.calls = []; }
  async getWorkspace(id) { return { id, displayName: "Release", capacityId: "capacity-1" }; }
  async listItems(_workspaceId, type) { return this.items.filter((item) => item.type === type); }
  async createItem(_workspaceId, type, displayName, format, parts) { const id = `${type.toLowerCase()}-1`; this.items.push({ id, type, displayName }); this.definitions.set(id, { format, parts }); this.calls.push(`create:${type}`); return { id }; }
  async updateItem(_workspaceId, type, id, format, parts) { this.definitions.set(id, { format, parts }); this.calls.push(`update:${type}`); return { id }; }
  async getDefinition(_workspaceId, _type, id) { return this.definitions.get(id); }
}

describe("safe Fabric deployment", () => {
  test("plans then creates semantic model before its bound report", async () => {
    const root = await fixture();
    const client = new FakeClient();
    const plan = await createDeploymentPlan({ client, workspaceId: "workspace-1", workspaceName: "Release", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report" });
    await expect(applyDeploymentPlan({ client, plan, confirmPlanId: "wrong" })).rejects.toThrow("exact plan confirmation");
    const result = await applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId });
    expect(client.calls).toEqual(["create:SemanticModel", "create:Report"]);
    const report = client.definitions.get(result.items.report.id);
    expect(JSON.parse(decodePart(report.parts.find((part) => part.path === "definition.pbir")).toString()).datasetReference.byConnection.connectionString).toBe("semanticmodelid=semanticmodel-1");
  });

  test("blocks same-name replacement unless updates were explicit", async () => {
    const root = await fixture();
    const client = new FakeClient([{ id: "model-existing", type: "SemanticModel", displayName: "Sales model" }]);
    const plan = await createDeploymentPlan({ client, workspaceId: "workspace-1", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report" });
    expect(plan.blockers).toHaveLength(1);
    await expect(applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId })).rejects.toThrow("blocked");
  });
});
