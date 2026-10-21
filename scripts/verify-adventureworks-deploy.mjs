import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helper = path.join(root, "examples/adventureworks/deployment/deploy.mjs");
const setup = path.join(root, "examples/adventureworks/deployment/setup.mjs");

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

const setupHelp = spawnSync(process.execPath, [setup, "--help"], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(setupHelp.status, 0, setupHelp.stderr);
for (const expected of ["guided setup", "download-only", "never asks for, prints, or stores passwords", "exact immutable plan ID"]) {
  assert.match(setupHelp.stdout, new RegExp(expected));
}

const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "supervisual-adventureworks-"));
try {
  const answersFile = path.join(temporaryDirectory, "answers.json");
  writeFileSync(answersFile, JSON.stringify({
    sourceMode: "existing-database",
    resourceGroup: "example-resource-group",
    location: "australiaeast",
    server: "svexample",
    database: "AdventureWorksDW2025",
    connectionReady: true,
    connectionId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    workspaceName: "AdventureWorks Example",
    semanticModelName: "AdventureWorks Super Visual",
    reportName: "AdventureWorks Product Ledger",
    allowUpdates: false,
  }));
  const dryRun = spawnSync(process.execPath, [setup, "--answers", answersFile, "--dry-run"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  for (const expected of [
    "Check Azure sign-in and source settings",
    "Prepare the AdventureWorks Azure SQL source",
    "Connect Fabric securely",
    "create an immutable plan",
    "answers file cannot pre-authorize it",
    "No Azure or Fabric resources were changed",
  ]) assert.match(dryRun.stdout, new RegExp(expected));
  assert.doesNotMatch(dryRun.stdout, /Plan ID \(leave blank to stop safely\)/);

  const unsafeAnswers = path.join(temporaryDirectory, "unsafe-answers.json");
  writeFileSync(unsafeAnswers, JSON.stringify({ password: "must-not-be-accepted" }));
  const rejected = spawnSync(process.execPath, [setup, "--answers", unsafeAnswers, "--dry-run"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /contains a secret-like field/);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

process.stdout.write("AdventureWorks deployment helpers verified\n");
