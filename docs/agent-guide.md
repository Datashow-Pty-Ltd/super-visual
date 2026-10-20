# Agent interface

Super Visual exposes one stable command surface for humans, CI, and coding
agents. Every read/compile command accepts `--json`; errors are written as a
single JSON object when that flag is present.

```bash
npx supervisual check <project> --json
npx supervisual build <project> [--package] --json
npx supervisual verify <project> --json
npx supervisual certify validate <record> --json
npx supervisual semantic discover --workspace-id <id> \
  --semantic-model-id <id> --json
npx supervisual semantic check <project> --workspace-id <id> \
  --semantic-model-id <id> --json
npx supervisual deploy discover --workspace-id <id> [--connections] --json
npx supervisual deploy status --workspace-id <id> \
  [--semantic-model-id <id> --report-id <id> --connection-id <id>] \
  [--acceptance-query-file <file>] --json
npx supervisual deploy diff <project> --workspace-id <id> \
  --semantic-model-name <name> --report-name <name> --json
npx supervisual deploy plan <project> --workspace-id <id> \
  --workspace-name <name> --semantic-model-name <name> --report-name <name> \
  [--connection-id <id> --connection-mode <mode>] \
  [--acceptance-query-file <file>] \
  [--allow-updates] [--output <file>] --json
npx supervisual deploy apply <project> --plan <file> --confirm <plan-id> \
  [--backup <directory>] [--receipt <file> | --resume <file>] --json
npx supervisual deploy restore plan --backup <directory> \
  --workspace-id <id> [--workspace-name <name>] --json
npx supervisual deploy restore apply --plan <file> --confirm <plan-id> --json
```

`check` is side-effect free. `build` replaces only the project's configured
output directory. `verify` and both `semantic` commands are read-only. Semantic
inspection returns metadata, not source expressions or business data. `deploy
plan` makes read-only Fabric calls and writes a local plan. `deploy apply` is the only command that changes
Fabric; it refuses stale workspace identity, blocked actions, missing update
backups, changed local/remote definition hashes, or a mismatched confirmation
ID. `deploy apply` returning `published-unverified` is not a successful release.
Resume only from the receipt written by the interrupted exact plan; do not
construct or edit a receipt manually.
Restore has the same authorization boundary and returns `restored-unverified`
until the normal status checks pass.

Fabric authentication uses the current Azure CLI identity. Agents should never
print, store, or pass the acquired bearer token. Run `az login` interactively
outside the agent workflow when authentication is absent.
