# Workflow Override Boundaries Design

## Goal

Connect the four inert workflow maturity overrides to the narrowest customer-visible workflow regions without changing current usable behavior, permissions, APIs, persistence, routes, or parent module context.

## Boundary placement

- `mission-workspace/reports`: keep Mission readiness and authorisation controls outside the boundary. Gate Mission Pack generation/status together in `MissionAuthorisation`, and gate only `ReportArtefactStatus` in `MissionSummary` and `MissionRecord` so their explanatory stage context remains visible.
- `operating-authority/authority-records`: preserve ReOC back navigation and page heading. Gate an extracted authority-record management body containing its messages, add controls, editor, and register.
- `controlled-checklists/administration`: preserve the Checklists heading and explanation. Gate an extracted administration body containing create/version/publish controls and template history.
- `controlled-checklists/execution`: gate an extracted `MissionChecklists` execution body, leaving the containing Mission workspace stage visible.

Every production file imports `WorkflowMaturityBoundary` directly from its canonical `components/productMaturity/WorkflowMaturityBoundary` module with exact static module and workflow code literals.

## Runtime isolation

Extracted child components own workflow hooks and API creation. When an override is `COMING_SOON`, the boundary renders the safe maturity surface without mounting the constrained child or starting its API reads. MissionAuthorisation keeps its broader authorisation hooks active because that parent workflow remains available; its report child UI and report-status component do not mount.

## Tests

Each relevant component test temporarily changes the exact registry entry to `COMING_SOON`, restores it after the test, and asserts:

- the safe Coming Soon surface is visible;
- workflow-specific controls/status are absent;
- the surrounding page or mission-stage context remains visible; and
- extracted workflow APIs do not start where the gated child owns them.

Normal tests continue proving the current maturity states leave all workflows usable.
