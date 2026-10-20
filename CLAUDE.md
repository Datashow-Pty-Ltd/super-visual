# Super Visual agent instructions

Work from the repository root and treat `supervisual.yaml` as the project entry
point. Do not edit generated `dist/` content. Change the project contracts or
source assets, run `check`, then rebuild.

## Required workflow

1. Run `npm ci` once when dependencies are absent.
2. Run `npx supervisual discover <input> --json` for unknown input, or
   `npx supervisual inspect <project> --json` for an existing project.
   For a supported Claude-style bundle, run the import command with
   `--inspect-only` before allowing it to update a project.
3. Run `npx supervisual check <project> --json` and resolve every diagnostic.
4. Run `npx supervisual compile <project> --json` while iterating. Run
   `npx supervisual package <project> --json` when a deployable `.pbiviz` and
   embedded PBIR resource bundle are required.
5. Run `npx supervisual verify <project> --json`. Do not deploy a bundle whose
   manifest verification fails.
6. Run `deploy discover` before planning, then run `deploy plan` before every Fabric change. Report its workspace ID, exact
   item names, operations, blockers, and plan ID.
7. Run `deploy apply` only when the human explicitly authorises that exact plan
   ID. Never infer `--allow-updates`; updates replace full remote definitions.
8. Run `deploy status` with the returned item IDs. Treat
   `published-unverified` or `observed` as incomplete, not success.

Use `--json` for automation. A non-zero exit status or `ok: false` is a failed
tool call. A deployment plan with blockers is not applyable.

## Boundaries

- Keep React application code free of network access, dynamic code, browser
  storage, unsafe HTML, Power BI APIs, and preview fixtures.
- Bind data only through the eight-field broker contract.
- Treat `claude-dashboard-bundle.v1` as a Super Visual contract, not an
  Anthropic export standard. Keep private/authenticated source and brand assets
  out of public fixtures.
- Never add business-specific behavior to `packages/runtime-powerbi`.
- Never mutate the reusable base model to satisfy one report. Generate a
  report-specific semantic adapter.
- Preserve GUID and version identity intentionally. Increment the fourth visual
  version component for every package intended to replace a deployed visual.
- Use a Fabric workspace ID. A display name alone is not a safe deployment
  target.
- Before an update, retain the downloaded backup produced by the apply command.
- Connection binding, refresh, and live interaction acceptance are required
  environment checks after publication; do not claim success from upload alone.

The canonical sample is `examples/adventureworks`. Its provenance and human
deployment steps are in that directory.
