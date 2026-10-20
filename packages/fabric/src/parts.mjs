import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const MAX_DEFINITION_PART_BYTES = 16 * 1024 * 1024;
const MAX_DEFINITION_BYTES = 64 * 1024 * 1024;

async function listFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(root, child));
    else if (entry.name !== ".platform") output.push(child);
  }
  return output.sort();
}

export async function encodeDefinition(directory, transform) {
  return Promise.all((await listFiles(directory)).map(async (file) => {
    const normalized = file.split(path.sep).join("/");
    const original = await readFile(path.join(directory, file));
    const content = transform ? transform(normalized, original) : original;
    return { path: normalized, payload: content.toString("base64"), payloadType: "InlineBase64" };
  }));
}

export function bindReportToSemanticModel(semanticModelId) {
  return (partPath, content) => {
    if (partPath !== "definition.pbir") return content;
    const definition = JSON.parse(content.toString("utf8"));
    definition.datasetReference = { byConnection: { connectionString: `semanticmodelid=${semanticModelId}` } };
    return Buffer.from(`${JSON.stringify(definition, null, 2)}\n`);
  };
}

export const decodePart = (part) => Buffer.from(part.payload, "base64");

export function verifyDefinitionParts(parts, format) {
  if (!Array.isArray(parts) || parts.length === 0) throw new Error(`${format} definition has no parts`);
  const paths = parts.map((part) => part.path);
  if (new Set(paths).size !== paths.length) throw new Error(`${format} definition contains duplicate paths`);
  let totalBytes = 0;
  for (const part of parts) {
    if (part.payloadType !== "InlineBase64" || typeof part.payload !== "string") throw new Error(`${format} definition part ${part.path} must use InlineBase64`);
    const partPath = part.path;
    const normalized = partPath.replaceAll("\\", "/");
    if (!partPath || normalized !== partPath || normalized.startsWith("/") || normalized.split("/").includes("..") || path.posix.normalize(normalized) !== normalized) throw new Error(`Unsafe ${format} definition path: ${partPath}`);
    const bytes = decodePart(part).length;
    if (bytes > MAX_DEFINITION_PART_BYTES) throw new Error(`${format} definition part exceeds ${MAX_DEFINITION_PART_BYTES} bytes: ${partPath}`);
    totalBytes += bytes;
    if (totalBytes > MAX_DEFINITION_BYTES) throw new Error(`${format} definition exceeds ${MAX_DEFINITION_BYTES} bytes`);
  }
  if (format === "TMDL" && !paths.includes("definition.pbism")) throw new Error("TMDL definition is missing definition.pbism");
  if (format === "PBIR" && !paths.includes("definition.pbir")) throw new Error("PBIR definition is missing definition.pbir");
}
