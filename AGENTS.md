# Repository agent guide

Follow `CLAUDE.md` for the build and deployment contract; the instructions apply
to every coding agent, not only Claude. Prefer the JSON CLI interface over
calling package internals. Generated output is disposable and must not be edited
or committed.

Run the smallest relevant stage test while iterating and `npm test` before a
release. Any live deployment requires explicit human authorisation for the exact
plan ID and target workspace.
