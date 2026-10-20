import { bindReportToSemanticModel, decodePart, verifyDefinitionParts } from "../packages/fabric/src/index.mjs";

function candidateParts(data) {
  try {
    const value = JSON.parse(data.toString("utf8"));
    if (Array.isArray(value)) return value.slice(0, 64);
  } catch {}
  return [{
    path: data.length && data[0] % 2 ? "definition.pbir" : data.toString("utf8"),
    payloadType: data.length > 1 && data[1] % 2 ? "InlineBase64" : data.toString("base64"),
    payload: data.toString("base64"),
  }];
}

export function fuzz(data) {
  const format = data.length && data[0] % 2 ? "PBIR" : "TMDL";
  const parts = candidateParts(data);
  try {
    verifyDefinitionParts(parts, format);
    for (const part of parts) {
      const decoded = decodePart(part);
      if (!Buffer.isBuffer(decoded)) throw new Error("Definition decoder must return a Buffer");
    }
  } catch (error) {
    if (!(error instanceof Error)) throw error;
  }

  const semanticModelId = data.subarray(0, 128).toString("hex") || "semantic-model";
  const bind = bindReportToSemanticModel(semanticModelId);
  const bound = JSON.parse(bind("definition.pbir", Buffer.from('{"datasetReference":{}}')).toString("utf8"));
  if (bound.datasetReference?.byConnection?.connectionString !== `semanticmodelid=${semanticModelId}`) {
    throw new Error("Report binding must preserve the exact semantic model identity");
  }
}
