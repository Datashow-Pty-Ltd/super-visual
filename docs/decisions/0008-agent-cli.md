# 0008: Use the CLI as the agent interface

Status: accepted

People, CI jobs, and coding agents use the same non-interactive CLI. JSON
output, stable diagnostic codes, saved deployment plans, and explicit artifact
paths form the tool contract. Agent instruction files describe the workflow
without duplicating compiler or deployment logic.
