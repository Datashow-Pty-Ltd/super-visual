# Agent interface

Super Visual exposes one stable command surface for humans, CI, and coding
agents. Every read/compile command accepts `--json`; errors are written as a
single JSON object when that flag is present.

```bash
npx supervisual check <project> --json
npx supervisual build <project> [--package] --json
npx supervisual verify <project> --json
npx supervisual deploy plan <project> --workspace-id <id> \
  --workspace-name <name> --semantic-model-name <name> --report-name <name> \
  [--connection-id <id> --connection-mode <mode>] \
  [--acceptance-query-file <file>] \
  [--allow-updates] [--output <file>] --json
npx supervisual deploy apply <project> --plan <file> --confirm <plan-id> \
  [--backup <directory>] --json
```

`check` is side-effect free. `build` replaces only the project's configured
output directory. `verify` is read-only. `deploy plan` makes read-only Fabric
calls and writes a local plan. `deploy apply` is the only command that changes
Fabric; it refuses stale workspace identity, blocked actions, missing update
backups, or a mismatched confirmation ID.

Fabric authentication uses the current Azure CLI identity. Agents should never
print, store, or pass the acquired bearer token. Run `az login` interactively
outside the agent workflow when authentication is absent.
