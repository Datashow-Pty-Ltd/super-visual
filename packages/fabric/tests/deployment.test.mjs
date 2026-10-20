import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { applyDeploymentPlan, applyRestorePlan, createDeploymentDiff, createDeploymentPlan, createRestorePlan, decodePart } from "../src/index.mjs";

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

  test("diffs create, unchanged, and update definitions without mutation", async () => {
    const root = await fixture();
    const client = new FakeClient();
    const createDiff = await createDeploymentDiff({ client, workspaceId: "workspace-1", workspaceName: "Release", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report" });
    expect(createDiff.summary).toEqual({ create: 2, update: 0, unchanged: 0 });
    expect(client.calls).toEqual([]);

    const plan = await createDeploymentPlan({ client, workspaceId: "workspace-1", workspaceName: "Release", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report" });
    await applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId });
    client.calls.length = 0;
    const unchanged = await createDeploymentDiff({ client, workspaceId: "workspace-1", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report" });
    expect(unchanged.summary).toEqual({ create: 0, update: 0, unchanged: 2 });
    expect(client.calls).toEqual([]);

    await writeFile(path.join(root, "SemanticAdapter.SemanticModel", "definition", "model.tmdl"), "model Changed\n");
    const changed = await createDeploymentDiff({ client, workspaceId: "workspace-1", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report" });
    expect(changed.summary).toEqual({ create: 0, update: 1, unchanged: 1 });
    expect(client.calls).toEqual([]);
  });

  test("blocks same-name replacement unless updates were explicit", async () => {
    const root = await fixture();
    const client = new FakeClient([{ id: "model-existing", type: "SemanticModel", displayName: "Sales model" }]);
    const plan = await createDeploymentPlan({ client, workspaceId: "workspace-1", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report" });
    expect(plan.blockers).toHaveLength(1);
    await expect(applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId })).rejects.toThrow("blocked");
  });

  test("rejects an item that appeared after a create plan", async () => {
    const root = await fixture();
    const client = new FakeClient();
    const plan = await createDeploymentPlan({ client, workspaceId: "workspace-1", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report" });
    client.items.push({ id: "late-model", type: "SemanticModel", displayName: "Sales model" });
    await expect(applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId })).rejects.toThrow("appeared after planning");
    expect(client.calls).toEqual([]);
  });

  test("resumes an interrupted create plan from a matching progress receipt", async () => {
    const root = await fixture();
    class InterruptedClient extends FakeClient {
      async createItem(workspaceId, type, displayName, format, parts) {
        if (type === "Report" && !this.interrupted) {
          this.interrupted = true;
          throw new Error("simulated transient report failure");
        }
        return super.createItem(workspaceId, type, displayName, format, parts);
      }
    }
    const client = new InterruptedClient();
    const plan = await createDeploymentPlan({ client, workspaceId: "workspace-1", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report" });
    const receipt = { contractVersion: 1, kind: "supervisual-deployment-receipt", planId: plan.planId, workspace: plan.workspace, status: "in-progress", items: {} };
    await expect(applyDeploymentPlan({
      client,
      plan,
      confirmPlanId: plan.planId,
      onProgress: async ({ action, item }) => { receipt.items[action] = item; },
    })).rejects.toThrow("simulated transient report failure");
    expect(receipt.items.semanticModel.id).toBe("semanticmodel-1");

    const resumed = await applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId, resumeState: receipt });
    expect(resumed.items.semanticModel).toMatchObject({ id: "semanticmodel-1", resumed: true });
    expect(resumed.items.report.id).toBe("report-1");
    expect(client.calls).toEqual(["create:SemanticModel", "create:Report"]);
  });

  test("updates only after exact authorization and writes recoverable backups", async () => {
    const root = await fixture();
    const backup = await mkdtemp(path.join(os.tmpdir(), "supervisual-backup-"));
    const items = [
      { id: "model-existing", type: "SemanticModel", displayName: "Sales model" },
      { id: "report-existing", type: "Report", displayName: "Sales report" },
    ];
    const client = new FakeClient(items);
    client.definitions.set("model-existing", { format: "TMDL", parts: [{ path: "definition.pbism", payload: Buffer.from("{}\n").toString("base64"), payloadType: "InlineBase64" }] });
    client.definitions.set("report-existing", { format: "PBIR", parts: [{ path: "definition.pbir", payload: Buffer.from(JSON.stringify({ datasetReference: {} })).toString("base64"), payloadType: "InlineBase64" }] });
    const plan = await createDeploymentPlan({ client, workspaceId: "workspace-1", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report", allowUpdates: true });
    await expect(applyDeploymentPlan({ client, plan, confirmPlanId: "wrong", backupDirectory: backup })).rejects.toThrow(/exact plan confirmation/);
    const result = await applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId, backupDirectory: backup });
    expect(client.calls).toEqual(["update:SemanticModel", "update:Report"]);
    await expect(access(path.join(backup, "SemanticModel-model-existing", "definition.pbism"))).resolves.toBeUndefined();
    await expect(access(path.join(backup, "Report-report-existing", "definition.pbir"))).resolves.toBeUndefined();
    const backupManifest = JSON.parse(await readFile(path.join(backup, "backup-manifest.json"), "utf8"));
    expect(backupManifest).toMatchObject({ contractVersion: 1, kind: "supervisual-fabric-backup", sourcePlanId: plan.planId, workspace: { id: "workspace-1" }, items: [{ key: "semanticModel" }, { key: "report" }] });
    expect(result.status).toBe("published-unverified");
    expect(result.accepted).toBe(false);

    const restorePlan = await createRestorePlan({ client, backupDirectory: backup, workspaceId: "workspace-1", workspaceName: "Release" });
    await expect(applyRestorePlan({ client, plan: restorePlan, confirmPlanId: "wrong" })).rejects.toThrow(/exact plan confirmation/);
    client.calls.length = 0;
    const restored = await applyRestorePlan({ client, plan: restorePlan, confirmPlanId: restorePlan.planId });
    expect(client.calls).toEqual(["update:SemanticModel", "update:Report"]);
    expect(restored).toMatchObject({ status: "restored-unverified", accepted: false, sourcePlanId: plan.planId });
    expect(client.definitions.get("model-existing").parts).toEqual([{ path: "definition.pbism", payload: Buffer.from("{}\n").toString("base64"), payloadType: "InlineBase64" }]);
  });

  test("rejects local solution content that changed after planning", async () => {
    const root = await fixture();
    const client = new FakeClient();
    const plan = await createDeploymentPlan({ client, workspaceId: "workspace-1", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report" });
    await writeFile(path.join(root, "SemanticAdapter.SemanticModel", "definition", "model.tmdl"), "model Changed\n");
    await expect(applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId })).rejects.toThrow(/local definition changed after planning/);
    expect(client.calls).toEqual([]);
  });

  test("rejects remote update content that changed after planning", async () => {
    const root = await fixture();
    const client = new FakeClient([
      { id: "model-existing", type: "SemanticModel", displayName: "Sales model" },
      { id: "report-existing", type: "Report", displayName: "Sales report" },
    ]);
    client.definitions.set("model-existing", { format: "TMDL", parts: [{ path: "definition.pbism", payload: Buffer.from("{}\n").toString("base64"), payloadType: "InlineBase64" }] });
    client.definitions.set("report-existing", { format: "PBIR", parts: [{ path: "definition.pbir", payload: Buffer.from("{}\n").toString("base64"), payloadType: "InlineBase64" }] });
    const plan = await createDeploymentPlan({ client, workspaceId: "workspace-1", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report", allowUpdates: true });
    client.definitions.set("model-existing", { format: "TMDL", parts: [{ path: "definition.pbism", payload: Buffer.from("{\"changed\":true}\n").toString("base64"), payloadType: "InlineBase64" }] });
    await expect(applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId, backupDirectory: await mkdtemp(path.join(os.tmpdir(), "supervisual-backup-")) })).rejects.toThrow(/remote definition changed after planning/);
    expect(client.calls).toEqual([]);
  });
});
