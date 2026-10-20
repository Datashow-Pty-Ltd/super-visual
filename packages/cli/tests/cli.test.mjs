import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const run = promisify(execFile);
const root = path.resolve(".");
const cli = path.join(root, "packages", "cli", "bin", "supervisual.mjs");

describe("supervisual CLI", () => {
  test("exposes a discoverable command surface and version", async () => {
    const help = await run(process.execPath, [cli, "--help"], { cwd: root });
    expect(help.stdout).toContain("discover");
    expect(help.stdout).toContain("init");
    expect(help.stdout).toContain("package");
    expect(help.stdout).toContain("deploy");
    const version = await run(process.execPath, [cli, "--version"], { cwd: root });
    expect(version.stdout.trim()).toBe("0.1.0-rc.0");
  });

  test("discovers and inspects a project", async () => {
    const discovered = await run(process.execPath, [cli, "discover", "examples/adventureworks", "--json"], { cwd: root });
    expect(JSON.parse(discovered.stdout)).toMatchObject({ ok: true, type: "supervisual-project", supported: true });
    const inspected = await run(process.execPath, [cli, "inspect", "examples/adventureworks", "--json"], { cwd: root });
    expect(JSON.parse(inspected.stdout)).toMatchObject({ ok: true, application: { id: "adventureworks-product-ledger" } });
  });

  test("initializes, checks, compiles, and verifies hello world", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-cli-test-"));
    const project = path.join(temporary, "first-dashboard");
    try {
      const initialized = await run(process.execPath, [cli, "init", project, "--title", "First Dashboard", "--json"], { cwd: root });
      expect(JSON.parse(initialized.stdout)).toMatchObject({ ok: true, template: "hello-world", application: { id: "first-dashboard", title: "First Dashboard" } });
      const checked = await run(process.execPath, [cli, "check", project, "--json"], { cwd: root });
      expect(JSON.parse(checked.stdout).ok).toBe(true);
      const built = await run(process.execPath, [cli, "compile", project, "--json"], { cwd: root });
      expect(JSON.parse(built.stdout).fileCount).toBeGreaterThan(35);
      const verified = await run(process.execPath, [cli, "verify", project, "--json"], { cwd: root });
      expect(JSON.parse(verified.stdout).ok).toBe(true);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test("checks the standalone sample with machine-readable output", async () => {
    const { stdout } = await run(process.execPath, [cli, "check", "examples/adventureworks", "--json"], { cwd: root });
    expect(JSON.parse(stdout).ok).toBe(true);
  });
  test("builds and verifies the standalone sample", async () => {
    const built = await run(process.execPath, [cli, "build", "examples/adventureworks", "--json"], { cwd: root });
    expect(JSON.parse(built.stdout).fileCount).toBeGreaterThan(50);
    const verified = await run(process.execPath, [cli, "verify", "examples/adventureworks", "--json"], { cwd: root });
    expect(JSON.parse(verified.stdout).ok).toBe(true);
  });
});
