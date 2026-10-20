import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(".");
const required = [
  "LICENSE", "README.md", "CHANGELOG.md", "CONTRIBUTING.md", "SECURITY.md", "CODE_OF_CONDUCT.md",
  "CLAUDE.md", "AGENTS.md", "skills/super-visual/SKILL.md", ".github/workflows/ci.yml", ".github/workflows/release.yml",
];
await Promise.all(required.map((file) => access(path.join(root, file))));

const packageDirectories = ["cli", "compiler", "compliance", "contracts", "fabric", "runtime-powerbi", "semantic"];
const packages = await Promise.all(packageDirectories.map(async (directory) => ({ directory, manifest: JSON.parse(await readFile(path.join(root, "packages", directory, "package.json"), "utf8")) })));
for (const { directory, manifest } of packages) {
  if (manifest.version !== "0.1.0-rc.0") throw new Error(`${directory} version is ${manifest.version}, expected 0.1.0-rc.0`);
  if (manifest.license !== "Apache-2.0") throw new Error(`${directory} must declare Apache-2.0`);
  if (manifest.publishConfig?.access !== "public") throw new Error(`${directory} must declare public publish access`);
  const { stdout } = await run("npm", ["pack", "--dry-run", "--json", "--workspace", manifest.name], { cwd: root, maxBuffer: 20 * 1024 * 1024 });
  const packed = JSON.parse(stdout)[0];
  if (!packed?.files?.length) throw new Error(`${directory} produced an empty npm package`);
  if (directory === "compiler" && !packed.files.some((file) => file.path === "template/visual/src/visual.ts")) throw new Error("compiler package is missing its visual template");
  if (directory === "contracts" && !packed.files.some((file) => file.path.endsWith("supervisual-project.schema.json"))) throw new Error("contracts package is missing project schemas");
}

const { stdout: tracked } = await run("git", ["ls-files"], { cwd: root });
const forbidden = tracked.split("\n").filter((file) => /(^|\/)(dist|node_modules|\.supervisual)(\/|$)|\.pbiviz$/.test(file));
if (forbidden.length) throw new Error(`Generated or private artifacts are tracked:\n${forbidden.join("\n")}`);
process.stdout.write(`Release check passed: ${packages.length} publishable packages, ${required.length} governance artifacts\n`);
