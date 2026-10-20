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
- Imported dashboard: list adapters. For `claude-dashboard-bundle.v1`, run
  `npx supervisual import claude-dashboard <input> --project <project>
  --inspect-only --json` before importing. Do not improvise an importer for an
  unsupported input.

## Local workflow

After changing project source or contracts:

1. Run `npx supervisual check <project> --json` and resolve every diagnostic.
2. Run `npx supervisual compile <project> --json` while iterating.
3. Run `npx supervisual package <project> --json` when a deployable `.pbiviz`
   and embedded PBIR resource are required.
4. Run `npx supervisual verify <project> --json` before handoff or deployment.

For a permitted Claude-style bundle, import only after inspection succeeds and
the target widget broker contains every declared dataset. The adapter must
vendor assets and write provenance; do not copy an authenticated Claude payload
or private brand/data assets into the public project.

Application code may consume only `ReportApplicationProps` and the broker data
model. It must not access the network, execute dynamic code, use browser storage,
inject unsafe HTML, import Power BI host APIs, or import preview fixtures. Bind
data through the semantic and widget-broker contracts.

## Fabric safety boundary

Use `semantic discover` to inspect a selected live model without returning DAX,
Power Query, parameter values, or business rows. Use `semantic check` to compare
that inventory with a project's semantic and broker contracts. Both commands are
read-only; an optional acceptance query may return only its row-count evidence.

Deployment uses plan/apply. Planning is read-only and requires an immutable
workspace ID. Run `deploy discover` first, use `deploy diff` when comparing a
built bundle with same-named remote items, and run `deploy status` after apply.
Report the target identity, operations, blockers, and exact plan ID. Apply only
after the human explicitly authorizes that exact plan ID and target workspace.
Never infer `--allow-updates`; updates replace complete definitions and require a
backup directory. An interrupted apply may resume only from its matching
deployment receipt, with the same plan, confirmation, workspace, and original
backup directory. Restore also uses plan/apply: inspect the backup manifest,
report the exact restore plan ID and workspace, and require human authorization
before `deploy restore apply`. A restore is `restored-unverified` until the
normal live status checks pass. Do not claim deployment success until status confirms exact
report and connection binding, refresh, and the configured live acceptance
query. `published-unverified` is not success.

After live CLI status and browser acceptance are recorded, run `certify
validate <record> --json`. Do not describe a run as certified unless the command
returns `status: certified`; placeholder hashes and incomplete browser evidence
must fail.

Read `docs/getting-started.md` for the end-to-end workflow and
`docs/claude-dashboard-migration.md` for intake. Read
`docs/deployment-safety.md` before live Fabric work.
