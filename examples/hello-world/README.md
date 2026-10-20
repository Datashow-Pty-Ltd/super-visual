# Super Visual Hello World

This is the smallest complete Super Visual project: one semantic table, one
measure, one broker dataset, one page, and one accessible React chart.

Install dependencies, then run these commands from this project directory:

```bash
npm install
npm run check
npm run compile
npm run package
npm run verify
```

After deploying and refreshing its generated semantic adapter, bind the local
React application to that exact model:

```bash
npx supervisual dev . --workspace-id <workspace-guid> \
  --semantic-model-id <adapter-model-guid> --open
npx supervisual preview test . --workspace-id <workspace-guid> \
  --semantic-model-id <adapter-model-guid> --json
```

This uses real semantic-model rows. It is not a synthetic fixture preview.

Edit the contracts under `contracts/` to point at your governed data. Application
source receives data only through `ReportApplicationProps`.

For a real Fabric sandbox, follow the runnable
[Hello World recipe](../../docs/recipes/hello-world.md) and the concise
[certification contract](deployment/CERTIFICATION.md).
The source profile overrides only the generated bundle and keeps tenant-specific
endpoint values out of the checked-in contract.
