import { inspectTmdlParts } from "../packages/fabric/src/semantic-inspection.mjs";

const part = (partPath, value) => ({ path: partPath, payloadType: "InlineBase64", payload: Buffer.from(value).toString("base64") });

export function fuzz(data) {
  const result = inspectTmdlParts([
    part("definition.pbism", '{"version":"4.0"}'),
    part("definition/tables/Fuzz.tmdl", data),
  ]);
  if (!Array.isArray(result.tables) || !Array.isArray(result.relationships) || !Array.isArray(result.parameters)) {
    throw new Error("TMDL inspection must return bounded inventory collections");
  }
}
