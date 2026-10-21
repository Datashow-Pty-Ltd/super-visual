# Hello World live certification

Use a disposable Fabric-capacity workspace containing a Power BI semantic model
that the operator can read. Create a separately bound copy of Hello World so
the checked-in example remains tenant-neutral:

```bash
npx supervisual init hello-world-certification \
  --template hello-world \
  --workspace-id <workspace-guid> \
  --workspace-name "<expected workspace name>" \
  --semantic-model-id <semantic-model-guid> \
  --report-name "Super Visual Hello World <run-id>"
```

Prove that the React page can read and filter the selected model's live catalog:

```bash
cd hello-world-certification
npx supervisual preview test --json
```

Create the immutable deployment plan without changing Fabric:

```bash
npx supervisual publish --json
```

Review the returned workspace, operations, blockers, and plan ID. Stop until a
human authorizes that exact plan ID for that exact workspace, then apply it:

```bash
npx supervisual publish --confirm <authorized-plan-id> --json
```

Only an `accepted` publish result is a passing CLI deployment. The selected
semantic-model ID remains the only model ID used for initialization and local
preview.

Open the report in Power BI, verify that the catalog renders and remains
searchable, and record the browser and receipt evidence using
`docs/certification/live-run-template.md`. Validate the completed JSON evidence
with `npx supervisual certify validate <record> --json`.
