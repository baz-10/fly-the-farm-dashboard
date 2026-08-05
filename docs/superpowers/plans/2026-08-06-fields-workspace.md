# Fields Workspace Implementation Plan

1. Add regression tests for the dedicated Fields route, search coverage, direct open, Client-first Property filtering, Property map inheritance, and authoritative Field/boundary creation.
2. Add `FieldWorkspace` and delegate `view=fields` from the existing Clients route.
3. Reuse `FieldBoundaryEditor`, existing operational commands, and current detail routes; do not add persistence or API contracts.
4. Run focused tests, the full test suite, lint and production build.
5. Commit and push `codex/production-beta`, deploy to Spray Command Production Beta, run smoke verification, and open the live Fields workspace for Product Owner review.
