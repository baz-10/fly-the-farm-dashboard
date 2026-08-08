# Final Repair Package H: Workflow Override Boundaries

## Status

Completed locally. No push or deployment was performed.

## Repairs

- Wired `mission-workspace/reports` to the actual report workflow surfaces:
  - Mission readiness and PIC authorisation remain available in `MissionAuthorisation`; only Mission Pack generation and report status are constrained.
  - In completed Mission closeout, one composition-level boundary wraps `MissionSummary` and `MissionRecord`; when constrained, one Mission Reports workspace replaces the combined subtree and neither child mounts.
- Wired `operating-authority/authority-records` below the ReOC page heading and Back navigation. The extracted record-management body owns its API and hooks, so it does not mount when constrained.
- Wired `controlled-checklists/administration` below the Checklists page heading and explanation. The extracted administration body and template API do not mount when constrained.
- Wired `controlled-checklists/execution` around an extracted Mission checklist execution body. The containing Mission stage remains responsible for parent context, while checklist and Personnel APIs do not mount when constrained.
- Every boundary uses the exact direct canonical `WorkflowMaturityBoundary` import convention and exact static module/workflow literals required by CI.
- Registry maturity values remain unchanged, so all four workflows remain usable in their current states.
- No permission, API, persistence, route, entitlement, or navigation behavior changed.

## TDD Evidence

- RED: six new tests failed before production changes because each override remained inert; workflow controls/status remained visible and extracted-body API reads still started.
- GREEN: the six focused suites passed 16 tests after the direct boundaries and local inner workflow bodies were added.
- Each new test temporarily changes one exact override to `COMING_SOON`, proves only that workflow is replaced by its safe maturity surface, proves parent context remains, and restores the registry entry.

## Governance correction

- The first strict verifier run rejected component-relative imports that resolved correctly but did not use the repository's literal canonical path suffix.
- The Mission Authorisation and Mission Operational Closeout composition points use the exact direct `../../components/productMaturity/WorkflowMaturityBoundary` import convention; pages use the exact direct `../components/productMaturity/WorkflowMaturityBoundary` convention.

## Review corrections

- Workflow maturity presentation is now deduplicated only when the active parent product surface is for the same module and the exact workflow override has the same maturity. This leaves ReOC and Controlled Checklists with one Beta marker while preserving independently constrained workflows embedded in another module's page.
- The reports boundary now belongs to `MissionOperationalCloseout` and composes Mission Summary and Mission Record as one workflow surface. A constrained completed Mission therefore renders one uniquely labelled Mission Reports workspace and mounts neither report child nor its API status component. The distinct Mission Pack boundary remains in Mission Authorisation.
- Controlled Checklists restores the Create action to the responsive title row while its administration body still owns the template API and remains unmounted when constrained.
- Review RED evidence covered duplicate Beta presentation on ReOC and Checklists, duplicate reports workspaces and IDs in completed closeout, and title-row placement. The focused corrective batch subsequently passed 8 suites and 30 tests; after adding active-surface scoping, the directly affected regression batch passed 5 suites and 24 tests.

## Verification

- Focused workflow tests: 6 suites, 16 tests passed.
- Product maturity governance and surface batch: 5 suites, 115 tests passed.
- Product maturity registry verifier passed: 46 modules, 12 workflows, 53 App routes, 148 customer UI source files, 64 evidence references, and zero customer-facing Legacy violations.
- Full test suite passed: 207 suites, 1009 tests.
- Optimized production build succeeded with the repository's existing lint and bundle-size warnings.
- `git diff --check` passed.
- No push or deployment.
