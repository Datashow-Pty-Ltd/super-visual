import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const run = promisify(execFile);
const root = path.resolve(".");
const cli = path.join(root, "packages", "cli", "bin", "supervisual.mjs");

describe("supervisual CLI", () => {
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
