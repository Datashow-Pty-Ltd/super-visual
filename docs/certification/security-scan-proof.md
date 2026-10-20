# Security scan proof — 20 October 2026

This is a point-in-time assurance record, not a warranty or an independent
certification. The code-hardening checkpoint is commit
`5f2438819c8d63589b0db9f631224963f6ba3874` in
`Datashow-Pty-Ltd/super-visual`.

## Automated evidence

| Control | Result | Public evidence |
|---|---|---|
| Cross-platform CI, packaging, supply chain, and fuzzing | Passed on Linux, macOS, and Windows; Node 22 and 24; Hello World, AdventureWorks, and Claude fixture packaged; 30,000 fuzz cases completed | [CI run 39396147822](https://github.com/Datashow-Pty-Ltd/super-visual/actions/runs/39396147822) |
| CodeQL security-extended | Workflow passed with zero open CodeQL tool alerts | [CodeQL run 39396147733](https://github.com/Datashow-Pty-Ltd/super-visual/actions/runs/39396147733) |
| OpenSSF Scorecard | Workflow passed and SARIF published | [Scorecard run 39396147684](https://github.com/Datashow-Pty-Ltd/super-visual/actions/runs/39396147684) |
| npm dependency audit | Zero known vulnerabilities at moderate-or-higher severity | CI `supply-chain` job and local `npm run security:audit` |
| Dependency alerts | Zero open Dependabot security alerts | GitHub Security at the recorded time |
| Secret alerts | Zero open secret-scanning alerts; push protection enabled | GitHub Security at the recorded time |
| Release inventory | CycloneDX SBOM generation and eight npm package dry runs passed | CI `supply-chain` and `npm run release:check` |
| Parser fuzzing | Jazzer.js continuously exercises source-policy, TMDL inventory, and public contract-schema boundaries | CI `fuzz` job and `npm run security:fuzz` |
| Agent operation | Claude and Codex passed explicit, implicit, negative, and deployment-authorization evals | [`agent-skill-proof.md`](agent-skill-proof.md) |

## CodeQL disposition

The first scan was used as a remediation gate rather than a badge-only check.
Thirteen CodeQL alert records were fixed, including every reported polynomial
regex denial-of-service path, the Claude adapter file-system race, and the
original unconstrained network-flow locations.

Three alerts were dismissed after review because they describe required product
behavior, with their mitigations recorded in GitHub:

- Fabric deployment sends validated definitions only to the pinned HTTPS
  `api.fabric.microsoft.com` origin or the HTTPS regional Fabric operation
  hosts under `*.analysis.windows.net`; other hosts and redirects are rejected.
- DAX acceptance sends the operator-selected query only to the pinned HTTPS
  `api.powerbi.com` origin and returns aggregate evidence rather than row data.
- Backup writes an explicitly selected remote Fabric definition only after
  definition type, path, payload, per-part size, total size, and rooted output
  containment checks.

After those dispositions, there were zero open CodeQL tool alerts. Dismissal is
not the same as proof of absence; reviewers should inspect the comments and the
corresponding boundaries when those flows change.

## Repository posture and remaining gaps

Default-branch protection now requires the cross-platform test/package jobs,
supply-chain scan, continuous fuzzing, CodeQL, an up-to-date branch,
pull-request flow, linear history, and resolved review conversations. Force
pushes and deletion are disabled. Administrative bypass remains available for
repository recovery, and zero approving reviews are required while the project
has a single active maintainer; this is not independent code review.

The remaining OpenSSF Scorecard advisories are transparent roadmap items:

- obtain the OpenSSF Best Practices badge through truthful maintainer
  self-certification;
- establish review by a second qualified maintainer;
- accumulate maintained-project history; and
- extend continuous fuzzing from the current contract, source-policy, and TMDL
  targets into full dashboard-import and Fabric-definition state machines.

The first stable release should additionally commission the scoped independent
review described in [`security-assurance.md`](../security-assurance.md).
