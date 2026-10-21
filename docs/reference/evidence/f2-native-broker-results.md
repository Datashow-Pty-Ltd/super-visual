# F2 Super Dashboard — source-direct broker A/B results

> Historical research evidence, not current setup instructions. Names and IDs
> below record the A/B test only. The supported user workflow is documented in
> [Getting started](../../getting-started.md).

Test date: 5 September 2026 (Australia/Melbourne)

## Verdict

The independent, source-direct Import broker met the sub-second interaction target on F2 and outperformed the broker that DirectQueries the base semantic model.

The base model was not changed. A separate report-specific broker imported the five required AdventureWorks tables into its own VertiPaq model, added the disconnected widget registry, and served the same one-DataView custom visual contract:

`WidgetId | AxisKey | Label | Sort | Widget Value | Broker Context`

This removes the runtime semantic-model chain while preserving the architectural separation between the enterprise semantic model and the report adapter.

## Deployed A/B items

### Existing chained broker

- Semantic model: `AdventureWorks Dashboard Adapter`
- Semantic model ID: `1f052fb3-6b5b-4ab5-8b98-0431e6907aef`
- Report: `AdventureWorks Super Dashboard Broker POC`
- Report ID: `45ef0591-bff1-475a-87a8-f9f07891ca79`

### Source-direct Import broker

- Semantic model: `AdventureWorks Dashboard Native Adapter`
- Semantic model ID: `0b5f8491-0b13-4441-b7b7-e0592aeaac91`
- Report: `AdventureWorks Super Dashboard Native Broker POC`
- Report ID: `69c019ba-6cb8-4f94-8d60-ecfb6c66acb1`
- Report URL: <https://app.powerbi.com/groups/ca9d62ac-0a1c-4fa2-b384-5d6604f1b664/reports/69c019ba-6cb8-4f94-8d60-ecfb6c66acb1/85b4960ab9bb47f8a3e1?experience=power-bi>

Both reports used custom visual version `1.0.0.8` and the same batched dependency scheduler.

## Native broker construction

The native broker contains imported `Sales`, `Date`, `Product`, `Customer`, and `Sales Territory` tables copied from the shared semantic source definitions at build time. It has no `AnalysisServices.Database` expression and no DirectQuery connection to another semantic model.

The dynamic calculated `Widget Axis` table contains:

- 12 month rows;
- 4 product-category rows;
- 10 territory rows;
- the top 100 customers ranked by `[Total Sales]`.

The completed bootstrap therefore contained 126 registry rows. The model was bound to the existing `AdventureWorks MVP Azure SQL` ShareableCloud connection for one refresh.

## Data reconciliation

The native and chained models returned identical all-years totals for the comparable widget grains:

| Widget | Chained | Native |
|---|---:|---:|
| Trend | `$109,809,274.203` | `$109,809,274.203` |
| Category | `$109,809,274.203` | `$109,809,274.203` |
| Territory | `$109,809,274.203` | `$109,809,274.203` |

The customer totals intentionally differ because the chained proof has a fixed 25-customer axis while the native model successfully materialized 100 customers.

The native report also passed the combined filter test:

- external context: `Date[Year] = 2013`;
- internal selection: `Product Category = Bikes`;
- final context: `year=2013;category=Bikes`;
- batched rows: 111;
- wall time: 334.1 ms;
- visual request time: 164.0 ms;
- trend and territory total: `$42,302,193.5143`.

## Equal-shape REST benchmark

The controlled DAX query requested only trend and territory under Bikes from both models. Twenty samples per model were alternated after one warm-up request.

| Model | Min | p50 | p95 | Max |
|---|---:|---:|---:|---:|
| Chained semantic-model DirectQuery | 528.9 ms | 704.9 ms | 1,602.6 ms | 1,609.3 ms |
| Native Import/VertiPaq | 425.9 ms | 544.1 ms | 715.7 ms | 1,518.4 ms |

The native model reduced p95 by 55.3%. One native outlier exceeded one second, so REST execution alone does not satisfy a strict all-request sub-second guarantee.

## Live Power BI Service interaction benchmark

### Repeated Bikes select/clear

Ten select/clear cycles produced 20 completed interactions per report. These samples include browser-to-final-dashboard wall time. Repeated contexts benefited from Power BI caching.

| Model | Returned rows | Wall p50 | Wall p95 | Wall max |
|---|---:|---:|---:|---:|
| Chained | 47 | 339.1 ms | 417.2 ms | 644.8 ms |
| Native | 122 | 333.1 ms | 353.9 ms | 356.7 ms |

The native model remained faster and more consistent despite returning 2.6 times as many rows.

### First-hit distinct category contexts

Accessories, Bikes, Clothing, and Components were each selected and cleared once. With eight observations per model, p95 equals the observed maximum and should be treated as a small-sample bound rather than a production percentile.

| Model | Wall p50 | Wall p95/max | Request p95/max |
|---|---:|---:|---:|
| Chained | 335.7 ms | 548.5 ms | 466.2 ms |
| Native | 343.0 ms | 369.5 ms | 203.1 ms |

Every native interaction completed below 370 ms. No serial widget queries occurred; each category change produced one accepted batch for trend, territory, and customer after the known transient host update.

## Interpretation

For this proof, semantic-model chaining was a material latency and tail-variance cost. Moving the report adapter onto its own imported columnar model:

- preserved semantic-model/report separation;
- enabled the dynamic high-cardinality customer registry;
- reduced equal-shape REST p95 materially;
- kept every observed live interaction comfortably below one second on F2.

The result does not yet prove production p95 under concurrent users, much larger facts, cold capacity startup, memory pressure, or unseen filter combinations. The next performance gate should replay a representative production dependency matrix with concurrency while recording Fabric capacity metrics.

## Infrastructure lifecycle

The retained 15 MB AdventureWorks BACPAC was imported through a temporary Azure SQL database. The database was scaled from Basic to Standard S3 for the import after the Basic-tier import proved unnecessarily slow. After the semantic-model refresh and Service tests:

- the temporary blob storage account was deleted;
- the temporary Azure SQL server and database were deleted;
- F2 was suspended;
- the final capacity state was `Paused` with an empty watchdog deadline.

The imported semantic model retains its data but cannot refresh until an approved source with the same contract is available again.

## Validation

- Root tests: 25 passed.
- Super-visual tests: 12 passed.
- Root and custom-visual TypeScript checks: passed.
- PBIR validation: zero errors and two expected warnings.
- Fabric definition publication, SQL connection binding, and refresh: passed.
- DAX reconciliation and dynamic top-100 registry checks: passed.
- Power BI Service shared-filter, cross-filter, caching, and batched-query checks: passed.
