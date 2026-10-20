# Super Visual

[![CI](https://github.com/Datashow-Pty-Ltd/super-visual/actions/workflows/ci.yml/badge.svg)](https://github.com/Datashow-Pty-Ltd/super-visual/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Datashow-Pty-Ltd/super-visual/actions/workflows/codeql.yml/badge.svg)](https://github.com/Datashow-Pty-Ltd/super-visual/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Datashow-Pty-Ltd/super-visual/badge)](https://scorecard.dev/viewer/?uri=github.com/Datashow-Pty-Ltd/super-visual)

Super Visual turns a governed React analytical page into a semantically bound,
deployable Power BI application. It compiles and verifies the React source,
custom visual, report-specific semantic adapter, PBIR report wrapper, local
assets, and deployment manifest as one solution.

The current `0.1.0-rc.0` release candidate includes:

- project discovery, initialization, migration, validation, and compilation;
- source-policy and Power BI compatibility checks;
- live local preview against the exact deployed semantic adapter;
- deterministic `.pbiviz`, TMDL, PBIR, and manifest packaging;
- guarded Fabric discovery, diff, plan, apply, backup, restore, and status;
- a Claude dashboard bundle adapter and agent skills for Claude and Codex; and
- Hello World and AdventureWorks reference projects.

AdventureWorks is the golden behavioral sample. The reusable compiler and
runtime do not contain AdventureWorks-specific behavior.

## Requirements

- Node.js 22.12 or newer.
- Azure CLI authentication for live Fabric operations.
- A Fabric-capacity workspace and permission to create semantic models and
  reports for deployment.
- A service-reachable SQL source and Fabric connection for live semantic data.

## Install and inspect

```bash
git clone https://github.com/Datashow-Pty-Ltd/super-visual.git
cd super-visual
npm ci

npx supervisual discover examples/hello-world --json
npx supervisual inspect examples/hello-world --json
npx supervisual check examples/hello-world --json
```

Create a project from the smallest complete template:

```bash
npx supervisual init my-dashboard --template hello-world --json
```

`supervisual.yaml` is the project entry point. Edit the React application under
`source/` and the governed semantic, broker, and page contracts under
`contracts/`. Never edit or commit generated `dist/` output.

## Multiple widgets, one semantic provider

A React page can contain many charts, tables, KPIs, and routes with different
data needs. Each component names a governed broker dataset; each dataset declares
its own semantic dimensions, measures, row limits, and dependencies. Super
Visual batches the currently needed dataset IDs through one long-table Power BI
DataView, partitions returned rows by `WidgetId`, and caches each logical result.
Multiple components may reuse the same dataset without another semantic query.

For example, imagine one React page with a monthly trend and a category bar
chart. Its broker declares two logical datasets with different semantic queries:

```jsonc
{
  "widgets": [
    {
      "id": "trend",
      "dimensions": [{ "key": "Date[Year Month]" }],
      "measures": ["[Total Sales]", "[Gross Profit]"],
      "rowLimit": 48
    },
    {
      "id": "category",
      "dimensions": [{ "key": "Product[Product Category]" }],
      "measures": ["[Total Sales]"],
      "rowLimit": 12
    }
  ]
}
```

The page binds each visual component to a dataset ID:

```yaml
widgets:
  - { id: monthly-trend, primitive: line, dataset: trend }
  - { id: category-bars, primitive: bar, dataset: category }
```

React does not write SQL or DAX. It tells the runtime which governed datasets
are visible and reads their materialized points from `ReportApplicationProps`:

```tsx
export function ReportApplication({ model, onVisibleDatasetsChange }) {
  useEffect(
    () => onVisibleDatasetsChange?.(["trend", "category"]),
    [onVisibleDatasetsChange],
  );

  return <>
    <TrendChart dataset={model.datasets.trend} />
    <CategoryBars dataset={model.datasets.category} />
  </>;
}
```

The semantic adapter turns that request into one batch filtered to
`WidgetId IN ("trend", "category")`. Power BI can therefore return rows for
both logical queries through one predictable DataView:

```text
WidgetId  AxisKey  Label       SeriesLabel  WidgetValue
trend     2024-01  Jan 2024    Total Sales       420000
trend     2024-01  Jan 2024    Gross Profit      135000
category  Bikes    Bikes       Total Sales       310000
category  Clothing Clothing    Total Sales        82000
```

The runtime partitions these rows by `WidgetId`, caches `trend` and `category`
independently, and passes ordinary JavaScript datasets to React. If a category
selection affects the trend, the dependency contract marks `trend` stale and
requests only the affected dataset IDs again. If two React components both use
`dataset: category`, they share the same cached semantic result.

See [semantic binding](docs/semantic-binding.md#how-one-react-page-supports-many-widgets)
for the complete query, filtering, invalidation, caching, and local-preview flow.

## Test and deploy a React page

### 1. Check and compile locally

```bash
npx supervisual check my-dashboard --json
npx supervisual compile my-dashboard --json
```

These commands validate source policy, contracts, bindings, and generated
definitions without changing Fabric.

### 2. Test against real semantic data

Local semantic preview is intentionally not a fixture preview. It queries the
broker in an already deployed semantic adapter, then runs the local React page
with those rows and interactions:

Skip this step until after the first apply when the project does not yet have a
deployed adapter.

```bash
npx supervisual dev my-dashboard \
  --workspace-id <workspace-guid> \
  --semantic-model-id <adapter-model-guid> \
  --open
```

In another terminal, run the bounded browser smoke test:

```bash
npx supervisual preview test my-dashboard \
  --workspace-id <workspace-guid> \
  --semantic-model-id <adapter-model-guid> \
  --json
```

The first project deployment bootstraps that adapter. On later React-only
changes, use its returned model ID to test locally before planning the report
update. If the semantic contract itself changes, deploy and refresh the new
adapter before treating preview as semantic acceptance.

### 3. Package and verify

Copy the project sample profile to an ignored `.supervisual/` path and set its
server and database to the exact endpoint represented by the Fabric connection:

```bash
mkdir -p .supervisual
cp my-dashboard/deployment/source-profile.example.json \
  .supervisual/source-profile.json
```

Then build the deployable bundle:

```bash
npx supervisual package my-dashboard \
  --parameters-file .supervisual/source-profile.json \
  --json
npx supervisual verify my-dashboard --json
```

### 4. Discover and plan

```bash
npx supervisual deploy discover \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --connections \
  --json

npx supervisual deploy plan my-dashboard \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --semantic-model-name "My Dashboard" \
  --report-name "My Dashboard" \
  --connection-id <fabric-connection-guid> \
  --connection-mode ShareableCloud \
  --acceptance-query-file my-dashboard/deployment/acceptance.dax \
  --json
```

Review the immutable workspace ID, item names, actions, blockers, and plan ID.
Same-named items are blocked unless `--allow-updates` was deliberately included.

### 5. Authorize, apply, and prove status

Live deployment must pause until a human authorizes the exact plan ID for the
exact workspace. After that authorization:

```bash
npx supervisual deploy apply my-dashboard \
  --plan my-dashboard/.supervisual/deploy-plan.json \
  --confirm <authorized-plan-id> \
  --backup .supervisual/backups \
  --json

npx supervisual deploy status \
  --workspace-id <workspace-guid> \
  --semantic-model-id <deployed-semantic-model-guid> \
  --report-id <deployed-report-guid> \
  --connection-id <fabric-connection-guid> \
  --acceptance-query-file my-dashboard/deployment/acceptance.dax \
  --json
```

Only `status: accepted` proves report binding, connection binding, completed
refresh, and non-empty acceptance data. Finish with browser interaction checks
in Power BI Service.

## Runnable recipes

- [Deploy Hello World](docs/recipes/hello-world.md) — the smallest complete
  first deployment and semantic-preview loop.
- [Deploy AdventureWorks](docs/recipes/adventureworks.md) — provision the proven
  Azure SQL source, plan and apply the semantic model and report, then run live
  acceptance.

The AdventureWorks helper exposes the ordered workflow directly:

```bash
npm run adventureworks:deploy -- --help
```

It does not manage Fabric capacity and it does not create or retain Fabric
connection credentials.

## Documentation

- [Getting started](docs/getting-started.md)
- [Command reference](docs/commands.md)
- [Architecture](docs/architecture.md)
- [Semantic binding](docs/semantic-binding.md)
- [Solution bundle](docs/solution-bundle.md)
- [Deployment safety](docs/deployment-safety.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Roadmap](docs/roadmap.md)

Coding agents must follow [CLAUDE.md](CLAUDE.md) and the
[agent interface](docs/agent-guide.md). The same canonical Super Visual skill is
distributed for Claude and Codex and checked for drift in CI.

Security evidence, scan coverage, release attestations, and the distinction
between automated assurance and independent certification are in the
[security assurance guide](docs/security-assurance.md). See
[SECURITY.md](SECURITY.md) for private vulnerability reporting and the
[OpenSSF Best Practices readiness checklist](docs/certification/openssf-best-practices-readiness.md)
for the certification path.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
