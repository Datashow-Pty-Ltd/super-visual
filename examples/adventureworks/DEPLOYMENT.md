# AdventureWorks deployment

For the complete source-database-through-report walkthrough, use the runnable
[AdventureWorks recipe](../../docs/recipes/adventureworks.md). The helper command
is `npm run adventureworks:deploy -- --help`. This file documents the lower-level
Super Visual package and deployment contract.

## Prerequisites

- Node.js 22.12 or newer.
- Power BI custom visuals enabled for the target tenant.
- A Fabric-capacity workspace whose immutable ID you know.
- An accessible AdventureWorksDW source or gateway connection.
- Permission to create semantic models and reports in that workspace.

## Build

From the repository root:

```bash
npm ci
npm run example:package
```

This compiles the semantic model and adapter, generates and packages the visual,
embeds the `.pbiviz` resource in PBIR, and refreshes the SHA-256 manifest. Do
not edit anything under `dist/`; change a contract or source asset and rebuild.

## Configure the source

The sample semantic contract uses `localhost` and `AdventureWorksDW2025` only as
development defaults. A local-only server is not reachable from Power BI
Service without a gateway. Copy the example profile into the ignored
`.supervisual` directory and set the exact server and database represented by
the Fabric connection you will bind:

```bash
mkdir -p .supervisual
cp examples/adventureworks/deployment/source-profile.example.json \
  .supervisual/adventureworks-source.json
```

Build the tenant-specific generated bundle without modifying the checked-in
semantic contract:

```bash
npx supervisual package examples/adventureworks \
  --parameters-file .supervisual/adventureworks-source.json --json
npx supervisual verify examples/adventureworks --json
```

## Plan

Authenticate with Azure CLI, then run a read-only deployment plan using the
workspace ID and the exact intended item names. Do not enable updates for the
first deployment. Review the workspace name, capacity, operations, and plan ID.

First confirm the immutable workspace and available connection IDs:

```bash
npx supervisual deploy discover \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --connections
```

```bash
npx supervisual deploy plan examples/adventureworks \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --semantic-model-name "AdventureWorks Super Visual" \
  --report-name "AdventureWorks Product Ledger" \
  --connection-id <fabric-connection-guid> \
  --connection-mode ShareableCloud \
  --acceptance-query-file examples/adventureworks/acceptance.dax
```

If either name already exists, the plan is blocked. Use different names or
repeat the plan with `--allow-updates` only when full-definition replacement is
intended.

## Apply and bind

Apply requires the exact plan file and its plan ID. Updates additionally require
a backup directory; the CLI downloads both current definitions before writing.

```bash
npx supervisual deploy apply examples/adventureworks \
  --plan examples/adventureworks/.supervisual/deploy-plan.json \
  --confirm <plan-id> \
  --backup .supervisual/backups
```

Apply binds the exact reviewed connection, waits for refresh, and executes the
acceptance DAX stored in the plan. Then verify that the report loads all four
routes. Check category selection, route navigation, the product hierarchy,
customer flow, and the territory view. A release is not complete until those
interactions are exercised against live AdventureWorks data.

The apply result contains the deployed semantic-model and report IDs. Recheck
the persisted service state without triggering another refresh:

```bash
npx supervisual deploy status \
  --workspace-id <workspace-guid> \
  --semantic-model-id <deployed-semantic-model-id> \
  --report-id <deployed-report-id> \
  --connection-id <fabric-connection-guid> \
  --acceptance-query-file examples/adventureworks/acceptance.dax
```

Only `status: accepted` proves exact report binding, exact connection binding,
a completed latest refresh, and a non-empty/non-null acceptance result.

Record the item IDs, plan ID, source-profile identifier, CLI acceptance, and
browser interaction checks using `docs/certification/live-run-template.md`.
