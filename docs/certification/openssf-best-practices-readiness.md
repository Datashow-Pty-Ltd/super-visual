# OpenSSF Best Practices badge readiness

The OpenSSF Best Practices badge is a voluntary maintainer self-certification,
not an independent security audit. Super Visual should submit for **Passing**
only when every answer is supported by public evidence and the responsible
maintainer is willing to attest that the answers are accurate.

Official program: <https://www.bestpractices.dev/>  
OpenSSF project description: <https://openssf.org/projects/best-practices-badge/>

## Public evidence already available

| Area | Repository evidence |
|---|---|
| Identity and licensing | `README.md`, `LICENSE`, package metadata, public GitHub organization repository |
| Change and contribution process | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, pull-request CI and dependency review |
| Vulnerability handling | `SECURITY.md`, GitHub private vulnerability reporting, secret scanning and push protection |
| Quality and compatibility | `npm test`, stage gates, Linux/macOS/Windows and Node 22/24 CI |
| Static, dependency, and dynamic analysis | CodeQL, `npm audit`, dependency review, Dependabot, OpenSSF Scorecard, and Jazzer.js parser fuzzing |
| Release integrity | SHA-256 checksums, CycloneDX SBOM, GitHub build-provenance attestations, pinned Actions |
| User and agent safety | JSON CLI, source compliance checks, plan/apply authorization, backup/restore, agent evals |

## Items to verify before submitting

- Confirm the public project URL, maintainer contact, and release status entered
  in the badge application.
- Enable and retain default-branch protection appropriate for the current
  maintainer team; document any temporary administrative bypass.
- Require review by a second qualified maintainer when the project has one. Do
  not claim independent review while a single maintainer authors and approves a
  change.
- Publish the first tagged release and verify its checksums, SBOM, package
  archives, and GitHub provenance attestations from a clean consumer account.
- Record the passing CI, CodeQL, dependency, secret, and Scorecard results for
  the exact release commit.
- Retain and regress every fuzzing crash from the five parser and state-machine
  targets; note that OpenSSF Scorecard currently
  does not recognize custom JavaScript fuzzers, so this control may not change
  its Fuzzing score even when the CI job passes.
- Confirm that the vulnerability-response time commitments in `SECURITY.md`
  are operationally sustainable.
- Answer every badge criterion from current evidence; mark unmet criteria as
  unmet rather than inferring compliance from an adjacent control.

## Higher assurance

Silver and Gold require stronger evidence than the initial Passing badge. A
stable 1.0 should also commission an independent review of parser boundaries,
generated code, Fabric tenant isolation, plan/apply authorization, backup and
restore, and the npm/GitHub release supply chain. The report scope, assessor,
release commit, findings, and remediation status should be published or
summarized without exposing credentials or customer data.
