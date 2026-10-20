import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "skills", "super-visual", "SKILL.md");
const destinations = [
  path.join(root, ".claude", "skills", "super-visual", "SKILL.md"),
  path.join(root, ".codex", "skills", "super-visual", "SKILL.md"),
];
const check = process.argv.includes("--check");
const canonical = await readFile(source, "utf8");

for (const destination of destinations) {
  if (check) {
    let current;
    try {
      current = await readFile(destination, "utf8");
    } catch {
      throw new Error(`${path.relative(root, destination)} is missing; run npm run skills:sync`);
    }
    if (current !== canonical) {
      throw new Error(`${path.relative(root, destination)} differs from the canonical skill; run npm run skills:sync`);
    }
    continue;
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, canonical);
}

process.stdout.write(`${check ? "Verified" : "Synchronized"} Super Visual skill for Claude and Codex\n`);
