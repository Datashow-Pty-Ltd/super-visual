# Nine-stage implementation roadmap

1. Capture the architecture, constraints, decisions, extraction inventory, and
   public contracts.
2. Freeze the deployed AdventureWorks visual, semantic adapter, PBIR wrapper,
   runtime sources, and acceptance evidence as a hash-verified golden baseline.
3. Extract the contracts, compiler, compliance rules, and Power BI runtime into
   independent packages.
4. Add semantic-model reference validation and adapter generation.
5. Produce one solution bundle containing the visual, semantic adapter, PBIR,
   compliance report, provenance, and deployment plan.
6. Extract safe Fabric plan, apply, binding, refresh, and verification tools.
7. Rebuild AdventureWorks as a standalone sample consumer and document local
   and Fabric deployment.
8. Add stable JSON commands plus `AGENTS.md`, `CLAUDE.md`, and a portable skill
   for agent operation.
9. Add CI, package metadata, contribution and security documentation, release
   checks, and the `0.1.0` release candidate.

Each stage has an automated acceptance command under `npm run stage:<n>`.
