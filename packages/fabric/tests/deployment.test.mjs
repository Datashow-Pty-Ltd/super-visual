import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { applyDeploymentPlan, applyRestorePlan, createDeploymentDiff, createDeploymentPlan, createRestorePlan, decodePart, verifyDefinitionParts } from "../src/index.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "supervisual-deploy-"));
  await mkdir(path.join(root, "SemanticAdapter.SemanticModel", "definition"), { recursive: true });
  await mkdir(path.join(root, "Report.Report", "definition"), { recursive: true });
  await writeFile(path.join(root, "SemanticAdapter.SemanticModel", "definition.pbism"), "{}\n");
  await writeFile(path.join(root, "SemanticAdapter.SemanticModel", "definition", "model.tmdl"), "model Model\n");
  await writeFile(path.join(root, "Report.Report", "definition.pbir"), JSON.stringify({ datasetReference: { byPath: { path: "../SemanticAdapter.SemanticModel" } } }));
  await writeFile(path.join(root, "Report.Report", "definition", "version.json"), JSON.stringify({ $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json", version: "2.0.0" }));
  await writeFile(path.join(root, "Report.Report", "definition", "report.json"), "{}\n");
  return root;
}

function reportParts(definitionPbir = { datasetReference: {} }, version = "2.0.0") {
  return [
    { path: "definition.pbir", payload: Buffer.from(JSON.stringify(definitionPbir)).toString("base64"), payloadType: "InlineBase64" },
    { path: "definition/version.json", payload: Buffer.from(JSON.stringify({ $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json", version })).toString("base64"), payloadType: "InlineBase64" },
  ];
}

class FakeClient {
  constructor(items = []) { this.items = items; this.definitions = new Map(); this.calls = []; }
  async getWorkspace(id) { return { id, displayName: "Release", capacityId: "capacity-1" }; }
  async listItems(_workspaceId, type) { return this.items.filter((item) => item.type === type); }
  async createItem(_workspaceId, type, displayName, format, parts) { const id = `${type.toLowerCase()}-1`; this.items.push({ id, type, displayName }); this.definitions.set(id, { format, parts }); this.calls.push(`create:${type}`); return { id }; }
  async updateItem(_workspaceId, type, id, format, parts) { this.definitions.set(id, { format, parts }); this.calls.push(`update:${type}`); return { id }; }
  async getDefinition(_workspaceId, _type, id) { return this.definitions.get(id); }
  async listConnections() { return []; }
}

class NormalizedReportClient extends FakeClient {
  constructor(boundSemanticModelId = "semanticmodel-1") {
    super();
    this.boundSemanticModelId = boundSemanticModelId;
  }

  async getDefinition(workspaceId, type, id) {
    const definition = await super.getDefinition(workspaceId, type, id);
    if (type !== "Report") return definition;
    return {
      ...definition,
      parts: definition.parts.map((part) => part.path === "definition.pbir"
        ? {
            ...part,
            payload: Buffer.from(JSON.stringify({
              datasetReference: {
                byConnection: {
                  connectionString: `Data Source="powerbi://api.powerbi.com/v1.0/myorg/Release";initial catalog="Sales; governed";integrated security=ClaimsToken;semanticmodelid=${this.boundSemanticModelId}`,
                },
              },
            })).toString("base64"),
          }
        : part),
    };
  }
}

describe("safe Fabric deployment", () => {
  test("rejects PBIR version metadata that Fabric cannot import", () => {
    expect(() => verifyDefinitionParts([
      { path: "definition.pbir", payload: Buffer.from("{}\n").toString("base64"), payloadType: "InlineBase64" },
      { path: "definition/version.json", payload: Buffer.from(JSON.stringify({ version: "1.0.0", schemaVersion: "1.0.0" })).toString("base64"), payloadType: "InlineBase64" },
    ], "PBIR")).toThrow(/must declare/);
  });

  test("rejects the schema-valid report format version that produces an empty exploration surface", () => {
    const parts = [
      { path: "definition.pbir", payload: Buffer.from("{}\n").toString("base64"), payloadType: "InlineBase64" },
      { path: "definition/version.json", payload: Buffer.from(JSON.stringify({ $schema: "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json", version: "1.0.0" })).toString("base64"), payloadType: "InlineBase64" },
    ];
    expect(() => verifyDefinitionParts(parts, "PBIR")).toThrow(/report format version 2\.0\.0/);
    expect(() => verifyDefinitionParts(parts, "PBIR", { allowLegacyReportVersion: true })).not.toThrow();
  });

  test("plans then creates semantic model before its bound report", async () => {
    const root = await fixture();
    const client = new FakeClient();
    const plan = await createDeploymentPlan({ client, workspaceId: "workspace-1", workspaceName: "Release", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report" });
    await expect(applyDeploymentPlan({ client, plan, confirmPlanId: "wrong" })).rejects.toThrow("exact plan confirmation");
    const result = await applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId });
    expect(client.calls).toEqual(["create:SemanticModel", "create:Report"]);
    expect(result.reportUrl).toBe("https://app.powerbi.com/groups/workspace-1/reports/report-1");
    const report = client.definitions.get(result.items.report.id);
    expect(JSON.parse(decodePart(report.parts.find((part) => part.path === "definition.pbir")).toString()).datasetReference.byConnection.connectionString).toBe("semanticmodelid=semanticmodel-1");
  });

  test("accepts Fabric-normalized report connection strings with the planned semantic model ID", async () => {
    const root = await fixture();
    const client = new NormalizedReportClient();
    const plan = await createDeploymentPlan({ client, workspaceId: "workspace-1", workspaceName: "Release", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report" });
    await expect(applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId })).resolves.toMatchObject({ items: { report: { id: "report-1" } } });
  });

  test("rejects Fabric-normalized report connection strings bound to another model", async () => {
    const root = await fixture();
    const client = new NormalizedReportClient("another-model");
    const plan = await createDeploymentPlan({ client, workspaceId: "workspace-1", workspaceName: "Release", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report" });
    await expect(applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId })).rejects.toThrow("Deployed report is not bound to the deployed semantic model");
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
    client.definitions.set("model-existing", { format: "TMDL", parts: [{ path: "definition.pbism", payload: Buffer.from("{}\n").toString("base64"), payloadType: "InlineBase64" }, { path: "definition/model.tmdl", payload: Buffer.from("model Existing\n").toString("base64"), payloadType: "InlineBase64" }] });
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
    client.definitions.set("report-existing", { format: "PBIR", parts: reportParts() });
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

  test("plans and applies a backup-first repair of a legacy remote PBIR report", async () => {
    const root = await fixture();
    const backup = await mkdtemp(path.join(os.tmpdir(), "supervisual-backup-"));
    const client = new FakeClient([
      { id: "model-existing", type: "SemanticModel", displayName: "Sales model" },
      { id: "report-existing", type: "Report", displayName: "Sales report" },
    ]);
    client.definitions.set("model-existing", { format: "TMDL", parts: [{ path: "definition.pbism", payload: Buffer.from("{}\n").toString("base64"), payloadType: "InlineBase64" }] });
    client.definitions.set("report-existing", { format: "PBIR", parts: reportParts({ datasetReference: {} }, "1.0.0") });
    const plan = await createDeploymentPlan({ client, workspaceId: "workspace-1", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report", allowUpdates: true });
    expect(plan.actions.find((action) => action.key === "report")).toMatchObject({ operation: "update", existingId: "report-existing" });
    const result = await applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId, backupDirectory: backup });
    expect(result.items.report).toMatchObject({ id: "report-existing", operation: "update" });
    const backedUpVersion = JSON.parse(await readFile(path.join(backup, "Report-report-existing", "definition", "version.json"), "utf8"));
    expect(backedUpVersion.version).toBe("1.0.0");
    const deployedVersion = JSON.parse(decodePart(client.definitions.get("report-existing").parts.find((part) => part.path === "definition/version.json")).toString());
    expect(deployedVersion.version).toBe("2.0.0");
  });

  test("rejects local solution content that changed after planning", async () => {
    const root = await fixture();
    const client = new FakeClient();
    const plan = await createDeploymentPlan({ client, workspaceId: "workspace-1", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report" });
    await writeFile(path.join(root, "SemanticAdapter.SemanticModel", "definition", "model.tmdl"), "model Changed\n");
    await expect(applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId })).rejects.toThrow(/local definition changed after planning/);
    expect(client.calls).toEqual([]);
  });

  test("blocks a connection that does not match the packaged semantic source before mutation", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "SemanticAdapter.SemanticModel", "definition", "expressions.tmdl"), 'expression Server = "localhost"\n\nexpression Database = "Demo"\n');
    const client = new FakeClient();
    client.listConnections = async () => [{ id: "connection-1", connectivityType: "ShareableCloud", connectionDetails: { type: "SQL", path: "server.example.com;Production" } }];
    const plan = await createDeploymentPlan({
      client,
      workspaceId: "workspace-1",
      solutionDirectory: root,
      semanticModelName: "Sales model",
      reportName: "Sales report",
      postDeployment: { connectionId: "connection-1", connectivityType: "ShareableCloud" },
    });
    expect(plan.blockers).toEqual([expect.stringMatching(/does not exactly match packaged semantic source SQL localhost;Demo/)]);
    plan.blockers = [];
    await expect(applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId })).rejects.toThrow(/does not exactly match packaged semantic source SQL localhost;Demo/);
    expect(client.calls).toEqual([]);
  });

  test("rejects remote update content that changed after planning", async () => {
    const root = await fixture();
    const client = new FakeClient([
      { id: "model-existing", type: "SemanticModel", displayName: "Sales model" },
      { id: "report-existing", type: "Report", displayName: "Sales report" },
    ]);
    client.definitions.set("model-existing", { format: "TMDL", parts: [{ path: "definition.pbism", payload: Buffer.from("{}\n").toString("base64"), payloadType: "InlineBase64" }] });
    client.definitions.set("report-existing", { format: "PBIR", parts: reportParts() });
    const plan = await createDeploymentPlan({ client, workspaceId: "workspace-1", solutionDirectory: root, semanticModelName: "Sales model", reportName: "Sales report", allowUpdates: true });
    client.definitions.set("model-existing", { format: "TMDL", parts: [{ path: "definition.pbism", payload: Buffer.from("{\"changed\":true}\n").toString("base64"), payloadType: "InlineBase64" }] });
    await expect(applyDeploymentPlan({ client, plan, confirmPlanId: plan.planId, backupDirectory: await mkdtemp(path.join(os.tmpdir(), "supervisual-backup-")) })).rejects.toThrow(/remote definition changed after planning/);
    expect(client.calls).toEqual([]);
  });
});
