---
name: super-visual
description: Validate, compile, package, verify, or safely deploy a Super Visual React-to-Power-BI project containing a supervisual.yaml file. Use for Super Visual project work; do not use for unrelated Power BI reports or generic React applications.
---

# Super Visual

Treat `supervisual.yaml` as the project entry point and generated `dist/` files
as disposable output. Preserve the separation between application source,
broker/semantic contracts, reusable runtime, and Fabric deployment.

For project changes:

1. Run `npx supervisual check <project> --json` and repair contract or policy
   diagnostics in source assets.
2. Run `npx supervisual build <project> --json`; add `--package` when a
   deployable `.pbiviz` and embedded PBIR resource are required.
3. Run `npx supervisual verify <project> --json` before handing off or
   deploying the output.

Application code may consume only `ReportApplicationProps` and the broker data
model. It must not access the network, execute dynamic code, use browser
storage, inject unsafe HTML, import Power BI host APIs, or import preview
fixtures. Bind new data through the semantic and widget-broker contracts; do
not put report-specific behavior in the reusable runtime or mutate the base
semantic model.

Fabric deployment is plan/apply. Planning requires an immutable workspace ID
and is read-only. Applying is an external mutation: require direct human
authorization for the exact plan ID. Never infer `--allow-updates`. Updates
replace complete remote definitions and require a backup directory. Treat the
upload as incomplete until connection binding, refresh, and live report
acceptance checks succeed.
