# Final Repair Package J: Fail-Closed Visible-String Limits

## Status

Reviewer follow-up completed locally. No push or deployment was performed.

## Commit

- Original repair: `1084ab36267095be8d32f89f6c642d24c4b1a382` — `FIX: fail closed on visible copy limits`
- Reviewer follow-up: the commit containing this report.

## Repairs

- Visible-copy resolution now separates path-local cycle detection from shared aggregate visit budgets for each root visible expression.
- Sibling recursion branches receive independent node/symbol paths, preventing one branch from suppressing a statically composed `Legacy` candidate in another.
- Limits are 32 resolution levels, 4096 aggregate AST node visits, a separate 1024 aggregate symbol visits, and 256 deduplicated candidates.
- The node counter is shared across every resolved helper body and return branch; the symbol counter is shared across shallow breadth as well as deep paths.
- Genuine nonvisible cycles still terminate safely without executing application code.
- Isolated local and imported 36-hop helper/composition fixtures containing fragmented `Legacy` copy fail specifically on the depth limit.
- A clean 28-hop helper fixture passes, preserving supported near-limit composition and existing nonvisible false-positive controls.

## Verification

- Verifier passed: 46 modules, 12 workflows, 53 App routes, 148 customer UI sources, 64 evidence references, zero customer-facing violations.
- The typed cyclic `left`/`right` fixture rejects composed `Legacy` copy; a genuine nonvisible cycle terminates successfully.
- A two-return helper above 4096 aggregate visits fails on the node budget, while a paired fixture at exactly 4096 passes.
- A shallow 1025-symbol fixture fails independently on the symbol budget below the node and depth limits.
- Complete focused boundary suite passed all 72 tests.
- Existing candidate deduplication, repository path containment, Founder approval, changelog, workflow-boundary, and no-environment-access safeguards remain intact.
- No push or deployment was performed.
