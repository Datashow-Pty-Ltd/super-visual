import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { gradeAgentTrace } from "../evals/agent-skills/grade.mjs";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const value = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const agent = value("--agent");
const selectedCase = value("--case");
if (!["codex", "claude"].includes(agent)) throw new Error("Use --agent codex or --agent claude");
const evaluations = JSON.parse(await readFile(path.join(root, "evals", "agent-skills", "cases.json"), "utf8"));
const selected = selectedCase ? evaluations.filter((item) => item.id === selectedCase) : evaluations;
if (!selected.length) throw new Error(`Unknown evaluation case ${selectedCase}`);

const temporary = await mkdtemp(path.join(os.tmpdir(), `supervisual-${agent}-eval-`));
const worktree = path.join(temporary, "repo");
const artifacts = path.join(root, ".artifacts", "agent-evals", agent);
await mkdir(artifacts, { recursive: true });

try {
  await run("git", ["worktree", "add", "--detach", worktree, "HEAD"], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
  await run("npm", ["ci", "--ignore-scripts"], { cwd: worktree, timeout: 300_000, maxBuffer: 30 * 1024 * 1024 });
  const results = [];
  for (const evaluation of selected) {
    const command = agent === "codex" ? "codex" : "claude";
    const args = agent === "codex"
      ? ["exec", "--json", "--full-auto", evaluation.prompt]
      : ["-p", evaluation.prompt, "--output-format", "stream-json", "--verbose", "--allowedTools", "Read,Glob,Grep,Bash(npx supervisual *)"];
    let trace = "";
    let stderr = "";
    let exitCode = 0;
    try {
      const completed = await run(command, args, { cwd: worktree, timeout: 600_000, maxBuffer: 50 * 1024 * 1024 });
      trace = completed.stdout;
      stderr = completed.stderr;
    } catch (error) {
      trace = error.stdout ?? "";
      stderr = error.stderr ?? error.message;
      exitCode = error.code ?? 1;
    }
    const tracePath = path.join(artifacts, `${evaluation.id}.jsonl`);
    await writeFile(tracePath, trace);
    const grade = gradeAgentTrace(agent, trace, evaluation);
    results.push({ ...grade, processExitCode: exitCode, tracePath, stderr: stderr.trim().slice(-2000) });
  }
  const report = { agent, pass: results.every((result) => result.pass && result.processExitCode === 0), results };
  const reportPath = path.join(artifacts, "report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ...report, reportPath }, null, 2)}\n`);
  if (!report.pass) process.exitCode = 1;
} finally {
  try { await run("git", ["worktree", "remove", "--force", worktree], { cwd: root, maxBuffer: 10 * 1024 * 1024 }); } catch {}
  await rm(temporary, { recursive: true, force: true });
}
