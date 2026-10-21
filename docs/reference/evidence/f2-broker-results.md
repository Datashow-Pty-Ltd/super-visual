# F2 Super Dashboard Broker POC — results

> Historical research evidence, not current setup instructions. The supported
> user workflow is documented in [Getting started](../../getting-started.md) and
> requires only the selected Power BI semantic-model ID.

Test date: 5 September 2026 (Australia/Melbourne)

Follow-up: the source-direct Import A/B test removed the chained semantic-model hop and materially improved tail latency. See [f2-native-broker-results.md](./f2-native-broker-results.md).

## Verdict

The brokered version of the thesis is viable on F2.

A single Power BI custom visual can render several independently cached React/Nivo widgets while Power BI supplies and filters their data, provided an intermediate composite semantic model converts the widget contracts into one long-table DataView:

`WidgetId | AxisKey | Label | Sort | Widget Value | Broker Context`

The original multiple-`dataViewMappings` thesis remains rejected. The working implementation has exactly one table mapping and one physical DataView. Independence is supplied by `WidgetId` rows in the wrapper model, not by asking the custom visual host for four result sets.

## Deployed proof

- Workspace: `AdventureWorks MVP` (`ca9d62ac-0a1c-4fa2-b384-5d6604f1b664`)
- Capacity: `dsf2mvp` (F2)
- Base model: `AdventureWorks Sales` (`c23758c1-fdc8-4cea-8310-4ffba27b3e09`)
- Wrapper model: `AdventureWorks Dashboard Adapter` (`1f052fb3-6b5b-4ab5-8b98-0431e6907aef`)
- Standalone report: `AdventureWorks Super Dashboard Broker POC` (`45ef0591-bff1-475a-87a8-f9f07891ca79`)
- Report URL: <https://app.powerbi.com/groups/ca9d62ac-0a1c-4fa2-b384-5d6604f1b664/reports/45ef0591-bff1-475a-87a8-f9f07891ca79/85b4960ab9bb47f8a3e1?experience=power-bi>
- Custom visual package: `1.0.0.8`

Fabric resolved the wrapper source as an Analysis Services connection to:

`powerbi://api.powerbi.com/v1.0/myorg/AdventureWorks MVP;AdventureWorks Sales`

The reported connection mode was `PersonalCloud`. The proof did not create or use a second SQL-backed copy of AdventureWorks. Granular access control was enabled on the wrapper model before testing a dynamic local table over the SSO DirectQuery source.

The F2 was suspended immediately after the live checks. Final state: `Paused`; watchdog deadline: empty.

## Architecture tested

The wrapper model contains:

- DirectQuery entity tables for the required remote fields from `Sales`, `Date`, `Product`, `Customer`, and `Sales Territory`.
- An external `[Base Total Sales]` measure that resolves the base model's `[Total Sales]` measure.
- A disconnected, imported `Widget Axis` table with 51 rows: 12 months, 4 categories, 10 territories, and 25 customers.
- `[Widget Value]`, which uses `SWITCH(SELECTEDVALUE(WidgetId), ...)` and `TREATAS` to evaluate the requested widget grain.
- `[Broker Context]`, a deliberately bounded fingerprint for Year and Product Category.

The React visual:

- parses one table DataView and partitions it by `WidgetId`;
- retains the last verified dataset for every widget;
- marks cached widgets as fresh, stale, or loading;
- self-filters `Widget Axis[WidgetId]` to request only invalidated widgets;
- applies category selections to both `general.filter` (outward report filtering) and `general.selfFilter` (the originating visual's own query);
- rejects transient updates whose context fingerprint does not match the requested business filter;
- exposes its event history and row/value totals as a DOM diagnostic payload.

## Acceptance evidence

### 1. Independent result shapes without a Cartesian product

Initial bootstrap returned one DataView containing 51 long-table rows:

| Widget | Rows |
|---|---:|
| Trend | 12 |
| Category | 4 |
| Territory | 10 |
| Customer | 25 |

After bootstrap the persistent self-filter requested only trend and Power BI returned a 12-row DataView. Later requests returned only the selected widget's rows: category 4, territory 10, and customer 25. The React cache continued to contain all four datasets.

Version `1.0.0.8` then proved batched invalidation: a single self-filter containing `trend`, `territory`, and `customer` returned 47 rows under `Product Category = Bikes`. The result was the sum of the independent widget shapes, not a Cartesian product.

### 2. Shared report filter context

Applying the normal report filter `Date[Year] = 2013` in Power BI Service produced:

- broker context `year=2013;category=Accessories,Bikes,Clothing,Components,Unassigned`;
- trend total `$49,926,384.4972`;
- category total `$49,926,384.4972`;
- territory total `$49,926,384.4972`;
- 24 nonblank customer rows from the configured top-customer axis.

On the batched build, clicking Bikes while the report URL carried `Date[Year] = 2013` returned one 46-row request containing 12 trend, 10 territory, and 24 nonblank customer rows. Its final context was `year=2013;category=Bikes`.

Clearing the Year filter in the Service filter pane, without reloading the React visual, caused the dependency matrix to invalidate all four widgets. The event log showed:

1. trend returned under the new context;
2. category: 4 rows, 181.4 ms;
3. territory: 10 rows, 173.5 ms;
4. customer: 25 rows, 182.6 ms.

All totals returned to the all-years context.

### 3. Cross-filtering from a Nivo widget

In version `1.0.0.7`, clicking the Nivo `Bikes` bar caused:

1. a transient unfiltered host update, rejected by the context gate;
2. trend: 12 rows under `category=Bikes`, 200.8 ms;
3. territory: 10 rows under `category=Bikes`, 170.4 ms;
4. customer: 25 rows under `category=Bikes`, 179.1 ms.

The final cache was:

| Widget | Final sum | Behavior |
|---|---:|---|
| Trend | `$94,620,526.2077` | recomputed |
| Category | `$109,809,274.2030` | retained as the full comparison distribution |
| Territory | `$94,620,526.2077` | recomputed |
| Customer | `$14,596,862.9231` | recomputed for the configured customer axis |

The UI retained a `Category: Bikes ×` state chip. Clearing the chip restored every cached sum and the all-category context.

In version `1.0.0.8`, the same click caused exactly two host updates:

1. one transient `business-wait` update containing the old 12-row trend result, which the context gate rejected;
2. one `business` update containing all three requested datasets in a 47-row batch.

The diagnostic payload recorded `requestedWidgets=[trend,territory,customer]`, `receivedWidgets=[trend,territory,customer]`, and 581.5 ms. There were no serial follow-on widget requests. The category dataset remained cached at its unfiltered `$109,809,274.2030` comparison total.

### 4. Power BI Service on F2

The custom visual rendered four 895×412 Nivo SVGs inside one 1920×1080 visual sandbox in Power BI Service. All model, filter, selection, cache, and clear tests above ran against the deployed F2 report. No Desktop test was used.

## Performance finding

Five warm Power BI REST executions produced these medians:

| Query shape | Rows | Median |
|---|---:|---:|
| All widgets | 51 | 622.3 ms |
| Trend | 12 | 513.8 ms |
| Category | 4 | 521.7 ms |
| Territory | 10 | 512.5 ms |
| Customer | 25 | 501.2 ms |

The REST timings include request overhead that the in-report host path avoids; the corresponding Service visual requests were usually about 170–201 ms.

This validates selective DataView retrieval, but it also validates the performance concern. Fixed query/transport overhead is large relative to this small AdventureWorks workload. Serially requesting three or four invalidated widgets is not a scalable final scheduler and can cost as much as, or more than, one combined query.

The batched scheduler in `1.0.0.8` removes that multiplier. The live Service visual completed the three-widget Bikes batch in 581.5 ms, and the combined `Year = 2013` plus Bikes batch in 461.8 ms. An equivalent cold execution through the Power BI REST query endpoint took 4,805.4 ms, showing that REST timings are not representative of the warm in-report host path.

The resulting rule is: invalidate through the dependency matrix, then request all invalidated widget IDs in one self-filter (`WidgetId IN (...)`). Cache widgets outside the dependency set. A filter change that affects every widget should legitimately request every widget in one batch.

The test confirms returned row/branch selectivity and end-to-end latency. It did not capture XMLA server timings or source query traces, so it does not independently prove that every unused `SWITCH` branch was absent from the underlying engine plan. The large reduction in returned shape and the measured host timings are the evidence available from the Service path.

## Operational and product caveats

- The React cache is in-memory render state. It survives ordinary visual updates, not visual destruction, page reload, or browser refresh.
- Cached data is used only while its bounded context fingerprint remains valid. Unknown context changes fail safe by invalidating every widget.
- The proof fingerprints Year and Product Category only. Production needs an explicit dependency/fingerprint contract for every filterable semantic dimension.
- The composite model's calculated `Widget Axis` table had to be refreshed once after definition deployment before it contained data.
- The current source connection is `PersonalCloud`; multi-user production deployment needs deliberate connection/identity governance.
- A dynamic top-100 customer registry was implemented locally as a calculated `Widget Axis` table over the nested model. Fabric rejected its deployment while the source used SSO, first requiring granular access control and then reporting missing stored credentials. Enabling granular access control satisfied the first prerequisite, but reauthorizing the existing Personal Cloud source as OAuth2 returned HTTP 400 before an identity prompt appeared. This is a connection/refresh constraint, not a DataView or React-cache failure.
- Consequently, the deployed proof still uses the fixed 25-customer axis. Dynamic/high-cardinality widget axes require a shareable cloud connection, workspace identity, or another refreshable non-SSO credential arrangement. That operational choice was intentionally not made in this test.
- Standard Power BI query caching is not the solution for this DirectQuery chain. Microsoft's Premium query cache is for Import models and is not used for report interactions in this scenario.

## Validation

- Root TypeScript typecheck: passed.
- Custom visual TypeScript typecheck: passed.
- Unit tests: 24 passed in the final root suite; 12 directly cover the broker visual.
- `pbiviz package`: passed.
- PBIR validation: zero errors; expected warnings were the custom visual being absent from the built-in visual catalog and an unreachable remote JSON schema.
- Fabric TMDL definition create/update: passed.
- Wrapper refresh: passed.
- Power BI REST DAX checks: passed.
- Power BI Service interaction checks: passed.
- Dynamic top-100 calculated-axis deployment over the existing Personal Cloud connection: blocked by the source credential mode, as documented above.

## Relevant Microsoft behavior

- Composite semantic models can add local import tables and measures over DirectQuery tables from another Power BI semantic model: <https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-composite-models>
- Custom visuals apply report filters through `IVisualHost.applyJsonFilter`, with the filter property declared in `capabilities.json`: <https://learn.microsoft.com/en-us/power-bi/developer/visuals/filter-api>
- Premium query caching does not apply to DirectQuery or LiveConnect semantic models and does not cache interactive report queries: <https://learn.microsoft.com/en-us/power-bi/connect-data/power-bi-query-caching>
- Shareable cloud connections and granular access control govern whether an item can retain and reuse cloud-source credentials: <https://learn.microsoft.com/en-us/power-bi/connect-data/service-create-share-cloud-data-sources>
