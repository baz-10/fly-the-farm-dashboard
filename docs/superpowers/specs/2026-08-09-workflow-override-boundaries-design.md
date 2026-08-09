# Workflow Override Boundaries Design

## Goal

Connect the four inert workflow maturity overrides to the narrowest customer-visible workflow regions without changing current usable behavior, permissions, APIs, persistence, routes, or parent module context.

## Boundary placement

- `mission-workspace/reports`: keep Mission readiness and authorisation controls outside the boundary. Gate Mission Pack generation/status together in `MissionAuthorisation`. In completed Mission closeout, one composition-level boundary wraps the combined `MissionSummary` and `MissionRecord` subtree, so neither child mounts when the workflow is Coming Soon.
- `operating-authority/authority-records`: preserve ReOC back navigation and page heading. Gate an extracted authority-record management body containing its messages, add controls, editor, and register.
- `controlled-checklists/administration`: preserve the Checklists heading and explanation. Gate an extracted administration body containing create/version/publish controls and template history.
- `controlled-checklists/execution`: gate an extracted `MissionChecklists` execution body, leaving the containing Mission workspace stage visible.

Every production file imports `WorkflowMaturityBoundary` directly from its canonical `components/productMaturity/WorkflowMaturityBoundary` module with exact static module and workflow code literals.

## Runtime isolation

Extracted child components own workflow hooks and API creation. When an override is `COMING_SOON`, the boundary renders the safe maturity surface without mounting the constrained child or starting its API reads. MissionAuthorisation keeps its broader authorisation hooks active because that parent workflow remains available; its report child UI and report-status component do not mount.

## Presentation deduplication

`WorkflowMaturityBoundary` always resolves and validates the exact workflow override and its parent module entry. When the active parent surface is for the same module and both entries have the same maturity, the parent surface already communicates that state, so the workflow boundary renders children directly without a second badge or workspace. When the module or states differ, the workflow boundary presents the override normally.

The completed-Mission report boundary belongs at the `MissionOperationalCloseout` composition point around the combined Mission Summary and Mission Record subtree. This produces one Coming Soon workspace with one valid heading ID and prevents both report-status children from mounting. `MissionAuthorisation` retains its separate single report boundary because Mission Pack generation is a distinct stage. Mission Summary and Mission Record do not own boundaries individually.

The Controlled Checklists page keeps its original responsive title row, including the Create action at the opposite edge. Only the extracted administration body remains inside the workflow boundary, preserving API isolation when constrained.

## Tests

Each relevant component test temporarily changes the exact registry entry to `COMING_SOON`, restores it after the test, and asserts:

- the safe Coming Soon surface is visible;
- workflow-specific controls/status are absent;
- the surrounding page or mission-stage context remains visible; and
- extracted workflow APIs do not start where the gated child owns them.

Normal tests continue proving the current maturity states leave all workflows usable.

Integration coverage renders ReOC and Controlled Checklists inside their real `ProductMaturitySurface` parent and asserts exactly one Beta indicator. Completed closeout coverage asserts one Coming Soon workspace, a unique `aria-labelledby` target, and non-mounting of both report-status children.
