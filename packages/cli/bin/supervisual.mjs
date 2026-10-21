#!/usr/bin/env node
import { main, stopActiveProgress } from "../src/main.mjs";

main().catch((error) => {
  stopActiveProgress();
  const json = process.argv.includes("--json");
  const includeJson = process.argv.includes("--include-json");
  const message = error instanceof Error ? error.message : String(error);
  const summary = error?.summary ?? "Super Visual could not complete the command.";
  const guidance = error?.guidance;
  const details = { ok: false, message: summary, ...(guidance ? { guidance } : {}), error: message };
  if (json) {
    process.stderr.write(`${JSON.stringify(details)}\n`);
  } else {
    process.stderr.write(`\n${summary}\n${guidance ? `${guidance}\n` : ""}\nTechnical details: ${message}\n`);
    if (includeJson) process.stderr.write(`\nError details (JSON):\n${JSON.stringify(details, null, 2)}\n\n`);
  }
  process.exitCode = 1;
});
