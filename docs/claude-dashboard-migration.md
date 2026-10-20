# Claude Dashboard migration

Super Visual supports a documented intake format named
`claude-dashboard-bundle.v1`. It preserves a Claude-style dashboard's HTML,
CSS, D3 rendering code, `dash.*` interactions, and local assets while replacing
its data boundary with the governed Super Visual broker.

This is a Super Visual interchange contract. Claude Dashboards is a beta
product and Anthropic does not document a stable exported dashboard file
schema, so the adapter does not claim that arbitrary Claude internals are a
public standard.

## 1. Create the bundle

Place these files in one directory:

```text
claude-dashboard.json
dashboard.html
dashboard.css
dashboard.js
assets/
```

The manifest declares source entry files, routes, dashboard dataset shapes,
optional parameter-to-semantic-model targets, and every local asset. See the
complete redistributable fixture in `examples/claude-dashboard-bundle` and the
JSON Schema in
`packages/contracts/schemas/claude-dashboard-bundle.schema.json`.

`dashboard.js` is a mount-function body. It receives `root`, `dash`, and `d3`
and may return a cleanup function. Dataset identifiers passed to `dash.data`
must be string literals so bindings can be proven statically.

## 2. Inspect without writing

```bash
npx supervisual discover ./my-export --json
npx supervisual import claude-dashboard ./my-export --inspect-only --json
```

Inspection parses the manifest and JavaScript, reports `dash.*` calls and data
reads, resolves route references, and audits HTML, CSS, and assets. It does not
modify the target project.

## 3. Bind to a governed project

Initialize or prepare a project whose widget broker contains every declared
dataset ID, then import:

```bash
npx supervisual init ./my-project --template hello-world
# Replace the semantic model and widget broker with the governed definitions.
npx supervisual import claude-dashboard ./my-export --project ./my-project --json
```

The importer refuses an undeclared dataset or a dataset absent from the target
broker. A successful import writes normalized report source plus
`contracts/claude-import.provenance.json`. Local PNG, JPEG, GIF, WebP, SVG,
WOFF, and WOFF2 assets are size-limited, hashed, and embedded as data URLs; no
runtime asset request remains.

## 4. Compile and prove the result

```bash
npx supervisual check ./my-project --json
npx supervisual compile ./my-project --json
npx supervisual package ./my-project --json
npx supervisual verify ./my-project --json
```

The generated application uses the extracted compatibility runtime and row
materializer proven by the deployed AdventureWorks implementation. It does not
contain AdventureWorks data, Datashow customer assets, or authenticated Claude
source.

## Rejected behavior

The v1 importer rejects runtime network calls, dynamic code, browser storage,
top-level navigation, embedded scripts/frames/objects, inline HTML handlers,
CSS imports, dynamic dataset identifiers, undeclared or remote assets, and
unsupported `dash.*` APIs. `dash.loader` is retained in the reusable runtime for
compatibility testing but intake rejects it because a packaged Power BI visual
has no Claude tool-calling environment.
