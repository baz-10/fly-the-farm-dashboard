# Mission Workspace Refinement Design

**Status:** Product Owner approved direction; written specification pending final review  
**Priority:** P1  
**Requirements:** `SC-011`, `SC-012`, `SC-013`, `IMP-MIS-002`

## Purpose

The Mission Planner becomes the primary operational workspace for moving one Mission through its complete lifecycle. It must show the operator where the Mission is, what needs attention, and the next useful action without presenting every lifecycle form at once.

This is a Mission Workspace, not a wizard. The work has a natural sequence, but navigation remains non-linear. Authoritative evidence controls completion and readiness; page visitation never does.

## Approved Direction

The workspace displays one active stage at a time while keeping the complete Mission lifecycle visible. The operator may open any available stage, revisit completed stages, and review stages marked Needs Review. `Save & Next` saves through the existing authoritative command and advances sequentially only after the save succeeds.

The implementation reuses the existing Mission components, routes, APIs, permissions, evidence models, audit behaviour, tenant boundaries, operating-location scope, optimistic concurrency, and downstream invalidation rules. It does not introduce a new Mission architecture or duplicate lifecycle logic.

## Workspace Structure

### Mission context bar

The persistent context bar displays:

- Breadcrumb: Client > Property > Field > Mission.
- Mission number and title.
- Operating location.
- Scheduled time where known.
- Current plain-language Mission status.
- Last authoritative save state.

Each available breadcrumb parent opens its existing authoritative workspace. The context bar remains visible while moving between Mission stages and collapses to a compact readable form on smaller screens.

### Mission stepper

The complete stepper remains visible and uses these concise labels:

1. Mission
2. Map
3. Resources
4. Weather & Chemicals
5. JSA
6. Review
7. Operational Closeout
8. Mission Outcomes
9. Customer Outcome

The stepper communicates location and evidence state, not permission to navigate. Every available stage remains clickable. Completed stages remain accessible. The active stage is unmistakable. Needs Review remains visible until the affected evidence is reviewed and saved.

Unavailable lifecycle stages remain visible with a plain-language explanation:

- Operational Closeout: `Available after Mission Authorisation`.
- Mission Outcomes: `Available after Completion`.
- Customer Outcome: `Available after Completion`.

Unavailable stages may be selected to reveal their prerequisite explanation, but they must not expose mutating controls prematurely or trap the operator in a dead end.

### Active workspace

Only the selected stage occupies the primary work area. Existing authoritative components move into their relevant stage without changing their data contracts:

- **Mission:** Mission details and inherited Client, Property, Field and Job context.
- **Map:** Mission boundary, operational features, imports, notes and map revision history.
- **Resources:** Aircraft, Equipment Kits and Personnel assignments.
- **Weather & Chemicals:** Planning forecast, observed pre-flight Weather and Chemical Plan.
- **JSA:** Mission JSA, triggered hazards, risk controls and controlled checklists.
- **Review:** Mission Status summary, readiness detail, authorisation and Mission Pack.
- **Operational Closeout:** Existing closeout stages and Completion Evidence.
- **Mission Outcomes:** Longitudinal immutable Mission Outcome Observations and follow-up actions.
- **Customer Outcome:** Immutable customer outcome evidence and secure customer workflow.

Long histories, technical provenance, revision lists and secondary actions use progressive disclosure. They remain available but do not compete with the current operational task.

## Mission Status Panel

The right-side panel is named **Mission Status** and acts as the Mission health summary. It contains three sections:

- **Needs Attention:** authoritative blockers preventing the next lifecycle gate.
- **Needs Review:** evidence affected by an upstream change or requiring operator confirmation.
- **Complete:** satisfied categories and stages.

Each item states why it is in that section and opens the exact stage where the operator can act. The panel never invents readiness in the browser; it renders authoritative readiness and existing step-state results. On smaller screens it becomes a compact summary above the workspace with an accessible disclosure for the full detail.

## Navigation and Saving

- Selecting an available step changes the active workspace without requiring completion of earlier screens.
- `Save & Next` is the primary stage action where the stage contains mutable evidence.
- A successful save persists through the existing trusted server command, refreshes authoritative state, and advances to the next sequential stage.
- A failed save remains on the current stage and preserves entered values, map viewport, layers, selections and uploaded evidence where supported.
- Validation appears inside the active workspace beside the action required to correct it.
- Secondary `Save` is permitted where remaining on the stage is useful, but must not compete visually with `Save & Next`.
- Read-only and historical stages use an appropriate next-stage action rather than implying an editable save.
- Browser navigation state may identify the visible stage, but it is never authoritative evidence and must not replace PostgreSQL persistence.

## State and Invalidation

Step state continues to derive from sufficient authoritative evidence:

- `CURRENT`
- `COMPLETE`
- `INCOMPLETE`
- `BLOCKED`
- `NEEDS_REVIEW`
- `OPTIONAL` where applicable

Changing earlier evidence marks only genuinely affected downstream evidence as Needs Review. Existing targeted rules are retained and extended only when an authoritative dependency proves the need. Examples include Field changes affecting Map, Weather/Chemicals and JSA, or Aircraft changes affecting aircraft-dependent safety evidence.

Movement is not blocked merely because a previous stage is incomplete. Enforcement occurs at the appropriate lifecycle gate, especially Mission Authorisation and Completion, following SC-013 Inform Early, Enforce Late. Tenant, permission, operating-location and immutable-evidence restrictions continue to fail closed.

## SC-011, SC-012 and SC-013

### SC-011 — Fill Once, Remember Forever

The workspace inherits Client, Property, Field, Job, location, Field boundary and other approved parent context. Existing values are presented for confirmation rather than requested again. Saved stage evidence reopens from authoritative persistence after refresh, re-login and another authorised session.

### SC-012 — Premium Simplicity

One active operational task receives primary visual weight. Labels use operator language. Status appears before technical provenance. Revision history, evidence IDs and diagnostic detail remain available through secondary disclosure.

### SC-013 — Inform Early, Enforce Late

The workspace explains future blockers as soon as they are known, but allows planning to continue. Warnings identify why they matter and link directly to the relevant stage. The system enforces only at the approved operational gate.

## Responsive and Accessible Behaviour

- Desktop uses the full stepper, primary workspace and Mission Status side panel.
- Tablet preserves the full stepper with controlled horizontal overflow and places Mission Status above or beside the active workspace according to available width.
- Mobile keeps the context breadcrumb readable, the active stage obvious, and every lifecycle stage reachable without hiding the lifecycle behind an unrelated menu.
- Keyboard users can traverse steps and open the active stage with a visible focus state.
- Step labels expose both name and state to assistive technology.
- Colour is never the only indicator of Current, Complete, Needs Review or unavailable status.
- Sticky elements must not cover validation, actions or focused controls.

## Error and Empty States

Errors remain inside the active stage and include a correlation reference when supplied by the trusted server. No failed save creates a misleading local completion state. Missing authoritative evidence is shown as missing, not inferred from inherited values or screen visitation. Provider failures in Weather, maps or file import remain explicit and preserve the last authoritative revision.

## Testing and Acceptance

The refinement is accepted when:

1. Exactly one Mission stage is presented as the primary workspace.
2. The complete nine-stage lifecycle remains visible.
3. Every available stage is directly clickable.
4. Completed and Needs Review stages remain accessible.
5. The active stage is clear on desktop, tablet and mobile.
6. The persistent breadcrumb displays Client > Property > Field > Mission and opens available parent workspaces.
7. `Save & Next` saves authoritatively before advancing.
8. Failed saves remain on the active stage and preserve operator work.
9. Earlier-stage edits trigger only genuine downstream Needs Review states.
10. Movement remains non-linear while authorisation and completion gates remain authoritative.
11. Mission Status displays Needs Attention, Needs Review and Complete with direct corrective navigation.
12. Operational Closeout remains visible but unavailable before Mission Authorisation.
13. Mission Outcomes and Customer Outcome remain visible but unavailable before Completion.
14. Existing Map, Resources, Weather, Chemicals, JSA, readiness, authorisation, closeout, outcomes and customer evidence components retain their authoritative behaviour.
15. Refresh, re-login and a second authorised session reopen the same persisted Mission and correct active evidence states.
16. Existing routes, APIs, permissions, tenant isolation, operating-location scope, audit, outbox and immutable evidence remain unchanged.
17. No browser or legacy persistence fallback is introduced.
18. Regression tests and the production build pass before deployment.

## Out of Scope

- New Mission lifecycle stages.
- New backend or database architecture.
- New readiness rules without existing authoritative evidence dependencies.
- Redesign of individual Map, Weather, Chemical, JSA or closeout domain workflows beyond the composition needed for the Mission Workspace.
- Changes to evidence immutability, authorisation policy or completion policy.
