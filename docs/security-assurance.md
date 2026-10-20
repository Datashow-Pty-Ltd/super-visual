# Security assurance

Super Visual publishes evidence that maintainers and users can inspect. No
automated scan proves that software is safe, and this project does not describe
itself as independently certified unless a named third party has completed and
published the corresponding assessment.

## Continuous evidence

The public repository uses these controls:

- GitHub CodeQL with the `security-extended` JavaScript and TypeScript queries
  on pushes, pull requests, and a weekly schedule.
- GitHub dependency review on pull requests, blocking newly introduced
  dependencies with moderate-or-higher known vulnerabilities.
- `npm audit --audit-level=moderate` and a CycloneDX production-dependency SBOM
  in CI.
- OpenSSF Scorecard with results uploaded to GitHub code scanning and published
  for the public Scorecard badge.
- GitHub secret scanning and push protection.
- Dependabot vulnerability alerts, security updates, and weekly npm and GitHub
  Actions update checks.
- Cross-platform tests on Linux, macOS, and Windows, plus Node.js 22 and 24.
- Coverage-guided Jazzer.js fuzzing in CI for source-policy parsing, TMDL
  inspection, and every public JSON contract schema, with retained crash inputs.
- Full commit-SHA pinning for third-party GitHub Actions.
- GitHub artifact attestations and SHA-256 checksums for tagged release assets.
- Private vulnerability reporting through GitHub Security Advisories.

Run the local checks with:

```bash
npm ci --ignore-scripts
npm test
npm run security:audit
npm run security:sbom
npm run security:fuzz
```

The generated `.artifacts/security/sbom.cdx.json` file is disposable. Tagged
releases attach the SBOM, checksums, and attestations to the release.

The latest point-in-time results and reviewed CodeQL dispositions are recorded
in [`docs/certification/security-scan-proof.md`](certification/security-scan-proof.md).

## Security boundaries

Super Visual treats dashboard imports, project contracts, generated-definition
parts, Fabric responses, and DAX acceptance files as untrusted input. The
compiler validates schemas and source policy; generated paths are constrained to
their intended roots; and the visual application cannot use dynamic code,
browser storage, unsafe HTML, arbitrary network access, or direct Power BI host
APIs.

Fabric mutation has a separate boundary. A plan records the immutable workspace
identity, local content hashes, remote hashes for updates, intended operations,
and a content-derived plan ID. Apply requires explicit human authorization for
that exact plan ID and target workspace. Updates require recoverable backups.
Publication is reported as `published-unverified` until binding, refresh, and
live DAX acceptance succeed.

The Azure CLI supplies access tokens at runtime. Super Visual does not write
those tokens into plans, manifests, logs, or deployment receipts. Users remain
responsible for least-privilege identities, Fabric workspace access, gateway and
connection configuration, source-system security, and reviewing imported
business assets before publication.

## Badges and certification path

The OpenSSF Scorecard badge is an automated assessment of repository security
practices. The OpenSSF Best Practices badge is a voluntary self-certification
against published criteria. Neither is a penetration test or a warranty.

The project will pursue the OpenSSF Best Practices **Passing** badge after the
public release process, contribution policy, test evidence, and vulnerability
response process are all verifiable from the repository. Silver and Gold can be
considered after coverage targets, governance, review independence, and signed
release requirements are consistently met.

The evidence map and honest pre-submission checklist are maintained in
[`docs/certification/openssf-best-practices-readiness.md`](certification/openssf-best-practices-readiness.md).

For a stable 1.0 release, the meaningful independent assurance is a scoped
third-party security review covering:

- dashboard import and archive/path handling;
- compiler policy bypasses and generated JavaScript;
- plan/apply drift and authorization controls;
- backup and restore integrity;
- Fabric and Power BI token, connection, and tenant isolation;
- dependency and release supply-chain integrity; and
- the deployed custom visual's browser sandbox behavior.

Organization-level attestations such as ISO 27001 or SOC 2 assess Datashow's
broader security management and operational controls; they are not source-code
certificates and must not be represented as proof that a particular release is
defect-free.
