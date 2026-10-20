# Super Visual

Super Visual compiles governed React dashboards into semantically bound,
deployable Power BI applications.

The project packages five things as one verifiable solution:

- a React analytical application and its local assets;
- the Power BI custom visual runtime;
- a report-specific semantic adapter;
- a PBIR report wrapper; and
- a deployment and verification manifest.

The implementation is being extracted from the deployed AdventureWorks Super
Visual proof. AdventureWorks remains the golden sample and behavioural
reference while the compiler, runtime, contracts, policy checks, and deployment
code become reusable packages.

## Project status

The complete nine-stage extraction is available as `0.1.0-rc.0`. See the
[roadmap](docs/roadmap.md), [architecture](docs/architecture.md),
[semantic binding](docs/semantic-binding.md), and
[solution bundle](docs/solution-bundle.md). Deployment follows the
[plan/apply safety model](docs/deployment-safety.md). The
[extraction inventory](docs/extraction-inventory.md) maps each proven source.

## Intended workflow

```bash
npm install
npm test

npx supervisual check examples/adventureworks
npx supervisual build examples/adventureworks
npx supervisual deploy plan examples/adventureworks --environment fabric
```

Deployment is plan based and does not overwrite same-named Fabric items unless
the caller explicitly enables updates.

The [AdventureWorks sample](examples/adventureworks/README.md) is a complete
consumer with source provenance and a human deployment guide. `npm run
example:package` rebuilds and packages it end to end.

Coding agents should follow [CLAUDE.md](CLAUDE.md) and the
[agent interface](docs/agent-guide.md). Reusable Claude commands are included in
`.claude/commands/`.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
