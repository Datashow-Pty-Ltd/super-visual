# Adapter compatibility and versioning

## React source bundle

- Contract: `report-source-bundle.v1`
- Status: supported
- Target: governed React/TypeScript source using `ReportApplicationProps`
- Runtime network, dynamic code, browser storage, unsafe HTML, direct Power BI
  API use, and preview-fixture imports are rejected.

## Claude-style dashboard

- Contract: `claude-dashboard-bundle.v1`
- Status: supported
- Meaning: a Super Visual source interchange format, not an Anthropic export
  guarantee
- Runtime: `dash.data`, `dash.onData`, `dash.calc`, `dash.format`, scales,
  ticks, paths, SVG helpers, refresh, parameters, links, and the color palette
- Data: long-table broker points are materialized back into row objects declared
  by the intake manifest
- Assets: permitted local files are hashed and embedded at import time
- D3: supplied by the generated visual; dashboard source must not import it
- Loaders: statically rejected because Power BI cannot provide Claude's external
  tool execution context

Compatibility is contract-major based. Additive runtime behavior can ship in a
compatible release; changing manifest meaning, removing an API, or weakening a
safety invariant requires a new contract major. The import provenance records
the contract version, discovered APIs, dataset reads, and asset hashes so a
future migration can be audited.

Run `supervisual adapters --json` for the installed CLI's actual compatibility
surface. Never infer support from a directory's appearance alone.
