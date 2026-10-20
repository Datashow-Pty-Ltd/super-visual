# Getting started

Super Visual turns a governed React analytical page into an inspectable Power BI
solution bundle. Node.js 22.12 or newer is required.

## Try the smallest example

From a clone of this repository:

```bash
npm ci
npx supervisual check examples/hello-world
npx supervisual compile examples/hello-world
npx supervisual verify examples/hello-world
npx supervisual package examples/hello-world
```

`compile` writes semantic-model, report, and custom-visual source under the
project's ignored `dist/` directory. `package` additionally creates a `.pbiviz`,
embeds it in the PBIR report resources, refreshes the manifest, and verifies the
result.

## Create a project

```bash
npx supervisual init my-dashboard --template hello-world
npx supervisual inspect my-dashboard
npx supervisual check my-dashboard
npx supervisual package my-dashboard
```

Initialization refuses to write over a non-empty directory. It creates a unique
Power BI visual identity and validates the result before returning success.

Edit `contracts/semantic-model.yaml` for the governed model,
`contracts/widget-broker.json` for data binding, `contracts/page-set.yaml` for
page intent, and the React and Less files under `source/` for presentation. The
compiled application may read data only through `ReportApplicationProps`.

## Understand an existing input

```bash
npx supervisual discover ./candidate --json
npx supervisual inspect ./my-dashboard --json
npx supervisual templates --json
npx supervisual adapters --json
```

JSON mode emits one value and uses a non-zero exit status for failed operations.
The versioned Claude-style adapter is supported. Try the synthetic fixture:

```bash
npx supervisual init /tmp/claude-hello --template hello-world
npx supervisual import claude-dashboard examples/claude-dashboard-bundle \
  --project /tmp/claude-hello --inspect-only --json
npx supervisual import claude-dashboard examples/claude-dashboard-bundle \
  --project /tmp/claude-hello --json
npx supervisual package /tmp/claude-hello
npx supervisual verify /tmp/claude-hello
```

Read [Claude Dashboard migration](./claude-dashboard-migration.md) before using
real source. The format is Super Visual's documented interchange contract, not
an official Anthropic export schema.

## Deploy safely

First compile and verify. Then create a read-only plan using immutable target
identity:

```bash
npx supervisual deploy plan my-dashboard \
  --workspace-id <workspace-guid> \
  --workspace-name <expected-name> \
  --semantic-model-name <model-name> \
  --report-name <report-name> \
  --connection-id <connection-guid> \
  --acceptance-query-file ./acceptance.dax
```

Review the operations, blockers, workspace identity, and plan ID. Applying is an
external mutation and requires explicit human authorization for that exact ID:

```bash
npx supervisual deploy apply my-dashboard \
  --plan my-dashboard/.supervisual/deploy-plan.json \
  --confirm <exact-plan-id> \
  --backup ./fabric-backup
```

Updates are never inferred. The backup is mandatory when a plan contains update
operations. Deployment is not successful until binding, refresh, and the live
acceptance query pass.
