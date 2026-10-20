# Super Visual Hello World

This is the smallest complete Super Visual project: one semantic table, one
measure, one broker dataset, one page, and one accessible React chart.

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

This uses real semantic-model rows. It is not a synthetic fixture preview.

Edit the contracts under `contracts/` to point at your governed data. The
application receives data only through `ReportApplicationProps`.

For a real Fabric sandbox, follow the runnable
[Hello World recipe](../../docs/recipes/hello-world.md) and the concise
[certification contract](deployment/CERTIFICATION.md).
The source profile overrides only the generated bundle and keeps tenant-specific
endpoint values out of the checked-in contract.
