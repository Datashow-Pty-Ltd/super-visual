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
planned capabilities without implying that planned inputs can be compiled.

## Create and compile

```text
supervisual init <directory> [--template hello-world] [--name <id>]
  [--title <title>] [--force]
supervisual check [project]
supervisual compile [project]
supervisual build [project] [--package]
supervisual package [project]
supervisual verify [project]
```

`compile` is an alias for `build`. The dedicated `package` command is equivalent
to `build --package`. Initialization creates a unique visual GUID and refuses to
write into a non-empty directory. `--force` permits an existing empty directory;
it does not overwrite files.

## Deploy to Fabric

```text
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

Planning reads Fabric state and writes an immutable local plan. Applying changes
Fabric and requires the exact plan ID. Update plans require a backup directory.
Authentication uses the current Azure CLI identity; tokens must not be printed
or stored in project files.
