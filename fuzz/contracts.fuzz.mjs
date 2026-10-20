import { validateContract } from "../packages/contracts/src/index.mjs";

const contracts = ["supervisual-project", "report-app", "page-set", "widget-broker", "report-source-bundle", "claude-dashboard-bundle", "live-certification-record"];

export function fuzz(data) {
  let value;
  try {
    value = JSON.parse(data.toString("utf8"));
  } catch {
    value = { contractVersion: data.length ? data[0] : 0, fuzz: data.toString("utf8") };
  }
  for (const contract of contracts) {
    const result = validateContract(contract, value);
    if (typeof result.ok !== "boolean" || !Array.isArray(result.errors)) throw new Error(`${contract} validator returned an invalid result`);
  }
}
