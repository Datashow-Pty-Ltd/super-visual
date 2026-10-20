# Power BI constraints

The deployed AdventureWorks proof established the constraints below.

1. A Super Visual occupies one full report page as one custom visual.
2. The host-facing package contains all executable React code and assets.
3. A brokered report uses one long-table DataView for predictable result
   shapes. Independent widget state comes from the `WidgetId` discriminator and
   the React cache.
4. Invalidated widgets are requested together with a `WidgetId IN (...)` self
   filter. Serial widget requests add avoidable query and transport latency.
5. The selected source widget may retain its comparison distribution while its
   declared dependants refresh.
6. Cached rows are accepted only when their bounded context fingerprint
   matches the requested business filter context.
7. External filters invalidate all affected datasets.
8. Production validation must cover rendering, filter application, filter
   clearing, response timing, browser errors, semantic refresh, and report
   binding on the target capacity.
9. Runtime network access, downloaded application code, and credentials in the
   package are outside the supported contract.
10. High-cardinality axes require explicit row limits and a refreshable source
    credential arrangement.
