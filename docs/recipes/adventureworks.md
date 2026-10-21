# Recipe: build and deploy AdventureWorks

This recipe reproduces the proven AdventureWorks deployment in three ordered
stages: source database, semantic model, and Super Visual report. The helper is
a public, parameterized form of the deployed method; it contains no tenant IDs,
credentials, or capacity controls.

## What this recipe builds

The AdventureWorks dashboard is not a self-contained mock-data application. A
live preview or deployed report needs a compatible Power BI semantic model, and
that model needs an accessible AdventureWorks data source:

```text
AdventureWorksDW2025 database
  -> Fabric cloud connection
  -> Power BI semantic model
  -> Super Visual report
```

Super Visual supplies the semantic-model definition, React application, widget
broker, report wrapper, and guarded deployment process. It does not redistribute
the Microsoft sample database or connection credentials.

Choose the shortest applicable path:

| Starting point | Begin at | What Super Visual does |
| --- | --- | --- |
| You only want to inspect, compile, or package the example | Step 1 | Validates and builds the source without requiring live data |
| You already have a compatible AdventureWorks semantic model | Step 7 | Runs the application against that model; use the normal `publish` workflow if you also want a report |
| You have an existing compatible AdventureWorksDW2025 database | Step 2 with `--reuse-existing`, then Step 3 | Records the source, then creates and deploys the semantic model and report |
| You are starting from an AdventureWorksDW2025 BACPAC | Step 2 | Provisions the complete database, model, and report path |

This recipe is intentionally broader than the normal Super Visual workflow
because it can provision both the sample database and its Power BI semantic
model. For an unrelated existing semantic model, use
[Getting started](../getting-started.md): select that model with
`--semantic-model-id`, preview, and publish.

The proven source is Azure SQL. The semantic model and report are Fabric items.
Fabric capacity must already be running, and capacity start/stop remains an
operator responsibility outside this project.

## What you need

- Node.js 22.12 or newer and `npm ci` completed.
- Azure CLI with the `sql` and `storage` commands available.
- Contributor rights to a chosen Azure resource group.
- An AdventureWorksDW2025 BACPAC that you are permitted to use.
- A Fabric-capacity workspace and rights to create semantic models and reports.
- Permission to create a Fabric cloud connection to the resulting Azure SQL
  endpoint.

Super Visual does not redistribute the Microsoft sample database. Obtain the
official AdventureWorks backup, restore it in SQL Server, and export a BACPAC,
or supply an equivalent existing AdventureWorksDW2025 BACPAC.

## 1. Inspect and validate the sample

```bash
npm ci
npx supervisual inspect examples/adventureworks --json
npx supervisual check examples/adventureworks --json
npm run example:test
```

## 2. Provision the source database

Choose a globally unique, lowercase Azure SQL server name. The exact target
confirmation prevents a typo from provisioning a different server or database.

```bash
az login
az account show --output table

npm run adventureworks:deploy -- database \
  --resource-group <azure-resource-group> \
  --location <azure-region> \
  --server <globally-unique-sql-server-name> \
  --database AdventureWorksDW2025 \
  --bacpac </absolute/path/to/AdventureWorksDW2025.bacpac> \
  --allow-azure-services \
  --confirm-source <globally-unique-sql-server-name>/AdventureWorksDW2025
```

The command uses the deployed method: create a TLS 1.2 Azure SQL server, assign
the signed-in Microsoft Entra user as administrator, pre-scale the database to
Standard S3, stage the BACPAC in temporary storage, import it, and delete that
storage. The generated SQL administrator password is never printed or saved.

`--allow-azure-services` explicitly acknowledges the special Azure SQL
`0.0.0.0` firewall rule needed by the Fabric connection. Review whether that
rule meets your organization's network policy before running the command.

The redacted receipt and compiler source profile are written to:

```text
examples/adventureworks/.supervisual/adventureworks-database-receipt.json
examples/adventureworks/.supervisual/adventureworks-source.json
```

To use an existing Online database without altering it, repeat the command
without `--bacpac` or `--allow-azure-services` and include
`--reuse-existing`. The helper refuses to create a database inside a server it
did not create.

## 3. Create the Fabric source connection

In Fabric **Settings → Manage connections and gateways**, create a cloud SQL
connection for:

```text
<globally-unique-sql-server-name>.database.windows.net
AdventureWorksDW2025
```

Use your approved authentication method and record the connection ID. The
helper deliberately does not accept, create, print, or persist connection
credentials.

## 4. Package and plan the semantic model and report

The `plan` command runs `check`, `package`, `verify`, and read-only Fabric
discovery before writing a Super Visual deployment plan:

```bash
npm run adventureworks:deploy -- plan \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --connection-id <fabric-connection-guid> \
  --semantic-model-name "AdventureWorks Super Visual" \
  --report-name "AdventureWorks Product Ledger"
```

Review
`examples/adventureworks/.supervisual/deploy-plan.json`. Confirm the immutable
workspace, capacity, source connection, item names, action order, blockers, and
plan ID. A same-named item is blocked by default; use `--allow-updates` only when
full-definition replacement and backup are intended.

Stop until a human authorizes the exact plan ID for the exact workspace.

## 5. Apply the authorized plan

```bash
npm run adventureworks:deploy -- apply \
  --plan examples/adventureworks/.supervisual/deploy-plan.json \
  --confirm <authorized-plan-id>
```

The Super Visual CLI creates or updates the semantic model first, verifies its
definition, binds the reviewed connection, waits for refresh, runs
`examples/adventureworks/acceptance.dax`, and only then publishes and verifies
the report. Updates are backed up beneath
`examples/adventureworks/.supervisual/backups/`.

An apply result of `published-unverified` is not success.

## 6. Recheck live status

```bash
npm run adventureworks:deploy -- status \
  --plan examples/adventureworks/.supervisual/deploy-plan.json \
  --receipt examples/adventureworks/.supervisual/deploy-receipt.json
```

Only `status: accepted` proves the exact report/model binding, source connection
binding, completed latest refresh, and non-empty six-measure acceptance result.

## 7. Test the React application against that model

Take the semantic-model ID from the deployment receipt:

```bash
npx supervisual dev examples/adventureworks \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --semantic-model-id <deployed-semantic-model-guid> \
  --open
```

In another terminal, run the bounded semantic-data and interaction smoke test:

```bash
npx supervisual preview test examples/adventureworks \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --semantic-model-id <deployed-semantic-model-guid> \
  --json
```

Check all four routes, category selection, product hierarchy, customer flow,
territory view, responsive layout, keyboard access, and filter propagation.
Record live evidence with
[`docs/certification/live-run-template.md`](../certification/live-run-template.md).

## Cost and cleanup

The script creates billable Azure SQL resources and does not delete them. It
also never resumes or pauses Fabric capacity. Handle both lifecycle decisions
explicitly in the owning Azure/Fabric environment after evidence is captured.
