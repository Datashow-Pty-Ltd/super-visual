# Command reference

All operational commands accept `--json`. Machine-readable mode writes one JSON
value; failures use a non-zero process status.

## Understand inputs

```text
supervisual discover [input]
supervisual inspect [project]
supervisual templates
supervisual adapters
```

`discover` classifies an input without mutating it. `inspect` loads and validates
a Super Visual project and reports pages, datasets, semantic tables, policies,
and generated-output integrity. `templates` and `adapters` report supported and
installed capabilities.

## Migrate source contracts

```text
supervisual migrate [project] [--write] [--backup <directory>]
```

Migration is a dry run unless `--write` is supplied. It inventories every
source contract, refuses unknown future versions, and reports the exact changes.
The first supported migration upgrades a legacy unversioned widget broker to
contract v1. A write is atomic and copies the original source into a recoverable
backup directory under `.supervisual/migrations/` (or `--backup`) before editing.
Generated `dist/` output is never migrated.

## Import a Claude-style dashboard

```text
supervisual import claude-dashboard <input>
  [--project <directory>]
  [--inspect-only]
```

The input must implement Super Visual's `claude-dashboard-bundle.v1` contract.
`--inspect-only` performs the static source, API, dataset, and asset audit
without changing the project. A normal import requires every declared dataset
to exist in the project's widget broker and therefore requires `--project`.
It vendors allowed assets, generates the
compatibility boundary, and writes import provenance.

## Create and compile

```text
supervisual init <directory> [--template blank|hello-world] [--app <path>]
  [--name <id>] [--title <title>]
  [--workspace-id <id>] [--workspace-name <name>]
  [--semantic-model-id <id>]
  [--report-name <name>] [--connection-id <id>]
  [--connection-mode <mode>] [--force]
supervisual check [project]
supervisual compile [project] [--parameters-file <file>]
supervisual build [project] [--package] [--parameters-file <file>]
supervisual package [project] [--parameters-file <file>]
supervisual verify [project]
```

`compile` is an alias for `build`. The dedicated `package` command is equivalent
to `build --package`. Initialization defaults to a clean full-page canvas,
creates a unique visual GUID, and refuses to write into a non-empty directory.
`--app` imports a compatible `reportApplication.tsx`, optional `report/` modules,
and optional `report-design.less`. Fabric target options are written only to the
ignored `.supervisual/target.json` binding. `--force` permits an existing empty
directory; it does not overwrite files. A source profile overrides only the
deployment source `server` and `database`; it must use the versioned
`fabric-sql-source` shape and should be stored under the ignored `.supervisual`
directory. This is an advanced compile/package override, not part of the normal
selected-model workflow.

## Preview against a semantic model

```text
supervisual dev [project]
  [--workspace-id <id>]
  [--workspace-name <name>]
  [--semantic-model-id <id>]
  [--host 127.0.0.1]
  [--port 5173]
  [--open]
  [--timeout <seconds>]

supervisual preview test [project]
  [--workspace-id <id>]
  [--workspace-name <name>]
  [--semantic-model-id <id>]
  [--timeout <seconds>]
  [--browser-timeout <milliseconds>]
```

Both commands are read-only with respect to Fabric. IDs default to the binding
saved by `init`. The semantic-model ID is the ordinary Power BI semantic model
selected for the report. Before serving, the CLI validates the local project,
inspects the exact model, and checks every semantic object required by the
application.

`dev` compiles disposable preview files under `.supervisual/semantic-preview/`,
binds only to a loopback address, and emits its ready URL. The browser never
receives a Fabric bearer token or a general DAX endpoint. It sends only
allow-listed widget selections and application parameters to a nonce-protected local
gateway; the CLI constructs and executes governed DAX. React receives the
same eight broker fields and uses the same row materialiser as the Power BI
visual. In `--json` mode, the ready object is written before the process waits
for Ctrl-C.

`preview test` starts an ephemeral server and a headless Chromium session. It
requires at least one live broker row, rejects browser errors, and exercises a
selection and clear cycle when a report page exposes a selectable widget.
Install the matching browser once with `npx playwright install chromium` if the
local Playwright browser is absent.

## Publish with the saved binding

```text
supervisual publish [project]
  [--workspace-id <id>] [--workspace-name <name>]
  [--semantic-model-id <id>] [--report-name <name>]
  [--connection-id <id>] [--connection-mode <mode>]
  [--parameters-file <file>] [--acceptance-query-file <file>]
  [--allow-updates] [--backup <directory>]
  [--confirm <plan-id> | --pre-authorize] [--plan <file>]
  [--receipt <file>] [--resume <file>] [--timeout <seconds>]
```

`publish` is the normal product workflow. Without `--confirm`, it packages and
verifies the project, discovers the saved workspace, and writes an immutable
deployment plan. In an interactive terminal it displays the target and actions,
then asks the user to type the exact plan ID before applying. Pressing Enter
cancels without changing Fabric. In JSON or another non-interactive environment,
it returns the plan and the caller must make a second authorized call with
`--confirm <plan-id>`. The lower-level `deploy` commands remain available for
inspection, automation, restore, and troubleshooting.

The selected semantic-model ID defaults to the binding saved by `init` and is
the only semantic-model ID in the normal workflow. For the normal single-source
case, `publish` also reuses that model's existing Fabric connection and source
path. `--connection-id`, `--connection-mode`, `--parameters-file`, and
`--acceptance-query-file` are advanced overrides for unusual or explicitly
tested deployments.

`--pre-authorize` is the explicit one-command alternative. It authorizes the
content-derived plan generated during that invocation for the resolved immutable
workspace and applies it without the plan-ID prompt. It does not bypass
packaging, verification, blockers, drift protection, update opt-in, backups,
receipts, refresh, or acceptance checks. Coding agents may pass it only when a
human explicitly requests pre-authorization for that deployment.

## Validate certification evidence

```text
supervisual certify validate <record>
```

The versioned record combines exact commit, plan, workspace, item and connection
identity with CLI binding/refresh/DAX results, six browser acceptance checks,
and hashed receipt and screenshot evidence. Valid JSON is not necessarily a
passing record: unresolved placeholders, non-accepted CLI status, failed browser
checks, missing evidence kinds, and zero hashes produce `status: incomplete`.

## Inspect a live semantic model

```text
supervisual semantic discover
  --workspace-id <id>
  [--workspace-name <name>]
  --semantic-model-id <id>
  [--acceptance-query-file <file>]
  [--timeout <seconds>]

supervisual semantic check [project]
  --workspace-id <id>
  [--workspace-name <name>]
  --semantic-model-id <id>
  [--acceptance-query-file <file>]
  [--timeout <seconds>]
```

Both commands are read-only. `discover` downloads the selected model's TMDL
definition and returns a safe inventory of tables, columns, measures,
hierarchies, relationships, parameter names, culture, and compatibility level.
It excludes expressions, Power Query, parameter values, and data rows. `check`
compares that inventory with the project's semantic and widget-broker contracts
and reports every matched, missing, or ambiguous object. An optional acceptance
query returns row-count and non-null evidence, not the row values.

## Advanced deployment internals

```text
supervisual deploy workspaces
  [--timeout <seconds>]

supervisual deploy discover
  --workspace-id <id>
  [--workspace-name <name>]
  [--connections]
  [--timeout <seconds>]

supervisual deploy status
  --workspace-id <id>
  [--workspace-name <name>]
  [--semantic-model-id <id>]
  [--report-id <id>]
  [--connection-id <id>]
  [--acceptance-query-file <file>]
  [--timeout <seconds>]

supervisual deploy diff [project]
  --workspace-id <id>
  [--workspace-name <name>]
  --semantic-model-name <name>
  --report-name <name>
  [--timeout <seconds>]

supervisual deploy plan [project]
  --workspace-id <id>
  [--workspace-name <name>]
  --semantic-model-name <name>
  --report-name <name>
  [--connection-id <id>]
  [--connection-mode <mode>]
  [--acceptance-query-file <file>]
  [--allow-updates]
  [--output <file>]
  [--timeout <seconds>]

supervisual deploy apply [project]
  --plan <file>
  --confirm <plan-id>
  [--backup <directory>]
  [--receipt <file>]
  [--resume <file>]
  [--timeout <seconds>]

supervisual deploy restore plan
  --backup <directory>
  --workspace-id <id>
  [--workspace-name <name>]
  [--output <file>]
  [--timeout <seconds>]

supervisual deploy restore apply
  --plan <file>
  --confirm <plan-id>
  [--timeout <seconds>]
```

These lower-level commands expose managed deployment artifacts for CI,
troubleshooting, restore, and contributor testing. Normal users should use
`publish` and do not need to provide managed semantic-model names or IDs.

`workspaces`, `discover`, `status`, and `diff` are read-only. `workspaces`
returns only accessible workspace display names, immutable IDs, and capacity
assignment so the operator can select an exact target without guessing. An explicitly supplied acceptance
query is executed but never triggers refresh. `diff` classifies the semantic
model and report as `create`, `update`, or `unchanged`, normalizing an existing
report's semantic-model binding before hashing. Planning captures local definition
hashes and, for updates, remote definition hashes, then writes an immutable
local plan. Applying changes Fabric and requires the exact plan ID. Any local or
remote drift invalidates the plan. Update plans require a backup directory.
Authentication uses the current Azure CLI identity; tokens must not be printed
or stored in project files. Apply reports `published-unverified` with `ok:false`
unless exact connection binding, refresh, and live acceptance all pass.

Apply writes an atomic progress receipt after every verified item. A retry may
use `--resume` with that receipt. Completed items are accepted only when their
identity and deployed definition still match the reviewed plan. Update resumes
also require the original backup manifest; completed updates are never backed up
again from already-modified state.

Update backups contain a versioned manifest, item identity, definition hashes,
and the complete remote definitions captured before any write begins. Restore
planning verifies the backup, target identity, and current remote hashes.
Restore apply requires exact confirmation and refuses drift. It reports
`restored-unverified`; run `deploy status` before treating the restored report as
healthy.
