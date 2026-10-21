# Live certification

First update the semantic and broker contracts for the selected Power BI
semantic model. Initialize this project with that model's workspace and
`--semantic-model-id`, then run the current live workflow:

```bash
npx supervisual preview test --json
npx supervisual publish --json
```

Review the returned workspace, operations, and plan ID. Do not apply until a
human authorizes that exact plan ID and target workspace. Apply with
`npx supervisual publish --confirm <authorized-plan-id> --json`.

Only an `accepted` result and a successful browser check constitute a passing
live certification. The selected semantic-model ID is the only model ID users
provide.
