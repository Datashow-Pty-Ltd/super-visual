---
name: super-visual
description: Discover, initialize, inspect, validate, semantically preview, compile, package, verify, or safely deploy Super Visual React-to-Power-BI projects. Use for projects containing supervisual.yaml and for evaluating dashboard source for supported Super Visual adapters; do not use for ordinary React applications or unrelated Power BI reports.
---

# Super Visual

Use the `supervisual` CLI as the stable interface. Treat `supervisual.yaml` as
the project entry point and `dist/` as disposable generated output. Do not edit
generated output or move report-specific behavior into reusable runtime code.

## Route the request

- Unknown input: run `npx supervisual discover <input> --json`.
- Existing project: run `npx supervisual inspect <project> --json` before making
  structural changes.
- Older project: run `npx supervisual migrate <project> --json`, review the
  dry-run changes, then use `--write` only for a registered migration. Preserve
  the reported backup directory.
- New project: run `npx supervisual init <directory> --json` for the clean
  full-page scaffold, or add `--template hello-world` for a searchable
  semantic-model connectivity proof.
  When the user provides compatible React source, pass its directory with
  `--app`. Save only explicitly selected workspace and semantic-adapter IDs.
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

To test data and interactions locally, use `npx supervisual dev <project>
--json`, targeting the deployed report-specific semantic adapter saved in the
project binding. Supply `--workspace-id` and `--semantic-model-id` when no saved
binding exists. This is read-only in Fabric and may write only
ignored preview output under `.supervisual/`. Keep the process running after its
ready JSON until the user is finished. For a bounded check, run `npx
supervisual preview test <project>` with the same immutable IDs. Do not treat an
offline fixture as semantic acceptance, and do not substitute the reusable base
model: the target must contain the generated `Widget Axis` broker.

For a permitted Claude-style bundle, import only after inspection succeeds and
the target widget broker contains every declared dataset. The adapter must
vendor assets and write provenance; do not copy an authenticated Claude payload
or private brand/data assets into the public project.

Application code may consume only `ReportApplicationProps` and the broker data
model. It must not access the network, execute dynamic code, use browser storage,
inject unsafe HTML, import Power BI host APIs, or import preview fixtures. Bind
data through the semantic and widget-broker contracts.

The semantic preview browser may receive only broker rows through the CLI's
loopback gateway, never bearer tokens or arbitrary DAX.

## Fabric safety boundary

Use `semantic discover` to inspect a selected live model without returning DAX,
Power Query, parameter values, or business rows. Use `semantic check` to compare
that inventory with a project's semantic and broker contracts. Both commands are
read-only; an optional acceptance query may return only its row-count evidence.

Deployment uses plan/apply. Planning is read-only and requires an immutable
workspace ID. Run `deploy workspaces` when the target ID is unknown; it is a
read-only inventory and never authorizes choosing a workspace on the user's
behalf. Run `deploy discover` first, use `deploy diff` when comparing a
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

`supervisual publish` is the high-level package, verify, plan, and apply path.
In an interactive human terminal it shows the exact workspace, operations, and
plan ID and requires that ID at the confirmation prompt. In JSON or agent use,
run it without `--confirm`, report the plan, and apply only after the human
explicitly authorizes that exact plan ID and workspace. Pass that authorization
as `--confirm <plan-id>`. All update, backup, receipt, drift, status, and
acceptance rules above still apply.

After live CLI status and browser acceptance are recorded, run `certify
validate <record> --json`. Do not describe a run as certified unless the command
returns `status: certified`; placeholder hashes and incomplete browser evidence
must fail.

Read `docs/getting-started.md` for the end-to-end workflow and
`docs/claude-dashboard-migration.md` for intake. Read
`docs/deployment-safety.md` before live Fabric work.
