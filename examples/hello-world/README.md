# Super Visual Hello World

This is the smallest complete Super Visual connectivity proof. Its React page
shows a searchable catalog of the tables, columns, measures, hierarchies,
relationships, and source-parameter names declared by the semantic model.

The compiler generates the catalog as a report-specific adapter table. The
page then queries it through the normal governed broker, so seeing rows proves
the complete report → adapter → semantic source → React path. It does not expose
measure expressions, parameter values, or business rows.

Its ready-to-use React application is in `source/`. To create a separately bound
copy from the repository root:

```bash
npx supervisual init my-hello-report \
  --template hello-world \
  --workspace-id <workspace-guid> \
  --semantic-model-id <adapter-model-guid>
cd my-hello-report
npx supervisual dev --open
npx supervisual publish
```

`publish` packages and verifies everything, shows the exact Fabric plan, and
asks you to type its plan ID before it changes the workspace.

To exercise this checked-in project directly without saving a binding:

```bash
npx supervisual dev . --workspace-id <workspace-guid> \
  --semantic-model-id <adapter-model-guid> --open
npx supervisual preview test . --workspace-id <workspace-guid> \
  --semantic-model-id <adapter-model-guid> --json
```

This uses real rows from the deployed semantic adapter. It is not a browser
fixture preview.

Edit the semantic contract under `contracts/` to point at your governed data;
the catalog updates automatically. The application receives data only through
`ReportApplicationProps`.

For a real Fabric sandbox, follow the runnable
[Hello World recipe](../../docs/recipes/hello-world.md) and the concise
[certification contract](deployment/CERTIFICATION.md).
The source profile overrides only the generated bundle and keeps tenant-specific
endpoint values out of the checked-in contract.
