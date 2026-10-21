import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(".");
const rootManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const required = [
  "LICENSE", "README.md", "CHANGELOG.md", "CONTRIBUTING.md", "SECURITY.md", "CODE_OF_CONDUCT.md",
  "CLAUDE.md", "AGENTS.md", "skills/super-visual/SKILL.md", ".claude/skills/super-visual/SKILL.md", ".codex/skills/super-visual/SKILL.md",
  "docs/certification/security-scan-proof.md", "docs/certification/openssf-best-practices-readiness.md",
  ".github/workflows/ci.yml", ".github/workflows/release.yml", ".github/workflows/codeql.yml",
  ".github/workflows/dependency-review.yml", ".github/workflows/scorecard.yml", ".github/dependabot.yml",
];
await Promise.all(required.map((file) => access(path.join(root, file))));

const releaseWorkflow = await readFile(path.join(root, ".github/workflows/release.yml"), "utf8");
const browserInstall = releaseWorkflow.indexOf("playwright install --with-deps chromium");
const releaseGate = releaseWorkflow.indexOf("npm run stage:9");
if (browserInstall === -1 || releaseGate === -1 || browserInstall > releaseGate) {
  throw new Error("Release workflow must install Playwright Chromium before running the stage:9 browser tests");
}
if (!releaseWorkflow.includes("workflow_dispatch:")) {
  throw new Error("Release workflow must retain its non-publishing manual verification trigger");
}
const tagOnlyReleaseSteps = releaseWorkflow.match(/if: startsWith\(github\.ref, 'refs\/tags\/v'\)/g) ?? [];
if (tagOnlyReleaseSteps.length < 2) {
  throw new Error("Artifact attestation and GitHub prerelease publication must remain tag-only");
}

const packageDirectories = ["adapter-claude-dashboard", "cli", "compiler", "compliance", "contracts", "fabric", "runtime-powerbi", "semantic"];
const packages = await Promise.all(packageDirectories.map(async (directory) => ({ directory, manifest: JSON.parse(await readFile(path.join(root, "packages", directory, "package.json"), "utf8")) })));
for (const { directory, manifest } of packages) {
  if (manifest.version !== rootManifest.version) throw new Error(`${directory} version is ${manifest.version}, expected ${rootManifest.version}`);
  if (manifest.license !== "Apache-2.0") throw new Error(`${directory} must declare Apache-2.0`);
  if (manifest.publishConfig?.access !== "public") throw new Error(`${directory} must declare public publish access`);
  const { stdout } = await run("npm", ["pack", "--dry-run", "--json", "--workspace", manifest.name], { cwd: root, maxBuffer: 20 * 1024 * 1024 });
  const packed = JSON.parse(stdout)[0];
  if (!packed?.files?.length) throw new Error(`${directory} produced an empty npm package`);
  if (directory === "compiler" && !packed.files.some((file) => file.path === "template/visual/src/visual.ts")) throw new Error("compiler package is missing its visual template");
  if (directory === "compiler" && manifest.dependencies?.["@datashow/super-visual-runtime-powerbi"] !== rootManifest.version) throw new Error("compiler package must depend on the matching Power BI runtime package");
  if (directory === "contracts" && !packed.files.some((file) => file.path.endsWith("supervisual-project.schema.json"))) throw new Error("contracts package is missing project schemas");
  if (directory === "cli" && !packed.files.some((file) => file.path === "templates/hello-world/supervisual.yaml")) throw new Error("CLI package is missing the hello-world template");
}

const { stdout: tracked } = await run("git", ["ls-files"], { cwd: root });
const forbidden = tracked.split("\n").filter((file) => /(^|\/)(dist|node_modules|\.supervisual)(\/|$)|\.pbiviz$/.test(file));
if (forbidden.length) throw new Error(`Generated or private artifacts are tracked:\n${forbidden.join("\n")}`);
process.stdout.write(`Release check passed: ${packages.length} publishable packages, ${required.length} governance artifacts\n`);
