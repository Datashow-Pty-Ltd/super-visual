# Getting started

Super Visual lets one React application occupy a complete Power BI report page.
Power BI supplies governed semantic data; React controls the page layout and
interactions.

## Before you start

You need Node.js 22.12 or newer, Azure CLI authentication, a Fabric-capacity
workspace, and permission to create or update semantic models and reports.

From a clone of this repository, run `npm ci` once.

## Bring an existing React page

A Super Visual application directory contains:

```text
my-react-app/
├── reportApplication.tsx       # required; exports ReportApplication
├── report-design.less          # optional
└── report/                     # optional local .ts/.tsx modules
```

The exported component receives `ReportApplicationProps`, reads only
`model.datasets`, and reports its visible dataset IDs through
`onVisibleDatasetsChange`. The [Hello World source](../examples/hello-world/source)
is the smallest working example.

Create the project and save its local Fabric binding:

```bash
npx supervisual init sales-report \
  --app ./my-react-app \
  --workspace-id <workspace-guid> \
  --workspace-name "<workspace-name>" \
  --semantic-model-id <deployed-adapter-model-guid>
```

The default scaffold is a clean full-page canvas. Add
`--template hello-world` for a searchable semantic-model catalog that acts as a
live connectivity proof. Initialization
creates a unique visual identity, validates the project, and stores the Fabric
IDs in ignored `.supervisual/target.json`; it does not put tenant IDs in source
control.

## Develop with real semantic data

From the new project directory:

```bash
cd sales-report
npx supervisual dev --open
```

The Node.js process reads the saved binding, validates the exact deployed
report-specific adapter, and serves the React page on `127.0.0.1`. Credentials
and DAX remain in the local Node process. The browser receives only governed
broker rows, so the data and interactions match the deployed architecture
instead of a fixture.

Run the repeatable browser check when useful:

```bash
npx supervisual preview test --json
```

The model must contain this project's generated `Widget Axis` broker. A reusable
base model alone is not enough. If this is the first deployment and no adapter
exists yet, publish once to create it; Super Visual saves the returned model ID,
and later `dev` commands need no IDs.

## Publish

```bash
npx supervisual publish
```

This one command checks, compiles, packages, verifies, and plans the semantic
adapter and report. It then displays the immutable workspace, item operations,
and plan ID. Type that exact plan ID at the prompt to deploy, or press Enter to
stop safely.

Automation cannot use an interactive prompt. In `--json` mode the first call
returns the plan, and a second authorized call applies it:

```bash
npx supervisual publish --json
npx supervisual publish --confirm <authorized-plan-id> --json
```

Existing items are never overwritten implicitly. To update them, create the
plan with `--allow-updates` and supply `--backup <directory>` for the confirmed
apply. Add a Fabric connection and acceptance query when publication must also
bind, refresh, and prove live data:

```bash
npx supervisual publish \
  --connection-id <connection-guid> \
  --parameters-file .supervisual/source-profile.json \
  --acceptance-query-file deployment/acceptance.dax
```

Only `status: accepted` proves connection binding, refresh, and a non-empty
acceptance result. `published-unverified` means the files were published but the
live data checks were not completed.

## Understand the model binding

The three files under `contracts/` separate responsibilities:

- `semantic-model.yaml` declares the governed tables, columns, and measures.
- `widget-broker.json` turns each UI data need into a named logical dataset.
- `page-set.yaml` maps page components and interactions to those datasets.

React remains ordinary presentation code. Multiple charts can request different
dataset IDs through the same provider, and multiple components can share one
cached dataset. Read [Semantic binding](semantic-binding.md) for the complete
multi-widget example.

For lower-level discovery, migration, compilation, plan/apply, restore, and
certification commands, see the [command reference](commands.md) and
[deployment safety](deployment-safety.md). Generated `dist/` output is
disposable and must not be edited or committed.
