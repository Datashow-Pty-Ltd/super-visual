import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const run = promisify(execFile);
const destination = path.resolve(process.argv[2] ?? ".artifacts/security/sbom.cdx.json");
const { stdout } = await run("npm", ["sbom", "--omit=dev", "--sbom-format", "cyclonedx"], {
  maxBuffer: 20 * 1024 * 1024,
});
const document = JSON.parse(stdout);
if (document.bomFormat !== "CycloneDX" || !Array.isArray(document.components)) {
  throw new Error("npm returned an invalid CycloneDX SBOM");
}
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(document, null, 2)}\n`);
process.stdout.write(`${destination}\n`);
