# {{PROJECT_TITLE}}

This is the smallest complete Super Visual connectivity proof. Its React page
shows a searchable catalog of the entities declared by the semantic model.
The compiler generates that catalog in the report-specific adapter and queries
it through the normal governed broker, so visible rows prove the complete data
path without exposing expressions, parameter values, or business rows.

This project is ready for the three-command workflow. If `init` was given a
workspace and deployed semantic adapter, run:

```bash
npx supervisual dev --open
npx supervisual publish
```

`publish` performs the checks, packaging, verification, and planning, then asks
for confirmation of the exact plan ID. For a project without a saved binding,
pass the IDs once:

```bash
npx supervisual dev . --workspace-id <workspace-guid> \
  --semantic-model-id <adapter-model-guid> --open
npx supervisual preview test . --workspace-id <workspace-guid> \
  --semantic-model-id <adapter-model-guid> --json
```

Edit the semantic contract under `contracts/` to point at your governed data;
the catalog updates automatically. Application source receives data only
through `ReportApplicationProps`.
