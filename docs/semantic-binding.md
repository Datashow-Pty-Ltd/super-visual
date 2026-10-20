# Semantic binding

Super Visual keeps the reusable semantic model and each report application's
data needs separate. The semantic compiler produces a standard TMDL model from
the governed YAML contract. The broker compiler then copies that model and adds
one report-specific, disconnected `Widget Axis` table.

The adapter is intentionally source-direct and Import mode. Its calculated
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
