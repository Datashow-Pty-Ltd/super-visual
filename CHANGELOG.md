# Changelog

## Unreleased

- Simplified the normal workflow to one selected Power BI semantic-model ID:
  initialize, preview live data locally, then publish with an exact plan
  confirmation or explicit one-command pre-authorization.
- Made Hello World a searchable live catalog of the selected model and ordered
  its summary by semantic hierarchy.
- Kept report-specific deployment resources internal while retaining advanced
  contributor and recovery commands.
- Added documentation link and legacy-workflow checks to the release gate.

## 0.1.0-rc.0 — 2026-10-20

- Extracted the long-table Power BI broker runtime, contracts, compliance
  checks, semantic compiler, and source-direct adapter generator.
- Added deterministic visual, TMDL, PBIR, provenance, and hash-manifest bundles.
- Added plan/apply Fabric deployment with exact confirmation, update backups,
  semantic-first publication, report rebinding, and remote verification.
- Rebuilt AdventureWorks as a standalone, package-tested sample.
- Added JSON CLI commands, agent instructions, a portable skill, CI, and public
  project governance files.
- Corrected PBIR `version.json` generation to use Microsoft's required schema
  declaration and reject invalid version metadata before Fabric publication.
- Accepted Fabric-normalized report connection strings during post-deployment
  semantic-model binding verification while still rejecting the wrong model ID.
- Corrected generated PBIR report-format metadata to `2.0.0`, preventing a
  Fabric import from succeeding while the report exploration surface stays empty.
- Kept backup-first deployment able to inspect and repair legacy remote PBIR
  metadata while requiring all newly applied forward definitions to be current.
