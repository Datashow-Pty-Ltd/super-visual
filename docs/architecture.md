# Architecture

```text
Super Visual project
  React pages + local assets
  semantic bindings + dependencies
  visual metadata + deployment environment
                 |
                 v
       contracts and policy checks
                 |
                 v
              compiler
        /          |          \
 Power BI visual   |   semantic adapter
        \          |          /
              PBIR report
                 |
                 v
        solution manifest
                 |
          plan -> apply -> verify
```

## Layers

### Contracts

Versioned JSON Schemas and TypeScript types define the project, page set,
widget broker, report source bundle, deployment plan, compliance report, and
build manifest. These files are the interoperability boundary.

### Compiler

The compiler validates the project, creates generated runtime manifests,
copies the stable visual scaffold, bundles local assets, compiles the semantic
adapter and PBIR wrapper, invokes Microsoft's packaging tools, and records
artifact hashes.

### Runtime

The Power BI runtime parses one governed DataView, partitions rows by
`WidgetId`, caches independently addressable datasets, rejects stale context,
and applies report and self filters through the host. React pages consume a
plain report model and callbacks.

For `claude-dashboard-bundle.v1`, the runtime adds a compatibility boundary for
the declared `dash.*` APIs. The importer preserves permitted HTML, CSS, and
mount code, vendors local assets, and generates row-shape bindings. The same
governed broker remains the only data source; no Claude service is called at
runtime.

### Semantic adapter

The adapter exposes report-specific rows with the shape:

```text
WidgetId | AxisKey | Label | Sort | SeriesKey | SeriesLabel |
WidgetValue | BrokerContext
```

The source-direct Import mode proven by AdventureWorks is the release default.
The widget dependency matrix determines which cached datasets are invalidated;
the runtime requests invalidated widget IDs as one batch.

### Deployment

The deployer exposes read-only discovery/status, produces a content-hashed
plan, resolves the target workspace and
connections, creates or explicitly updates definitions, binds the semantic
model connection, refreshes, executes verification queries, publishes the
report, and records the resulting IDs. Authentication remains outside project
files.

## Package dependency direction

```text
contracts
  -> compliance
  -> adapter-claude-dashboard
  -> compiler / runtime-powerbi / semantic
  -> fabric deployment
  -> cli
  -> examples
```

No package above the example layer may import AdventureWorks data, copy,
identifiers, or design decisions.
