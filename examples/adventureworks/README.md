# AdventureWorks sample

This is the standalone reference consumer for Super Visual. It preserves the
deployed AdventureWorks method: a governed Import semantic model, a
report-specific disconnected broker table, a long-table Power BI DataView, a
cached React runtime, and an editorial multi-route analytical application.

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

To exercise the proven React application against the deployed AdventureWorks
Power BI semantic model before packaging, run:

```bash
npx supervisual dev examples/adventureworks \
  --workspace-id <workspace-guid> \
  --semantic-model-id <semantic-model-guid> --open
npx supervisual preview test examples/adventureworks \
  --workspace-id <workspace-guid> \
  --semantic-model-id <semantic-model-guid> --json
```

Generated artifacts appear in `examples/adventureworks/dist/` and are ignored
by Git. Follow the runnable [AdventureWorks recipe](../../docs/recipes/adventureworks.md)
for the ordered database, semantic-model, report, preview, and acceptance flow.
The lower-level deployment contract remains in [DEPLOYMENT.md](DEPLOYMENT.md).
