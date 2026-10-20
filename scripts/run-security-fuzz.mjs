import { cp, mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedRuns = process.argv[process.argv.indexOf("--runs") + 1];
const runs = requestedRuns && /^\d+$/.test(requestedRuns) ? Number(requestedRuns) : 3000;
if (!Number.isSafeInteger(runs) || runs < 1 || runs > 1_000_000) throw new Error("--runs must be an integer from 1 to 1000000");

const jazzer = path.join(root, "node_modules", "@jazzer.js", "core", "dist", "cli.js");
const artifactRoot = path.join(root, ".artifacts", "fuzz");
const targets = [
  { name: "source-policy", file: "fuzz/source-policy.fuzz.mjs", includes: ["packages/compliance/src/"] },
  { name: "tmdl-inspection", file: "fuzz/tmdl-inspection.fuzz.mjs", includes: ["packages/fabric/src/"] },
  { name: "contracts", file: "fuzz/contracts.fuzz.mjs", includes: ["packages/contracts/src/"] },
];

await mkdir(artifactRoot, { recursive: true });
for (const target of targets) {
  const corpus = path.join(artifactRoot, "corpus", target.name);
  const findings = path.join(artifactRoot, "findings", target.name);
  await rm(corpus, { recursive: true, force: true });
  await rm(findings, { recursive: true, force: true });
  await mkdir(path.dirname(corpus), { recursive: true });
  await cp(path.join(root, "fuzz", "corpus", target.name), corpus, { recursive: true });
  await mkdir(findings, { recursive: true });
  const args = [
    jazzer,
    path.join(root, target.file),
    "--sync",
    ...target.includes.flatMap((include) => ["--includes", include]),
    corpus,
    "--",
    `-runs=${runs}`,
    "-max_len=65536",
    "-timeout=5",
    `-artifact_prefix=${findings}${path.sep}`,
  ];
  process.stdout.write(`Fuzzing ${target.name} for ${runs} runs\n`);
  try {
    const { stdout, stderr } = await run(process.execPath, args, { cwd: root, maxBuffer: 20 * 1024 * 1024 });
    const summary = [...stdout.split("\n"), ...stderr.split("\n")]
      .reverse()
      .find((line) => line.includes("Done "))?.trim();
    process.stdout.write(`Passed ${target.name}${summary ? `: ${summary}` : ""}\n`);
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw new Error(`Fuzz target ${target.name} failed; inspect ${findings}`);
  }
}
process.stdout.write(`Security fuzzing passed: ${targets.length} targets, ${runs} runs each\n`);
