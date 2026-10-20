import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(".");
const cli = path.join(root, "packages", "cli", "bin", "supervisual.mjs");
const project = path.join(root, "examples", "hello-world");

for (const command of [["check", project], [process.argv.includes("--package") ? "package" : "compile", project], ["verify", project]]) {
  const { stdout } = await run(process.execPath, [cli, ...command, "--json"], { cwd: root, maxBuffer: 30 * 1024 * 1024 });
  const result = JSON.parse(stdout);
  if (!result.ok) throw new Error(`Hello World ${command[0]} failed: ${stdout}`);
}

process.stdout.write(`Hello World verified${process.argv.includes("--package") ? " and packaged" : ""}\n`);
