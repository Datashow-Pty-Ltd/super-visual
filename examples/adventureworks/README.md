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

Generated artifacts appear in `examples/adventureworks/dist/` and are ignored
by Git. See [DEPLOYMENT.md](DEPLOYMENT.md) before targeting Fabric.
