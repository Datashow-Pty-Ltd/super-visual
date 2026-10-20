# Deployment safety

Fabric deployment begins with read-only `deploy discover` and `deploy status`.
`deploy diff` is also read-only and compares definition hashes for exact
same-named items, including the report's normalized semantic-model binding.
The mutation path is a two-step operation. `deploy plan` performs read-only
workspace and item discovery and returns a content-derived plan ID. `deploy
apply` accepts only that exact plan ID and repeats the workspace identity check
before changing anything. The plan ID covers each local definition hash and,
for updates, the current remote definition hash. Drift on either side requires
a new plan before any write occurs.

Apply writes an atomic progress receipt after every published and re-read item.
An interrupted deployment can resume only with a receipt bound to the same plan
ID and workspace. Each recorded item must retain its exact identity and expected
deployed hash. Resumed updates require the original pre-write backup manifest.

The planner requires a workspace ID and optionally verifies its expected name.
It rejects workspaces without Fabric capacity and rejects ambiguous duplicate
item names. Existing same-named items are blockers unless updates were enabled
when the plan was created.

Apply always publishes the semantic adapter before the report. Report PBIR is
rewritten at the deployment boundary to contain exactly one
`semanticmodelid=<id>` connection. Every update downloads and writes the
existing remote definition to the requested backup directory first. Each
published definition is downloaded again and structurally verified before the
next action begins.

All update definitions are backed up before the first remote write. The backup
manifest binds them to the source deployment plan, workspace identity, item IDs,
formats, and definition hashes. `deploy restore plan` verifies that evidence and
captures the current remote hashes. `deploy restore apply` requires explicit
authorization for the exact restore plan and rejects workspace, remote, or
backup drift. Restored definitions remain `restored-unverified` until connection,
refresh, DAX, and report-binding status are checked again.

Connection binding, refresh, and business-specific DAX acceptance are explicit
post-deployment actions recorded in the reviewed plan. Binding requires an
explicit connection ID and exact source path/type match. The publisher never
guesses a connection or silently replaces an item. A release is not declared
healthy until the requested refresh and acceptance query pass. A publication
without all three is reported as `published-unverified`, never as accepted.
