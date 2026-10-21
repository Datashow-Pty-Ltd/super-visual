# Changelog

## 0.1.0-rc.5 — 2026-10-21

- Fixed global npm installations by declaring and resolving the Power BI runtime package instead of relying on the monorepo directory layout.
- Added live, animated progress for every major `supervisual dev` startup stage.
- Added a concise human-readable preview-ready summary and command-specific recovery guidance.

## 0.1.0-rc.4 — 2026-10-21

- Write human progress synchronously to the terminal file descriptor so stage
  updates cannot remain queued behind long validation work.
- Split live semantic validation into visible workspace lookup, model lookup,
  definition download, structure inspection, and optional acceptance-query
  milestones instead of one opaque validation step.

## 0.1.0-rc.3 — 2026-10-21

- Stream each `init` stage to stderr as soon as it begins so progress remains
  visible in terminal hosts that buffer stdout or discard overwritten lines.
- Keep a permanent stage-start line while an ASCII spinner animates beneath it
  in interactive terminals, followed by the completed check line.

## 0.1.0-rc.2 — 2026-10-21

- Reject malformed workspace and semantic-model IDs locally during `init`,
  before sending a Fabric request, with the invalid value length and expected
  GUID format in the error.
- Lead terminal failures with a plain-language summary and corrective action,
  followed by labelled technical details, and animate in-progress `init` steps
  with an ASCII spinner in interactive terminals.

## 0.1.0-rc.1 — 2026-10-21

- Simplified the normal workflow to one selected Power BI semantic-model ID:
  initialize, preview live data locally, then publish with an exact plan
  confirmation or explicit one-command pre-authorization.
- Made Hello World a searchable live catalog of the selected model and ordered
  its summary by semantic hierarchy.
- Kept report-specific deployment resources internal while retaining advanced
  contributor and recovery commands.
- Added documentation link and legacy-workflow checks to the release gate.
- Replaced the default `init` JSON dump with a narrated terminal workflow and
  a clearly labelled initialization manifest.
- Added read-only workspace and semantic-model verification when a complete
  Fabric binding is supplied, followed by six reported local validation checks.
- Preserved strict single-object output for agents and scripts using `--json`.

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
