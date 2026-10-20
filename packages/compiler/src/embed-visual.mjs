import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";

export async function embedVisualPackage(pbivizPath, reportDirectory) {
  const archive = unzipSync(new Uint8Array(await readFile(pbivizPath)));
  const packageBytes = archive["package.json"];
  if (!packageBytes) throw new Error("The .pbiviz archive is missing package.json");
  const packageManifest = JSON.parse(Buffer.from(packageBytes).toString("utf8"));
  const guid = packageManifest.visual?.guid;
  const resource = packageManifest.resources?.[0]?.file;
  if (!guid || !resource || !archive[resource]) throw new Error("The .pbiviz archive does not identify its visual resource");
  const target = path.join(reportDirectory, "CustomVisuals", guid);
  await mkdir(path.join(target, "resources"), { recursive: true });
  await writeFile(path.join(target, "package.json"), Buffer.from(packageBytes));
  const resourceName = path.basename(resource);
  await writeFile(path.join(target, "resources", resourceName), Buffer.from(archive[resource]));
  const reportPath = path.join(reportDirectory, "definition", "report.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  report.resourcePackages = (report.resourcePackages ?? []).filter((item) => item.name !== guid);
  report.resourcePackages.push({ name: guid, type: "CustomVisual", items: [{ name: `resources/${resourceName}`, path: resourceName, type: "CustomVisualMetadata" }] });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { guid, resourceName, reportDirectory };
}
