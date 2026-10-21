# Super Visual

[![CI](https://github.com/Datashow-Pty-Ltd/super-visual/actions/workflows/ci.yml/badge.svg)](https://github.com/Datashow-Pty-Ltd/super-visual/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Datashow-Pty-Ltd/super-visual/actions/workflows/codeql.yml/badge.svg)](https://github.com/Datashow-Pty-Ltd/super-visual/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Datashow-Pty-Ltd/super-visual/badge)](https://scorecard.dev/viewer/?uri=github.com/Datashow-Pty-Ltd/super-visual)
[![npm](https://img.shields.io/npm/v/%40datashow%2Fsuper-visual-cli)](https://www.npmjs.com/package/@datashow/super-visual-cli)

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
web applications in Power BI. It packages a React application, its semantic
data binding, the custom-visual host, local assets, and the PBIR report wrapper
as one inspectable solution.

The application never needs to issue SQL or DAX. It asks for named, governed
datasets through `ReportApplicationProps`. Super Visual batches those requests
through one Power BI DataView, separates the returned rows by dataset ID, and
hands ordinary JavaScript data to each React component. Before packaging it also
checks the source policy, model references, page bindings, and generated files.

The result is the freedom of a web application with the governance and semantic
model of Power BI.

## Get started

Requirements are Node.js 22.12 or newer, Azure CLI authentication, and a
Fabric-capacity workspace. Install the public CLI directly from npm:

```bash
npm install --global @datashow/super-visual-cli
supervisual --version
```

Cloning this repository is not required to create, preview, or publish a Super
Visual report. If you prefer not to install the CLI globally, run any command
with `npx --yes @datashow/super-visual-cli@latest` instead. Repository
contributors can follow [CONTRIBUTING.md](CONTRIBUTING.md) for the source-build
workflow.

The fastest way to try Super Visual is the Hello World application. It opens as
a searchable catalog of the selected semantic model, making it both a minimal
example and a live connectivity check:

```bash
supervisual init hello-world \
  --template hello-world \
  --workspace-id <workspace-guid> \
  --semantic-model-id <semantic-model-guid>
```

`init` verifies the workspace and semantic model through read-only Fabric APIs,
creates the project, and runs six local checks covering its contracts, semantic
references, page bindings, and React source policy. The terminal shows each
stage and its final status before printing the initialization manifest as JSON.
Use `--json` when a script or agent needs only the machine-readable manifest.

The Fabric IDs are saved locally under the ignored `.supervisual/` directory,
so previewing the real model locally is just:

```bash
cd hello-world
supervisual dev --open
```

When the page is ready, package, verify, and create its deployment plan with one
command:

```bash
supervisual publish
```

`publish` shows the exact workspace, operations, and plan ID, then asks you to
type that plan ID to confirm. Press Enter to cancel without changing Fabric.
When a human intentionally wants a single uninterrupted command, they can
pre-authorize the plan that this invocation generates:

```bash
supervisual publish --pre-authorize
```

This skips only the second prompt. The CLI still resolves the immutable
workspace, packages and verifies the project, writes the content-derived plan,
rejects blockers and drift, and records the resulting plan ID. Existing items
still require `--allow-updates` and a backup directory.
For a non-interactive agent or CI job, the equivalent is:

```bash
supervisual publish --json
supervisual publish --confirm <plan-id>
```

That confirmation prompt is intentional: a live Fabric change must always be
authorized either by reviewing the exact plan and workspace or by an explicit
human `--pre-authorize` instruction for that invocation. Agents must never add
that flag on their own. Updates also require `--allow-updates` while planning
and `--backup <directory>` while applying.

## Other ways to start

Omit `--template hello-world` when you want a clean full-page canvas with the
minimum model-binding contract:

```bash
supervisual init sales-report \
  --workspace-id <workspace-guid> \
  --semantic-model-id <semantic-model-guid>
```

If you already have a Super Visual-compatible React page, use `--app` to copy
that source into a new project. This is an optional reuse path, not part of the
Hello World workflow. The source directory must contain `reportApplication.tsx`
at its root or under `src/`; it may also contain `report-design.less` and a
`report/` directory of supporting TypeScript modules:

```text
my-react-app/
├── reportApplication.tsx
├── report-design.less
└── report/
```

```bash
supervisual init sales-report \
  --app ./my-react-app \
  --workspace-id <workspace-guid> \
  --semantic-model-id <semantic-model-guid>
```

The imported page uses the same governed `ReportApplication` interface as the
built-in examples. Define its named datasets under `contracts/`; `--app` does
not import an arbitrary Vite or Create React App project wholesale. See
[Semantic binding](docs/semantic-binding.md) for the data-provider contract, or
start with the complete [AdventureWorks example](examples/adventureworks).

On the first deployment, `publish` creates the report and records its deployment
state automatically. Users work only with the Power BI semantic model they
selected.

## CLI reference

Run commands from a Super Visual project directory. Where `[project]` is
shown, it defaults to the current directory. Use
`supervisual <command> --help` for every available option.

| Command | What it does |
| --- | --- |
| `discover [input]` | Detect a Super Visual project or a dashboard format that can be imported. |
| `inspect [project]` | Summarize project configuration, bindings, policies, and generated output. |
| `migrate [project]` | Check contract versions and preview or apply recoverable source migrations. |
| `templates` | List the built-in project templates. |
| `adapters` | List the supported dashboard import adapters. |
| `import claude-dashboard <input>` | Inspect and import a supported Claude dashboard bundle. |
| `init <directory>` | Create a project, optionally from an existing React app or template, and save its Fabric binding. |
| `check [project]` | Validate project contracts, semantic bindings, and source policy. |
| `compile [project]` | Build a deterministic, inspectable solution bundle. `build` is an alias. |
| `package [project]` | Compile the app, build and embed the visual, and verify the deployable solution. |
| `verify [project]` | Verify every generated file against the solution manifest. |
| `dev [project]` | Run the React app locally against the bound live semantic model. |
| `preview test [project]` | Run a headless semantic-data and interaction smoke test against the local preview. |
| `semantic discover` | Read a live semantic model's TMDL inventory and optionally execute acceptance DAX. |
| `semantic check [project]` | Compare the project's semantic and broker contracts with a live model. |
| `publish [project]` | Package, plan, authorize, and safely publish using the saved Fabric binding. |
| `deploy <command>` | Use the lower-level guarded workflow: `workspaces`, `discover`, `status`, `diff`, `plan`, `apply`, or `restore`. |
| `certify validate <record>` | Validate and grade a redacted live certification record. |

| Common option | What it does |
| --- | --- |
| `--json` | Emit one machine-readable JSON value for agents, scripts, and CI. |
| `--app <path>` | Initialize from an existing compatible React application. |
| `--template <name>` | Initialize from a built-in template such as `blank` or `hello-world`. |
| `--workspace-id <id>` | Select or save the immutable Fabric workspace ID. |
| `--workspace-name <name>` | Assert the expected workspace display name as an additional safety check. |
| `--semantic-model-id <id>` | Select the exact Power BI semantic model used by the report and local preview. |
| `--open` | Open the local semantic preview in the default browser. |
| `--allow-updates` | Permit a plan to replace same-named remote items; updates remain backup-protected. |
| `--backup <directory>` | Choose the required recoverable backup destination for updates or written migrations. |
| `--pre-authorize` | Publish the plan generated by this invocation without a second prompt; use only with explicit human authorization. |
| `--confirm <plan-id>` | Apply a previously reviewed publish plan by its exact content-derived ID. |
| `--plan <file>` | Read or write the deployment plan at a non-default path. |
| `--receipt <file>` | Write deployment progress to a chosen receipt file. |
| `--resume <file>` | Resume an interrupted deployment from a matching receipt. |
| `--timeout <seconds>` | Set the maximum time allowed for Fabric operations. |
| `-h, --help` | Show the complete help for a command or command group. |

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
