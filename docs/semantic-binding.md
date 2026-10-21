# Semantic binding

Super Visual keeps the reusable semantic model and each report application's
data needs separate. The semantic compiler produces a standard TMDL model from
the governed YAML contract. The broker compiler then copies that model and adds
one report-specific, disconnected `Widget Axis` table.

Internally, the managed binding is source-direct and Import mode. Its calculated
table materialises the small set of rows required by the report, while `Widget
Value` applies each row's typed dimension keys back to the governed semantic
objects with `TREATAS`. Selectable widgets remove their own axis filter before
recalculation, which is the behaviour proven in the deployed AdventureWorks
visual.

This preserves three boundaries:

1. The reusable base model is never mutated.
2. React receives only the stable eight-field long-table protocol.
3. Every dimension and measure reference is resolved before TMDL is written.

The broker contract must declare `source-direct-import`, set
`baseModelMutation` to `false`, and include exactly these fields: `WidgetId`,
`AxisKey`, `Label`, `Sort`, `SeriesKey`, `SeriesLabel`, `WidgetValue`, and
`BrokerContext`.

## How one React page supports many widgets

A Super Visual does not ask Power BI for an independent DataView for every
chart. Multiple simultaneous mappings did not provide a reliable independent
result-set contract for a full-page custom visual. Instead, Super Visual
multiplexes several logical datasets through one physical table DataView:

```text
React page
  trend chart  ─────────────── dataset: trend
  category bar ─────────────── dataset: category
  product tree ─┐
  product table ┴────────────── dataset: product
                                      |
                                      v
                     visible or invalidated dataset IDs
                                      |
                                      v
                  Widget Axis[WidgetId] IN (...)
                                      |
                                      v
             managed semantic binding (internal)
             (different dimensions, measures and row limits)
                                      |
                                      v
                  one eight-column broker DataView
                                      |
                                      v
                  partition by WidgetId and cache
                                      |
                                      v
                    DashboardModel.datasets
```

There are three distinct concepts:

1. A **React widget** is a visual component such as a line chart, tree, table,
   or KPI.
2. A **broker dataset** is a governed logical query identified by a stable
   `widgets[].id` in `widget-broker.json`.
3. The **DataView** is the single host transport containing rows for one or more
   broker datasets.

Each broker dataset independently declares its semantic dimensions, measures,
row limit, ordering rule, selectability, and invalidation dependencies. For
example, AdventureWorks declares a monthly `trend` dataset with two measures,
a category dataset with one measure, and a product dataset with a three-level
hierarchy. The compiler resolves every referenced table, column, and measure
against `semantic-model.yaml` before generating the managed binding.

The generated disconnected `Widget Axis` table stores the bounded axis rows for
all declared datasets. `WidgetId` identifies which logical dataset a row belongs
to. `Widget Value` evaluates the row's declared measure and uses typed `TREATAS`
filters to apply its dimension keys to the governed semantic model. `SeriesKey`
and `SeriesLabel` distinguish multiple measures within the same dataset. This
allows rows with different grains and measures to share one stable long-table
shape without asking React to understand DAX or model metadata.

When a route becomes visible, React reports the unique dataset IDs used by its
summary, KPIs, search, and widgets. The runtime requests those IDs together with
a self-filter such as:

```text
Widget Axis[WidgetId] IN ("trend", "category")
```

Power BI evaluates that as one batched host query and returns one table. The
runtime validates the eight roles, partitions the rows by `WidgetId`, converts
each partition into a `WidgetDataset`, and stores it under
`DashboardModel.datasets[id]`. React then selects data by key:

```tsx
const dataset = model.datasets[widget.dataset];
return <WidgetBody widget={widget} dataset={dataset} />;
```

More than one React widget may name the same dataset. On the AdventureWorks
Products page, the product hierarchy and ranked product table both use
`dataset: product`; they render the same governed result in different forms and
do not trigger duplicate semantic queries.

Selections still flow through Power BI rather than being calculated inside
React. A selectable widget applies a host filter to its broker-declared semantic
column. The dependency matrix marks only affected datasets stale, requests all
of them in one `WidgetId IN (...)` batch, and retains unaffected cached datasets.
An external slicer or report filter invalidates every dataset whose semantic
context may have changed. A returned batch is accepted only for its matching
context fingerprint, preventing late responses from overwriting newer state.

This pattern gives each widget a different governed semantic query while
preserving the host constraint of one predictable DataView and keeping the
React application independent of Power BI APIs.

## Local semantic preview

The preview deliberately queries the Power BI semantic model selected by the
user rather than a fixture or source SQL database. Querying source SQL would
bypass DAX measures, relationships, calculation behaviour, and semantic
security. The local gateway compiles only the datasets and validated UI
selections declared by the project, then projects the results into the same
eight broker fields used by the deployed visual. The shared broker-row
materialiser builds the same `DashboardModel` consumed in Power BI.

Consequently, local preview follows the same multi-widget path: the CLI derives
the requested dataset IDs from the current page, queries the selected semantic
model, and uses the shared broker-row materialiser. It does not issue source SQL
directly or require a user to identify an internal deployment model.

Authentication and DAX execution remain in the local CLI process. The browser
receives neither credentials nor an arbitrary query facility. The server binds
only to loopback, requires same-origin JSON and an ephemeral nonce, limits the
request body, and accepts only widget IDs and parameters declared by the loaded
project.
