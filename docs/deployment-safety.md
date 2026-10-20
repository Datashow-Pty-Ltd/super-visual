# Deployment safety

Fabric deployment is a two-step operation. `deploy plan` performs read-only
workspace and item discovery and returns a content-derived plan ID. `deploy
apply` accepts only that exact plan ID and repeats the workspace identity check
before changing anything.

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

Connection binding, refresh, and business-specific DAX acceptance are optional
post-deployment actions recorded in the reviewed plan. Binding requires an
explicit connection ID and exact source path/type match. The publisher never
guesses a connection or silently replaces an item. A release is not declared
healthy until the requested refresh and acceptance query pass.
