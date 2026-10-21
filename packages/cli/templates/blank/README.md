# {{PROJECT_TITLE}}

This is the smallest complete Super Visual project: one semantic table, one
measure, one broker dataset, one page, and one accessible React chart.

This project is ready for the three-command workflow. If `init` was given a
workspace and Power BI semantic model, run:

```bash
npx supervisual dev --open
npx supervisual publish
```

`publish` performs the checks, packaging, verification, and planning, then asks
for confirmation of the exact plan ID. For a project without a saved binding,
pass the IDs once:

```bash
npx supervisual dev . --workspace-id <workspace-guid> \
  --semantic-model-id <semantic-model-guid> --open
npx supervisual preview test . --workspace-id <workspace-guid> \
  --semantic-model-id <semantic-model-guid> --json
```

Edit the contracts under `contracts/` to point at your governed data. Application
source receives data only through `ReportApplicationProps`.
