# Live certification record

Copy this file for each live run. Do not record access tokens, credentials,
connection secrets, source rows, or customer data.

- Date and time (UTC):
- Super Visual commit and version:
- Operator:
- Environment classification: disposable sandbox / controlled test
- Workspace ID:
- Expected workspace name:
- Selected Power BI semantic model name and ID:
- Deployment-result semantic model ID (copy from `publish`; not a user input):
- Report item name and ID:
- Deployment-result connection ID:
- Deployment plan ID:
- Plan operations: create / update
- Advanced source-profile hash or approved identifier (only when overridden):
- Package manifest verification: pass / fail
- Connection binding: pass / fail
- Latest refresh: completed / failed
- Acceptance DAX evidence: row count, column count, non-null
- Final CLI status: accepted / published-unverified / failed

## Browser acceptance

- Report opens without an error.
- The Super Visual custom visual renders.
- All expected labels and values are visible.
- Keyboard navigation reaches the visual and its interactive controls.
- Selection changes the expected visual state.
- No unexpected network, console, or custom-visual errors are observed.

## Evidence

Record links to redacted CI artifacts, release attestations, screenshots, and
the saved deployment receipt. Never attach a token-bearing terminal transcript.

Create the machine-readable companion by copying `live-run.example.json`,
replacing every placeholder and hash, and running `supervisual certify validate
<record> --json`. Keep failed or incomplete records as evidence; do not change
their booleans merely to make validation pass.

## Exceptions and cleanup

Record any accepted risk, follow-up issue, and retention or separately
authorized cleanup action.
