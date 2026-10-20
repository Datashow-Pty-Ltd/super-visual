# Extraction inventory

The working reference is `/Users/djodonnell/Documents/Development/llm-power-bi`.
It is an extracted working directory rather than a Git checkout, so the golden
baseline records content hashes for the deployed assets.

| Reference area | Classification | Public destination | Treatment |
|---|---|---|---|
| `custom-visuals/datashow-super-dashboard/src/{visual,dataView,dependency,filter,model,reportRuntime}.ts*` | Reusable Power BI runtime | `packages/runtime-powerbi` and visual template | Extract with behaviour tests |
| Generated registries and filter targets | Project output | Compiler output | Replace checked-in values with generators |
| `src/report-app/validate-*.mjs` | Reusable compiler policy | `packages/compiler` and `packages/compliance` | Split core and design policy |
| `scripts/instantiate-super-visual.mjs` | Compiler prototype | `packages/compiler` | Preserve validation and safe-path behaviour |
| `src/semantic/*` | Semantic compiler | `packages/semantic-powerbi` | Extract parameterised compiler |
| `src/report/*` and report scripts | PBIR compiler | `packages/report-powerbi` | Extract target-specific wrapper compiler |
| `src/fabric/*` | Deployment implementation | `packages/deployment-fabric` | Extract plan/apply/verify boundary; remove environment defaults |
| `templates/workflow/*.schema.json` | Versioned contracts | `packages/contracts/schemas` | Copy relevant schemas and add public project/build schemas |
| `generated/semantic-model.yaml` | AdventureWorks input | `examples/adventureworks/semantic` | Retain as sample asset |
| AdventureWorks React source and fixtures | Golden sample | `examples/adventureworks` | Retain source, fixtures, tests, and expected evidence |
| Datashow logos and Claude Dashboard source | Brand/design assets | Optional policy/example assets | Exclude until ownership and redistribution are explicit |
| `.env`, `.cache`, `node_modules`, old `dist`, live IDs | Secret/build/deployment state | None | Exclude |

## Extraction rule

AdventureWorks must build using only files inside this repository and declared
package dependencies. A successful extraction contains no filesystem reference
to `llm-power-bi`.
