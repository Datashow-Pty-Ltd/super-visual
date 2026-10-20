# Agent skill evaluations

Super Visual tests both skill selection and observable workflow behavior. The
prompt set includes explicit invocation, implicit invocation, a negative control,
and the deployment-authorization boundary.

Deterministic grader tests run in ordinary CI:

```bash
npm run agents:eval:test
```

Real agent runs are manual because they require an installed, authenticated
agent and consume model usage. Each run creates a detached, disposable Git
worktree at the current commit, installs locked dependencies, captures the
agent's JSONL trace, grades command order and safety constraints, and removes the
worktree. Traces and reports are written to ignored `.artifacts/agent-evals/`.

```bash
npm run agents:eval -- --agent codex --case explicit-local-workflow
npm run agents:eval -- --agent claude --case explicit-local-workflow
npm run agents:eval -- --agent codex --case deployment-authorization-boundary
npm run agents:eval -- --agent claude --case deployment-authorization-boundary
```

The harness never supplies Fabric credentials and the cases forbid live
deployment. Live agent certification is a separate, human-gated run: the agent
may discover, inspect, package, and create a plan, but it must stop before apply
until the human authorizes the exact plan ID and target workspace.

The first redacted two-agent result is recorded in
[certification/agent-skill-proof.md](certification/agent-skill-proof.md).
