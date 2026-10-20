#!/usr/bin/env node
import { main } from "../src/main.mjs";

main().catch((error) => {
  const json = process.argv.includes("--json");
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${json ? JSON.stringify({ ok: false, error: message }) : `supervisual: ${message}`}\n`);
  process.exitCode = 1;
});
