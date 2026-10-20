# CLI product roadmap

This roadmap extends the completed nine-stage extraction into a user-facing
product. A stage is complete only when its commands, documentation, automated
tests, and fresh-clone path all pass. The deployed AdventureWorks implementation
and its private `llm-power-bi` source remain the behavioural reference.

## Baseline audit

| Area | Current evidence | Gap at start of this roadmap |
|---|---|---|
| Compiler | `check`, `build`, `verify`, deterministic manifest | No scaffold, dedicated package command, or inspect surface |
| Fabric | Guarded plan/apply, backup, binding, refresh, acceptance | No read-only discovery/status command |
| Examples | Full AdventureWorks reference | No smallest useful example |
| Agent operation | `CLAUDE.md`, `AGENTS.md`, legacy commands, skill source | Skill not in Claude's project discovery path; no creation/import workflow |
| Claude Dashboard | Proven compatibility and native adapters in private reference | No public intake contract or CLI import command |
| Documentation | Architecture and AdventureWorks deployment guides | No linear fresh-clone guide or complete command reference |

The private reference's reusable adapter code may be extracted after a file-level
ownership review. Authenticated Claude source, Datashow brand assets, caches,
live identifiers, and generated deployment state must not be copied. Claude
Dashboards is a beta product without a documented stable public interchange
format, so Super Visual will own and version its intake contract.

## Delivery stages

### 10. CLI foundation and onboarding — complete

- Adopt Commander 15 and Node.js 22.12 or newer.
- Preserve `check`, `build`, `verify`, `deploy plan`, and `deploy apply`.
- Add help, version, `discover`, `inspect`, `templates`, `adapters`, `init`, the
  `compile` alias, and a dedicated `package` command.
- Add the generated `examples/hello-world` project.

Acceptance: CLI tests initialize a project in a clean temporary directory and
run `check`, `compile`, and `verify`; the committed Hello World project passes
the same path and packages to `.pbiviz`.

### 11. Claude Dashboard intake — complete

- Define `claude-dashboard-bundle.v1` with declared HTML, CSS, script, assets,
  datasets, parameters, routes, and source provenance.
- Add `supervisual import claude-dashboard` and upgrade `discover` to identify
  supported exports.
- Extract the proven `dash.*` runtime, materializer, surface, native adapter,
  and tests without restricted assets.
- Vendor and hash permitted local assets. Reject remote runtime dependencies,
  dynamic code, storage, unsafe DOM insertion, and undeclared APIs.

Acceptance: a redistributable fixture imports deterministically and passes
`import -> check -> compile -> package -> verify`; unsafe fixtures fail with
stable diagnostic codes.

### 12. Fabric discovery and lifecycle — complete

- Add read-only workspace, item, connection, and deployment-status discovery.
- Keep plan IDs immutable and require exact human authorization for apply.
- Require backups for updates and expose binding, refresh, and acceptance status.

Acceptance: mocked tests cover creation, blocked replacement, authorized update,
backup, stale-plan rejection, refresh failure, and successful live acceptance.

### 13. Agent and human experience — complete

- Install the project skill at `.claude/skills/super-visual/SKILL.md`.
- Cover the complete discover, init/import, validate, compile, package, verify,
  plan, apply, and acceptance workflow.
- Publish a getting-started guide, command reference, Claude migration guide,
  compatibility policy, and troubleshooting guide.

Acceptance: the skill passes structural validation, every documented command is
exercised in CI or explicitly marked as requiring Fabric credentials, and no
guide depends on private filesystem paths.

### 14. Release proof — complete

- Run all unit, integration, golden, security, CLI UX, example, packaging, and
  mocked deployment gates from a clean install.
- Pack every public workspace and inspect its contents.
- Push the release candidate and require green GitHub Actions checks.

Acceptance: the requirement-by-requirement completion audit has direct evidence
for every item above and reports any external limitations without weakening the
success criteria.
