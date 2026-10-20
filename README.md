# Super Visual

[![CI](https://github.com/Datashow-Pty-Ltd/super-visual/actions/workflows/ci.yml/badge.svg)](https://github.com/Datashow-Pty-Ltd/super-visual/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Datashow-Pty-Ltd/super-visual/actions/workflows/codeql.yml/badge.svg)](https://github.com/Datashow-Pty-Ltd/super-visual/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Datashow-Pty-Ltd/super-visual/badge)](https://scorecard.dev/viewer/?uri=github.com/Datashow-Pty-Ltd/super-visual)

## Why Super Visual exists

Power BI custom visuals are useful for a single chart, but they are a difficult
place to build a complete analytical experience. Each visual gets a constrained
drawing canvas, complex layouts must be split across many visual instances, and
coordination with native visuals and filters can feel awkward.

That led to a simpler idea: make one visual fill the entire report page and use
that space to host a real web application. The application can own its layout,
navigation, charts, tables, and interactions while Power BI continues to own the
semantic model, security context, refresh, and distribution. React is the first
supported application format; the adapter boundary allows other web formats to
be added without changing the Power BI host.

## What Super Visual is

Super Visual is an open-source compiler and deployment toolchain for full-page
web applications in Power BI. It packages a React application, a report-specific
semantic adapter, the custom-visual host, local assets, and the PBIR report
wrapper as one inspectable solution.

The application never needs to issue SQL or DAX. It asks for named, governed
datasets through `ReportApplicationProps`. Super Visual batches those requests
through one Power BI DataView, separates the returned rows by dataset ID, and
hands ordinary JavaScript data to each React component. Before packaging it also
checks the source policy, model references, page bindings, and generated files.

The result is the freedom of a web application with the governance and semantic
model of Power BI.

## Get started

Requirements are Node.js 22.12 or newer, Azure CLI authentication, and a
Fabric-capacity workspace. From this repository, install once with `npm ci`.

If your React application already exports `ReportApplication`, create and bind
the report in one command. `--app` accepts a source directory containing
`reportApplication.tsx`, optional `report/` modules, and optional
`report-design.less`:

```bash
npx supervisual init sales-report \
  --app ./my-react-app \
  --workspace-id <workspace-guid> \
  --semantic-model-id <deployed-adapter-model-guid>
```

The Fabric IDs are saved locally under the ignored `.supervisual/` directory,
so normal development is just:

```bash
cd sales-report
npx supervisual dev --open
```

When the page is ready, package, verify, and create its deployment plan with one
command:

```bash
npx supervisual publish
```

`publish` shows the exact workspace, operations, and plan ID, then asks you to
type that plan ID to confirm. Press Enter to cancel without changing Fabric.
For a non-interactive agent or CI job, the equivalent is:

```bash
npx supervisual publish --json
npx supervisual publish --confirm <plan-id>
```

That confirmation prompt is intentional: a live Fabric change must always be
authorized for the exact plan and workspace. Updates also require
`--allow-updates` while planning and `--backup <directory>` while applying.

Use the built-in app when starting from scratch:

```bash
npx supervisual init sales-report \
  --workspace-id <workspace-guid> \
  --semantic-model-id <deployed-adapter-model-guid>
```

The default is a clean full-page canvas with the minimum model-binding contract.
Choose `--template hello-world` for a working chart or start with the complete
[AdventureWorks example](examples/adventureworks). On a first deployment where
no report-specific adapter exists yet, run `publish` to create it; the returned
model ID is saved automatically for subsequent local previews.

## More than one widget

One React page can contain any number of components with different queries.
Each component names a governed dataset, and the runtime requests the visible
dataset IDs together:

```tsx
export function ReportApplication({ model, onVisibleDatasetsChange }) {
  useEffect(() => {
    onVisibleDatasetsChange?.(["trend", "category"]);
  }, [onVisibleDatasetsChange]);

  return <>
    <TrendChart data={model.datasets.trend} />
    <CategoryChart data={model.datasets.category} />
  </>;
}
```

The broker defines the semantic dimensions and measures behind `trend` and
`category`. Super Visual batches both through one provider, then caches and
invalidates them independently. See [semantic binding](docs/semantic-binding.md#how-one-react-page-supports-many-widgets)
for the complete example.

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
