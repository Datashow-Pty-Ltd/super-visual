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
supervisual init <directory> [--template hello-world] [--name <id>]
  [--title <title>] [--force]
supervisual check [project]
supervisual compile [project] [--parameters-file <file>]
supervisual build [project] [--package] [--parameters-file <file>]
supervisual package [project] [--parameters-file <file>]
supervisual verify [project]
```

`compile` is an alias for `build`. The dedicated `package` command is equivalent
to `build --package`. Initialization creates a unique visual GUID and refuses to
write into a non-empty directory. `--force` permits an existing empty directory;
it does not overwrite files. A source profile overrides only the generated
semantic model's `server` and `database`; it must use the versioned
`fabric-sql-source` shape and should be stored under the ignored `.supervisual`
directory.

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

## Deploy to Fabric

```text
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
  [--timeout <seconds>]
```

`discover` and `status` are read-only; an explicitly supplied acceptance query
is executed but never triggers refresh. Planning captures local definition
hashes and, for updates, remote definition hashes, then writes an immutable
local plan. Applying changes Fabric and requires the exact plan ID. Any local or
remote drift invalidates the plan. Update plans require a backup directory.
Authentication uses the current Azure CLI identity; tokens must not be printed
or stored in project files. Apply reports `published-unverified` with `ok:false`
unless exact connection binding, refresh, and live acceptance all pass.
