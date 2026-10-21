# AdventureWorks sample

This is the standalone reference consumer for Super Visual. It preserves the
deployed AdventureWorks method: a governed Import semantic model, a
report-specific disconnected broker table, a long-table Power BI DataView, a
cached React runtime, and an editorial multi-route analytical application.

## Before you run it

The dashboard is a live-data example. The repository contains its React source,
semantic-model definition, binding contracts, and deployment helper, but it does
not contain the Microsoft AdventureWorks database or a pre-populated Power BI
semantic model.

Choose the path that matches what you want to test:

| Goal | Required environment |
| --- | --- |
| Inspect, validate, compile, or package the sample | This repository and Node.js only |
| Preview the React application with live data | An existing compatible AdventureWorks Power BI semantic model |
| Reproduce the complete deployed example | AdventureWorksDW2025, a Fabric cloud connection, a Fabric workspace, and the semantic model and report created by the deployment helper |

The complete live stack is built in this order:

```text
AdventureWorksDW2025 database
  -> Fabric cloud connection
  -> Power BI semantic model
  -> Super Visual report
```

If a compatible semantic model already exists, skip database and model
provisioning and supply its ordinary Power BI semantic-model ID to `dev` or
`publish`. Otherwise, follow the
[AdventureWorks build-and-deploy recipe](../../docs/recipes/adventureworks.md).

The sample deliberately keeps project assets outside the reusable packages:

- `contracts/semantic-model.yaml` is the proven AdventureWorks semantic model.
- `contracts/widget-broker.json` binds five application datasets to governed
  columns and measures.
- `contracts/page-set.yaml` declares the four routes, layout, theme, and
  interactions.
- `source/` contains the proven React/Nivo application and its responsive style.
- `supervisual.yaml` is the only compiler entry point.

The five broker datasets do not imply five Power BI DataViews. Visible or stale
dataset IDs are requested in one batch, returned as rows tagged by `WidgetId`,
and partitioned into the React cache. A page may then reuse a dataset: the
Products route renders `product` as both a hierarchy and a ranked table without
a second semantic query. The full mechanism is explained in
[semantic binding](../../docs/semantic-binding.md#how-one-react-page-supports-many-widgets).

Build and validate the inspectable source bundle from the repository root:

```bash
npm install
npm run example:test
```

Run the complete Power BI packaging proof—including generated visual
type-check, `pbiviz package`, custom visual embedding, and manifest refresh:

```bash
npm run example:package
```

To exercise the proven React application against an existing AdventureWorks
Power BI semantic model, run:

```bash
npx supervisual dev examples/adventureworks \
  --workspace-id <workspace-guid> \
  --semantic-model-id <semantic-model-guid> --open
npx supervisual preview test examples/adventureworks \
  --workspace-id <workspace-guid> \
  --semantic-model-id <semantic-model-guid> --json
```

Generated artifacts appear in `examples/adventureworks/dist/` and are ignored
by Git. Follow the runnable
[AdventureWorks build-and-deploy recipe](../../docs/recipes/adventureworks.md)
for the ordered database, semantic-model, report, preview, and acceptance flow.
The lower-level deployment contract remains in [DEPLOYMENT.md](DEPLOYMENT.md).
