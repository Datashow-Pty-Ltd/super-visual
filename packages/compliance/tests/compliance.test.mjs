import { describe, expect, it } from "vitest";
import { validateSourceBundle, validateSourcePolicyText } from "../src/index.mjs";

const valid = {
  contractVersion: 1,
  entry: "src/reportApplication.tsx",
  files: [{
    path: "src/reportApplication.tsx",
    content: `import type { ReportApplicationProps } from "./reportRuntime";
export function ReportApplication({ model, onVisibleDatasetsChange }: ReportApplicationProps) {
  onVisibleDatasetsChange?.(["sales"]); return <div>{model.datasets.sales?.points.length}</div>;
}`,
  }, { path: "style/report-design.less", content: ".report { color: #123; }" }],
};

describe("source compliance", () => {
  it("accepts source inside the governed boundary", () => {
    expect(validateSourceBundle(valid)).toEqual([]);
  });

  it("reports stable rules for unsafe source", () => {
    const bundle = structuredClone(valid);
    bundle.files[0].content += "\nfetch('https://example.com');";
    expect(validateSourceBundle(bundle)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "core/no-network" })]));
  });

  it("exposes the policy scanner independently for untrusted text", () => {
    expect(validateSourcePolicyText("fetch('https://example.com')", { file: "src/reportApplication.tsx" }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "core/no-network" })]));
    expect(validateSourcePolicyText("import React from 'react';", { file: "src/reportApplication.tsx" }))
      .toEqual([]);
  });
});
