# Troubleshooting

## Input is detected but unsupported

`discover` deliberately does not guess an arbitrary HTML/JavaScript layout.
For Claude-style input, add a valid `claude-dashboard.json` manifest and run the
adapter's `--inspect-only` mode for specific diagnostics.

## Dataset is absent from the widget broker

The intake manifest's dataset IDs must exactly match `widgets[].id` in the
target project's widget-broker contract. Define the governed semantic and
broker binding first; do not rename a dashboard read silently.

## Asset is undeclared or external

Move the asset into the bundle, add its normalized relative path to `assets`,
and reference that same path from HTML or CSS. Remote URLs, data URLs supplied
by the source, and JavaScript asset loading are rejected. The importer owns
inlining and hashing.

## A package compiles but verify fails

Generated output changed after the manifest was written. Re-run `package`; do
not edit `dist/`. If unexpected files remain, remove only the project's ignored
output directory and rebuild.

## Power BI visual tooling and TypeScript

Super Visual itself uses the latest TypeScript. Generated Power BI visual
projects use TypeScript 5.9.3 because the current `powerbi-visuals-tools` 7.2.1
dependency range is `^5.9.3` and its lint stack crashes on TypeScript 7. This is
an upstream compatibility pin, not a legacy-project constraint.

## Fabric plan has blockers

Do not apply it. Re-run discovery/status, confirm the immutable workspace ID,
resolve name collisions or missing artifacts, and create a new plan. Never edit
a plan JSON file or infer `--allow-updates`.
