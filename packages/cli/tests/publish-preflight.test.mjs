import { afterEach, describe, expect, test, vi } from "vitest";

const fabricMocks = vi.hoisted(() => ({
  inspectSemanticModel: vi.fn(),
  preflightDeploymentTarget: vi.fn(),
}));

const compilerMocks = vi.hoisted(() => ({
  buildSolution: vi.fn(),
}));

vi.mock("@datashow/super-visual-fabric", async () => {
  const actual = await vi.importActual("@datashow/super-visual-fabric");
  return {
    ...actual,
    inspectSemanticModel: fabricMocks.inspectSemanticModel,
    preflightDeploymentTarget: fabricMocks.preflightDeploymentTarget,
  };
});

vi.mock("@datashow/super-visual-compiler", async () => {
  const actual = await vi.importActual("@datashow/super-visual-compiler");
  return { ...actual, buildSolution: compilerMocks.buildSolution };
});

const { createProgram } = await import("../src/main.mjs");

describe("publish target preflight", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  test("stops before semantic inspection and compilation when target items already exist", async () => {
    fabricMocks.preflightDeploymentTarget.mockResolvedValue({
      ok: false,
      status: "blocked",
      workspace: { id: "11111111-1111-1111-1111-111111111111", displayName: "Release", capacityId: "capacity-1" },
      allowUpdates: false,
      actions: [
        { key: "semanticModel", type: "SemanticModel", displayName: "Sales Report — Super Visual data", operation: "blocked", existingId: "model-1" },
        { key: "report", type: "Report", displayName: "Sales Report", operation: "blocked", existingId: "report-1" },
      ],
      blockers: [
        "SemanticModel Sales Report — Super Visual data already exists; create a plan with updates explicitly enabled",
        "Report Sales Report already exists; create a plan with updates explicitly enabled",
      ],
    });
    const stdout = [];
    vi.spyOn(process.stdout, "write").mockImplementation((value) => { stdout.push(String(value)); return true; });

    const program = createProgram();
    await program.parseAsync([
      "publish",
      "examples/hello-world",
      "--workspace-id", "11111111-1111-1111-1111-111111111111",
      "--workspace-name", "Release",
      "--semantic-model-id", "22222222-2222-2222-2222-222222222222",
      "--report-name", "Sales Report",
      "--json",
    ], { from: "user" });

    expect(fabricMocks.preflightDeploymentTarget).toHaveBeenCalledOnce();
    expect(fabricMocks.inspectSemanticModel).not.toHaveBeenCalled();
    expect(compilerMocks.buildSolution).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      ok: false,
      status: "blocked",
      phase: "target-preflight",
      reportUrl: "https://app.powerbi.com/groups/11111111-1111-1111-1111-111111111111/reports/report-1",
    });
    expect(process.exitCode).toBe(2);
  });
});
