# Nine-stage implementation roadmap

1. **Complete.** Capture the architecture, constraints, decisions, extraction inventory, and
   public contracts.
2. **Complete.** Freeze the deployed AdventureWorks visual, semantic adapter, PBIR wrapper,
   runtime sources, and acceptance evidence as a hash-verified golden baseline.
3. **Complete.** Extract the contracts, compiler, compliance rules, and Power BI runtime into
   independent packages.
4. **Complete.** Add semantic-model reference validation and adapter generation.
5. **Complete.** Produce one solution bundle containing the visual, semantic adapter, PBIR,
   compliance report, provenance, and deployment plan.
6. **Complete.** Extract safe Fabric plan, apply, binding, refresh, and verification tools.
7. **Complete.** Rebuild AdventureWorks as a standalone sample consumer and document local
   and Fabric deployment.
8. **Complete.** Add stable JSON commands plus `AGENTS.md`, `CLAUDE.md`, and a portable skill
   for agent operation.
9. **Complete.** Add CI, package metadata, contribution and security documentation, release
   checks, and the `0.1.0` release candidate.

Each stage has an automated acceptance command under `npm run stage:<n>`. The
full release-candidate gate is `npm run stage:9`.

Stages 10–14 turn the extracted engine into a complete user-facing CLI,
including initialization, a minimal example, Claude Dashboard intake, expanded
Fabric discovery, installed agent skills, and fresh-clone release proof. Their
requirements and acceptance criteria are tracked in the
[CLI product roadmap](cli-product-roadmap.md).
