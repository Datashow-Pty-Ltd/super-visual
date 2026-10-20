# Hello World live certification

Use a disposable Fabric-capacity workspace and a Fabric connection to a
service-reachable SQL Server, Azure SQL database, or Fabric SQL endpoint. The
Hello World query creates its three rows with `VALUES`; the database only needs
to accept the read-only query.

Copy `source-profile.example.json` to an ignored location and replace the
endpoint and database with the exact values represented by the Fabric
connection:

```bash
mkdir -p .supervisual
cp examples/hello-world/deployment/source-profile.example.json \
  .supervisual/hello-world-source.json
```

Build and verify without changing the checked-in semantic contract:

```bash
npx supervisual check examples/hello-world --json
npx supervisual package examples/hello-world \
  --parameters-file .supervisual/hello-world-source.json --json
npx supervisual verify examples/hello-world --json
```

Discover the immutable target and exact connection before planning:

```bash
npx supervisual deploy discover \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --connections --json
```

Create a create-only plan with unique certification item names:

```bash
npx supervisual deploy plan examples/hello-world \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --semantic-model-name "Super Visual Hello World <run-id>" \
  --report-name "Super Visual Hello World <run-id>" \
  --connection-id <fabric-connection-guid> \
  --connection-mode ShareableCloud \
  --acceptance-query-file examples/hello-world/deployment/acceptance.dax \
  --json
```

Stop here until a human authorizes the exact plan ID and target workspace. After
authorization, apply and then repeat `deploy status` with the returned item IDs.
Only `accepted` is a passing live certification. Open the report in Power BI and
record the browser checks using `docs/certification/live-run-template.md`.
