# AdventureWorks deployment

## Prerequisites

- Node.js 20.19 or newer.
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
development defaults. Before deployment, set the source parameters to the
server and database represented by the Fabric connection you will bind. A
local-only server is not reachable from Power BI Service without a gateway.

## Plan

Authenticate with Azure CLI, then run a read-only deployment plan using the
workspace ID and the exact intended item names. Do not enable updates for the
first deployment. Review the workspace name, capacity, operations, and plan ID.

```bash
npx supervisual deploy plan examples/adventureworks \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --semantic-model-name "AdventureWorks Super Visual" \
  --report-name "AdventureWorks Product Ledger"
```

If either name already exists, the plan is blocked. Use different names or
repeat the plan with `--allow-updates` only when full-definition replacement is
intended.

## Apply and bind

Apply requires the exact plan file and its plan ID. Updates additionally require
a backup directory; the CLI downloads both current definitions before writing.

```bash
npx supervisual deploy apply examples/adventureworks \
  --plan .supervisual/deploy-plan.json \
  --confirm <plan-id> \
  --backup .supervisual/backups
```

After publication, bind the semantic model to the reviewed Fabric connection,
refresh it, and verify that the report loads all four routes. Check category
selection, route navigation, the product hierarchy, customer flow, and the
territory view. A release is not complete until refresh succeeds and those
interactions are exercised against live AdventureWorks data.
