# Contributing

Thank you for helping make governed analytical applications easier to build and
inspect.

Open an issue before a large architectural change. For code changes, create a
focused branch, preserve existing project contracts, and include tests that
exercise observable behavior. Run:

```bash
npm ci --ignore-scripts
npm test
npm run example:test
```

Changes to the Power BI runtime or visual template should also pass `npm run
example:package`. Do not commit generated `dist/`, `.pbiviz`, credentials,
Fabric plan files, workspace IDs, or downloaded production definitions.

Pull requests should explain the user problem, the contract or package changed,
the verification performed, and any compatibility or deployment impact. By
contributing, you agree that your contribution is licensed under Apache-2.0.
