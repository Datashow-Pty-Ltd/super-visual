# Deployed AdventureWorks reference

This directory records the final deployed Super Visual proof used to guide the
open-source extraction.

- `deployed-baseline.json` identifies the v38 visual package, managed semantic binding,
  report wrapper, and deployment evidence by SHA-256.
- `runtime-source-hashes.json` identifies the runtime source files that created
  the reference package.
- `visual/` retains the final visual metadata and Power BI capabilities.
- `evidence/` retains the broker and source-direct Import findings.

Run `npm run stage:2` while the original reference directory is available to
verify that every recorded file still matches. The repository does not publish
the historical binary, old build directories, tenant identifiers as active
configuration, or credentials.
