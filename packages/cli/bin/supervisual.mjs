#!/usr/bin/env node
import { main, stopActiveProgress } from "../src/main.mjs";

main().catch((error) => {
  stopActiveProgress();
  const json = process.argv.includes("--json");
  const message = error instanceof Error ? error.message : String(error);
  const summary = error?.summary ?? "Super Visual could not complete the command.";
  const guidance = error?.guidance;
  if (json) {
    process.stderr.write(`${JSON.stringify({ ok: false, message: summary, ...(guidance ? { guidance } : {}), error: message })}\n`);
  } else {
    process.stderr.write(`\n${summary}\n${guidance ? `${guidance}\n` : ""}\nTechnical details: ${message}\n`);
  }
  process.exitCode = 1;
});
