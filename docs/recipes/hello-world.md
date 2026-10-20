# Recipe: deploy Hello World

This recipe deploys the smallest complete Super Visual project, proves its live
semantic binding, and shows the local React development loop. Run all commands
from the repository root.

## What you need

- Node.js 22.12 or newer and `npm ci` completed.
- Azure CLI signed in to the tenant used by Fabric.
- A Fabric-capacity workspace whose immutable ID and display name you know.
- Permission to create semantic models and reports in that workspace.
- A Fabric cloud connection to a service-reachable SQL endpoint.

Hello World creates its sample rows with a SQL `VALUES` expression, so
the connected database does not need sample tables. It must still be a valid,
reachable connection that can execute the generated query.

## 1. Validate the project

```bash
npm ci
npx supervisual inspect examples/hello-world --json
npx supervisual check examples/hello-world --json
npx supervisual compile examples/hello-world --json
```

The compile output is disposable. Change files under `source/` or `contracts/`
and rebuild instead of editing `dist/`.

## 2. Configure the deployment source

```bash
mkdir -p .supervisual
cp examples/hello-world/deployment/source-profile.example.json \
  .supervisual/hello-world-source.json
```

Edit `.supervisual/hello-world-source.json` so its server and database exactly
match the Fabric connection. This ignored file must not contain credentials.

```bash
npx supervisual package examples/hello-world \
  --parameters-file .supervisual/hello-world-source.json \
  --json
npx supervisual verify examples/hello-world --json
```

## 3. Discover the exact workspace and connection

```bash
npx supervisual deploy discover \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --connections \
  --json
```

Confirm that the response names the intended capacity-backed workspace and
lists the connection ID for the source profile.

## 4. Create a deployment plan

Use unique item names for the first run:

```bash
npx supervisual deploy plan examples/hello-world \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --semantic-model-name "Super Visual Hello World <run-id>" \
  --report-name "Super Visual Hello World <run-id>" \
  --connection-id <fabric-connection-guid> \
  --connection-mode ShareableCloud \
  --acceptance-query-file examples/hello-world/deployment/acceptance.dax \
  --output .supervisual/hello-world-plan.json \
  --json
```

Review the workspace ID, item names, create actions, blockers, and plan ID. Stop
until a human authorizes that exact plan ID for that exact workspace.

## 5. Apply the authorized plan

```bash
npx supervisual deploy apply examples/hello-world \
  --plan .supervisual/hello-world-plan.json \
  --confirm <authorized-plan-id> \
  --receipt .supervisual/hello-world-receipt.json \
  --backup .supervisual/backups \
  --json
```

The CLI creates the semantic adapter first, binds its source connection,
refreshes and tests it, and then publishes the PBIR report bound to that exact
model. Save the returned semantic-model and report IDs.

## 6. Prove the persisted deployment

```bash
npx supervisual deploy status \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --semantic-model-id <deployed-semantic-model-guid> \
  --report-id <deployed-report-guid> \
  --connection-id <fabric-connection-guid> \
  --acceptance-query-file examples/hello-world/deployment/acceptance.dax \
  --json
```

Do not call the deployment complete unless the status is `accepted`.

## 7. Test the local React page with live data

The first deployment created the semantic adapter needed for a real local test.
Start the local page against it:

```bash
npx supervisual dev examples/hello-world \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --semantic-model-id <deployed-semantic-model-guid> \
  --open
```

In another terminal:

```bash
npx supervisual preview test examples/hello-world \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --semantic-model-id <deployed-semantic-model-guid> \
  --json
```

Edit `examples/hello-world/source/`, rerun the bounded preview test, then package
again. A later deployment to the same names requires a fresh plan with
`--allow-updates`, explicit authorization of its new plan ID, and retained
backups. Never reuse the first plan.

Finally, open the report in Power BI Service and verify rendering, labels,
selection behavior, and accessibility with live rows.
