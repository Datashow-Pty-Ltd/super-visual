import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export function projectTargetPath(root) {
  return path.join(path.resolve(root), ".supervisual", "target.json");
}

export async function readProjectTarget(root) {
  const file = projectTargetPath(root);
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    if (value?.contractVersion !== 1 || value?.kind !== "supervisual-project-target") throw new Error(`Invalid project target: ${file}`);
    return value;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeProjectTarget(root, update) {
  const current = await readProjectTarget(root);
  const value = {
    contractVersion: 1,
    kind: "supervisual-project-target",
    ...(current ?? {}),
    ...update,
    workspace: { ...(current?.workspace ?? {}), ...(update.workspace ?? {}) },
    semanticModel: { ...(current?.semanticModel ?? {}), ...(update.semanticModel ?? {}) },
    report: { ...(current?.report ?? {}), ...(update.report ?? {}) },
    connection: { ...(current?.connection ?? {}), ...(update.connection ?? {}) },
  };
  for (const key of ["workspace", "semanticModel", "report", "connection"]) {
    value[key] = Object.fromEntries(Object.entries(value[key]).filter(([, item]) => item !== undefined && item !== null && item !== ""));
    if (!Object.keys(value[key]).length) delete value[key];
  }
  const file = projectTargetPath(root);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
  return { file, value };
}

export async function resolveProjectTarget(root, options = {}, { requireSemanticModel = false } = {}) {
  const saved = await readProjectTarget(root);
  const target = {
    workspaceId: options.workspaceId ?? saved?.workspace?.id,
    workspaceName: options.workspaceName ?? saved?.workspace?.name,
    semanticModelId: options.semanticModelId ?? saved?.semanticModel?.id,
    semanticModelName: options.semanticModelName ?? saved?.semanticModel?.name,
    reportId: options.reportId ?? saved?.report?.id,
    reportName: options.reportName ?? saved?.report?.name,
    connectionId: options.connectionId ?? saved?.connection?.id,
    connectionMode: options.connectionMode ?? saved?.connection?.mode ?? "ShareableCloud",
  };
  if (!target.workspaceId) throw new Error("No Fabric workspace is bound. Pass --workspace-id during init or on this command.");
  if (requireSemanticModel && !target.semanticModelId) throw new Error("No deployed semantic adapter is bound. Pass --semantic-model-id during init or after the first publish.");
  return target;
}

export function targetUpdate(options = {}) {
  return {
    workspace: { id: options.workspaceId, name: options.workspaceName },
    semanticModel: { id: options.semanticModelId, name: options.semanticModelName },
    report: { id: options.reportId, name: options.reportName },
    connection: { id: options.connectionId, mode: options.connectionMode },
  };
}
