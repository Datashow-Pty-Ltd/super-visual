import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(".");
const cli = path.join(root, "packages", "cli", "bin", "supervisual.mjs");
const temporary = await mkdtemp(path.join(os.tmpdir(), "supervisual-claude-e2e-"));
const project = path.join(temporary, "dashboard");
const shouldPackage = process.argv.includes("--package");

try {
  await run(process.execPath, [cli, "init", project, "--title", "Claude Adapter Fixture", "--json"], { cwd: root });
  await run(process.execPath, [cli, "import", "claude-dashboard", "examples/claude-dashboard-bundle", "--project", project, "--json"], { cwd: root });
  await run(process.execPath, [cli, "check", project, "--json"], { cwd: root });
  const command = shouldPackage ? "package" : "compile";
  const built = JSON.parse((await run(process.execPath, [cli, command, project, "--json"], { cwd: root, maxBuffer: 20 * 1024 * 1024 })).stdout);
  const verified = JSON.parse((await run(process.execPath, [cli, "verify", project, "--json"], { cwd: root })).stdout);
  if (!built.ok || !verified.ok) throw new Error("Claude Dashboard fixture did not compile and verify");
  process.stdout.write(`Claude Dashboard fixture ${shouldPackage ? "packaged" : "compiled"} and verified (${built.fileCount} files)\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
