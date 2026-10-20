import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helper = path.join(root, "examples/adventureworks/deployment/deploy.mjs");

const help = spawnSync(process.execPath, [helper, "--help"], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(help.status, 0, help.stderr);
for (const expected of ["database", "plan", "apply", "status", "exact human-authorized Super Visual plan ID"]) {
  assert.match(help.stdout, new RegExp(expected));
}

const unsafeTarget = spawnSync(process.execPath, [
  helper,
  "database",
  "--resource-group", "example-resource-group",
  "--location", "australiaeast",
  "--server", "svexample",
  "--database", "AdventureWorksDW2025",
  "--confirm-source", "different-target/AdventureWorksDW2025",
], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(unsafeTarget.status, 1);
const failure = JSON.parse(unsafeTarget.stderr);
assert.equal(failure.ok, false);
assert.match(failure.error, /requires --confirm-source svexample\/AdventureWorksDW2025/);

process.stdout.write("AdventureWorks deployment helper verified\n");
