# Public contracts

## Project input

A project root contains `supervisual.yaml`, React source, local assets, and the
referenced semantic and interaction contracts. Paths resolve from the project
root and may not escape it.

## Build outputs

A successful build emits:

```text
dist/
  <visual>.pbiviz
  <name>.SemanticModel/
  <name>.Report/
  build-manifest.json
  compliance-report.json
  provenance.json
  sbom.json
```

The build manifest records the compiler version, contract versions, input and
output hashes, target API version, and validation status.

## Agent interface

Every command supports JSON output. A successful result has `ok: true`, a
command name, artifact references, and diagnostics. A failed result has
`ok: false`, stable diagnostic codes, locations where known, and a nonzero exit
status. Agents must use the same commands and schemas as human operators.

## Compatibility

Contract versions are integers. Additive optional fields retain the version.
Removing a field, changing its meaning, or making an optional field required
increments the version and requires a migration.
