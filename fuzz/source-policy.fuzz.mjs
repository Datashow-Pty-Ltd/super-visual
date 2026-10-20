import { validateSourcePolicyText } from "../packages/compliance/src/index.mjs";

export function fuzz(data) {
  const content = data.toString("utf8");
  const result = validateSourcePolicyText(content, { file: "src/reportApplication.tsx" });
  if (!Array.isArray(result)) throw new Error("Source policy validator must return diagnostics");
}
