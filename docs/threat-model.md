# Threat model

## Protected assets

- Fabric and Power BI access tokens and connection identifiers.
- Customer semantic metadata, data, workspace definitions, and backups.
- Integrity of compiled visual, managed semantic binding, PBIR, manifest, and release
  artifacts.
- Human control over the exact tenant mutation being authorized.

## Trust boundaries

Dashboard bundles, YAML and JSON contracts, source assets, DAX files, remote
Fabric definitions, and dependency packages are untrusted. The Azure CLI token
cache, Fabric and Power BI APIs, GitHub Actions OIDC identity, and the target
workspace are external trust boundaries. Generated `dist/` output is evidence of
a build, not editable source.

## Principal threats and controls

| Threat | Primary controls |
| --- | --- |
| Malicious dashboard code exfiltrates data | Static source policy; no arbitrary network, dynamic code, browser storage, unsafe HTML, or direct host APIs |
| Archive or definition path escapes its destination | Resolve-and-prefix path checks; schema validation; generated-root separation |
| Agent deploys to the wrong workspace | Immutable workspace ID plus expected-name and capacity checks |
| Unreviewed overwrite destroys a report | Create-only default; explicit `--allow-updates`; remote hash in plan; mandatory backup |
| Plan changes between review and apply | Content-derived plan ID; exact confirmation; local and remote drift checks |
| Upload is mistaken for a healthy release | `published-unverified` state until binding, refresh, DAX, and report binding pass |
| Credentials leak through artifacts or logs | Runtime Azure CLI token retrieval; plans and receipts exclude tokens; secret scanning and push protection |
| Dependency or CI action is compromised | Lockfile, dependency review, audit, SBOM, pinned action commits, Scorecard, and release attestations |
| Release asset differs from reviewed source | SHA-256 checksums and GitHub build-provenance attestations |

## Residual risks

Static checks cannot prove arbitrary React and dependency code is benign. Fabric
and Power BI service behavior can change independently of this project. Tenant
administrators can weaken workspace, custom-visual, gateway, or identity
controls. A compromised maintainer or GitHub organization can still affect
source and release policy. Consumers should pin releases, verify attestations,
review the SBOM, test in an isolated workspace, and apply least privilege.

The threat model is reviewed whenever the importer, compiler policy, deployment
protocol, authentication mechanism, or release pipeline changes.
