# 0007: Use plan-based deployment

Status: accepted

Deployment first resolves prerequisites and writes a read-only plan. Applying
the saved plan creates new items by default. Updating existing definitions
requires an explicit option recorded in the plan. Verification writes a result
manifest containing item IDs, refresh status, query evidence, and report URL.
