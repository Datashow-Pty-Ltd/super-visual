# Release proof — 0.1.0-rc.0

This audit closes CLI product stages 10–14 on 20 October 2026. The implementation
checkpoint is commit `e66709908a1861482124bb07eb40e6d13522c646` in
`Datashow-Pty-Ltd/super-visual`.

## Requirement evidence

| Requirement | Evidence |
|---|---|
| Coherent human/agent CLI | Commander command tree and seven CLI integration tests cover help/version, discovery, inspection, initialization, Claude intake, check, compile, and verify. Every operational command supports `--json`. |
| Simplest complete example | `examples/hello-world` passes check, compile, package, embed, and manifest verification. |
| Claude-style intake | `claude-dashboard-bundle.v1`, static source/API/asset audit, deterministic generated source, embedded asset hashes, extracted compatibility runtime, and synthetic fixture. |
| Restricted-asset boundary | Extraction inventory explicitly excludes authenticated Claude source, generated AdventureWorks Claude payloads, deployment proof, and private brand/data assets. The public fixture is synthetic. |
| Semantic binding | Intake dataset IDs must already exist in the governed widget broker; the runtime materializes broker points into the declared row shape. |
| Compliance | Network calls, dynamic code, browser storage, unsafe source boundaries, unsupported APIs, dynamic dataset names, remote/undeclared assets, unsafe HTML/CSS, and Claude loaders are rejected. |
| Deterministic solution | Compiler hashes every output; `verify` reports missing, changed, or unexpected files. All three examples pass verification after packaging. |
| Safe Fabric lifecycle | Read-only discover/status, immutable workspace ID, content-hashed plans, exact confirmation, update opt-in, local/remote drift rejection, mandatory update backups, exact binding, refresh, and DAX acceptance. |
| No premature success | Apply reports `published-unverified` and `ok:false` unless connection binding, refresh, and live acceptance all pass. Status reports `accepted` only when model, report, connection, refresh, and DAX evidence agree. |
| Discoverable skill and guidance | `.claude/skills/super-visual/SKILL.md` passes the skill validator. Getting started, commands, migration, compatibility, troubleshooting, deployment safety, and AdventureWorks deployment guides cover the supported path. |
| Public packaging | `npm run release:check` packs eight Apache-2.0 public workspaces and verifies required contents. |
| Current dependency baseline | Root `npm outdated --json` is empty and `npm audit --json` reports zero vulnerabilities. Generated visuals use current packages except TypeScript 5.9.3, required by `powerbi-visuals-tools` 7.2.1's `^5.9.3` range; Super Visual itself uses TypeScript 7.0.2. |

## Automated results

- `npm test`: all contract, compliance, runtime, compiler, semantic, solution,
  Fabric-mock, AdventureWorks, CLI, and Claude-import tests passed.
- `npm run hello:package`: passed.
- `npm run example:package`: passed and produced the AdventureWorks `.pbiviz`.
- `npm run claude:package`: passed and transformed the permitted fixture through
  import, check, package, and verify.
- `npm run release:check`: eight publishable packages passed dry-run packing.
- Skill validation: `Skill is valid!`.
- GitHub Actions run
  [39385304855](https://github.com/Datashow-Pty-Ltd/super-visual/actions/runs/39385304855):
  `validate`, `package-hello-world`, `package-adventureworks`, and
  `package-claude-fixture` all passed from a clean checkout.

## External limitation

No live Fabric mutation was performed as part of this repository release audit.
That operation requires the user's exact workspace, connection, reviewed plan
ID, credentials, and explicit authorization. The mocked lifecycle suite covers
creation, blocked replacement, authorized update with backups, late-item and
local/remote drift rejection, binding, refresh success/failure, report binding,
and acceptance DAX. The live guide preserves the same gates and forbids claiming
success before service-side acceptance passes.
