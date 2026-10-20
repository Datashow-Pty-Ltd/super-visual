---
name: super-visual
description: Discover, initialize, inspect, validate, compile, package, verify, or safely deploy Super Visual React-to-Power-BI projects. Use for projects containing supervisual.yaml and for evaluating dashboard source for supported Super Visual adapters; do not use for ordinary React applications or unrelated Power BI reports.
---

# Super Visual

Use the `supervisual` CLI as the stable interface. Treat `supervisual.yaml` as
the project entry point and `dist/` as disposable generated output. Do not edit
generated output or move report-specific behavior into reusable runtime code.

## Route the request

- Unknown input: run `npx supervisual discover <input> --json`.
- Existing project: run `npx supervisual inspect <project> --json` before making
  structural changes.
- New project: list templates, then run `npx supervisual init <directory>
  --template hello-world --json` unless the user chose another supported template.
- Imported dashboard: list adapters. Do not improvise an importer when the CLI
  reports an adapter as planned or unsupported.

## Local workflow

After changing project source or contracts:

1. Run `npx supervisual check <project> --json` and resolve every diagnostic.
2. Run `npx supervisual compile <project> --json` while iterating.
3. Run `npx supervisual package <project> --json` when a deployable `.pbiviz`
   and embedded PBIR resource are required.
4. Run `npx supervisual verify <project> --json` before handoff or deployment.

Application code may consume only `ReportApplicationProps` and the broker data
model. It must not access the network, execute dynamic code, use browser storage,
inject unsafe HTML, import Power BI host APIs, or import preview fixtures. Bind
data through the semantic and widget-broker contracts.

## Fabric safety boundary

Deployment uses plan/apply. Planning is read-only and requires an immutable
workspace ID. Report the target identity, operations, blockers, and exact plan
ID. Apply only after the human explicitly authorizes that exact plan ID. Never
infer `--allow-updates`; updates replace complete definitions and require a
backup directory. Do not claim deployment success until binding, refresh, and
the configured live acceptance query pass.

Read `docs/getting-started.md` for the end-to-end workflow and
`docs/deployment-safety.md` before live Fabric work.
