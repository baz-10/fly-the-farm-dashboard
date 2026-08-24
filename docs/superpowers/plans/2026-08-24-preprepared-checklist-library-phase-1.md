# Preprepared Checklist Library Phase 1 — bounded implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:test-driven-development` for every runtime task and `superpowers:verification-before-completion` before every completion claim.
>
> **Execution gate:** Founder approval dated 24 August 2026 authorises Tasks 1–4 using test fixtures or non-published development content. Task 5 PLATFORM_SYSTEM publication and Task 6 Mission-readiness adoption remain separately gated.

**Goal:** Compose one frozen, applicable operational Checklist from immutable DJI, regulatory and workflow modules without duplicating authority or creating Fleet defects.

**Architecture:** Preserve current Checklist template/version/applicability/execution/finding authority. Add one narrow composition aggregate only because a single template-version snapshot cannot preserve multiple exact module lineages. Resolve all model/configuration/Mission/regulatory applicability server-side and freeze it once at start.

**Tech stack:** PostgreSQL/Supabase migrations and PGlite authority tests; trusted Node server repository/API; React/TypeScript/MUI; Jest/Testing Library; Playwright Chromium and WebKit.

**Accepted specification:** `docs/superpowers/reports/2026-08-24-preprepared-checklist-library-phase-1-6-refinement.md`

## Global constraints

- Extend the reconciled Checklist subsystem; do not create parallel Checklist, Mission-preflight, execution, Fleet, or maintenance authority.
- Use only fixtures/non-published development content until separate PLATFORM_SYSTEM publication approval.
- Ask the pilot only for physical inspection, current judgement, active action, or exception resolution.
- Project exact Mission, Aircraft, Base, Fleet, authority, and record state as resolved evidence where authoritative.
- Conditional RTK, compass calibration, and flow calibration fail closed when applicability cannot be resolved.
- Preserve every underlying source reference when multiple source outcomes form one operator item.
- Preserve immutable version freezing, tenancy/Base isolation, audit/outbox, checked RPC authority, findings, and `DEFECT_HANDOFF_PENDING`.
- Checklist criticality must not ground an Aircraft or change Fleet serviceability.
- No daily physical-preflight reuse, dual-battery T100 content, universal chemical controls, or universal relay/cellular checks in v1.
- Field UX must be progressive, compact, touch-safe, and first-class on phone, iPad mini, iPad Pro, and desktop.

## Task 0: close source gates

- [x] Acquire and hash the catalogue-current English T100 manual; diff all operational checklist sections against DJI-T100-UM-1.
- [x] Review current T100 and T25P spread-system primary documents.
- [x] Obtain Founder/operator approval of the refined content direction, consolidated wording, resolved-evidence model, take-off confirmation placement, and 19/20 T100 burden targets.
- [ ] Keep exact publication payload non-effective until the separate Founder publication gate.
- [ ] Keep T100 dual-battery, relay/cellular, and unsupported model-specific checks unpublished until their exact source gates close.
- [ ] Keep Australian state/territory chemical requirements out until a separate jurisdiction-source matrix is approved.

## Task 1: composition schema and authority

- [ ] Write RED structural/PGlite tests for profile roots, immutable versions and exact ordered module links.
- [ ] Prove PLATFORM_SYSTEM create/publish/retire is platform-only and customer commands fail closed.
- [ ] Prove organisation clones retain exact system provenance and cannot counterfeit inherited authority.
- [ ] Prove no DRAFT/retired/mismatched module can compose and duplicate stable item keys are rejected.
- [ ] RED-test one consolidated operator item retaining an ordered immutable set of every represented source outcome/reference.
- [ ] RED-test item presentation authority for `PHYSICAL_TAP`, `OPERATOR_DECISION_TAP`, `CONDITIONAL_TAP`, `SYSTEM_RESOLVED`, and `EXCEPTION_ONLY` without changing existing Checklist response authority.
- [ ] Implement the minimal additive composition tables and execution linkage in one reviewed migration.
- [ ] Preserve direct-table denial, RLS, tenancy, audit/outbox and optimistic concurrency.

## Task 2: checked composition preview and start

- [ ] RED-test exact organisation, Base, Aircraft, Mission, manufacturer/model, installed configuration and lifecycle resolution.
- [ ] RED-test spray/spread mutual applicability and T100/T25P unresolved spread failure.
- [ ] RED-test ReOC/excluded/authorisation branches; missing context must fail, never fall back to generic CASA items.
- [ ] RED-test exact RTK/non-RTK resolution: RTK renders one readiness action; non-RTK renders evidence and no redundant disabled tap; unknown state fails closed.
- [ ] RED-test compass and flow calibration appearing only when authoritative applicability is `REQUIRED`; `UNKNOWN` requires review and never silently omits the action.
- [ ] RED-test model-supported control response appearing in take-off confirmation, not static walk-around, and not being inferred onto unsupported models.
- [ ] RED-test resolved evidence becoming an actionable exception when missing, expired, changed, inconsistent, or cross-Base/cross-organisation.
- [ ] Implement a non-mutating checked preview returning included/excluded module identities and reasons.
- [ ] Implement one transactional compose-and-start command that freezes profile, module, item, source and context versions.
- [ ] Prove a version published after start cannot alter started or completed evidence.

## Task 3: library, inheritance and update behavior

- [ ] RED-test checked library discovery without customer system mutation.
- [ ] RED-test exact clone/adopt behavior, organisation-only additions and authority classification.
- [ ] RED-test update-available without silent replacement.
- [ ] RED-test organisation additions preserving private provenance and never being relabelled as DJI/CASA/PLATFORM_SYSTEM authority.
- [ ] RED-test system update availability against exact adopted lineage while active and completed executions retain their frozen versions.
- [ ] Implement bounded checked reads and adoption commands using existing authority conventions.

## Task 4: responsive composed-checklist UX

- [ ] Use fixtures only until content publication is approved.
- [ ] RED-test one execution with collapsed sections, progress, required-item focus and detailed source disclosure.
- [ ] RED-test response types and exact N/A permission; a hidden/inapplicable item is not an operator-selected N/A.
- [ ] RED-test separate compact resolved-evidence, walk-around, Site/Mission decision, take-off confirmation, Post-Flight, and End-of-Day presentations without a giant checklist wall.
- [ ] RED-test exact known Aircraft/Mission/Base/system context is displayed and automatically attached to findings without operator re-selection.
- [ ] RED-test a fixture T100 SPRAY experience retaining all intended outcomes with 19 routine operator actions plus only applicable conditional actions.
- [ ] RED-test a fixture T100 SPREAD experience retaining all intended outcomes with 20 routine operator actions plus only applicable conditional actions.
- [ ] RED-test T50, T25P, and T25 fixture compositions preserve exact model evidence and reject artificial T100 LiDAR/RTH/control-response/configuration symmetry.
- [ ] RED-test Post-Flight as shutdown action, new-condition inspection, and findings rather than a repeated preflight.
- [ ] RED-test End-of-Day displays known finding/record status and asks only unresolved or physical actions.
- [ ] RED-test one DEFECT creates one Checklist finding with exact context and `DEFECT_HANDOFF_PENDING`.
- [ ] Prove no Fleet defect, grounding, due-state calculation or unrelated Mission blocking occurs.
- [ ] Verify keyboard, large touch targets, accessible names, progressive sections, and phone/iPad mini/iPad Pro/desktop layouts in Chromium and WebKit.

## Task 5: reviewed content publication — separately gated

- [ ] Freeze exact approved source registry and hashes.
- [ ] Turn approved matrix rows into deterministic seed fixtures with stable IDs.
- [ ] RED-test all four model compositions, spray/spread and source/version provenance.
- [ ] Present the exact proposed PLATFORM_SYSTEM v1 publication payload, including consolidated multi-source mappings and explicit exclusions, for separate Founder review.
- [ ] Publish PLATFORM_SYSTEM module/profile v1 only under separate Founder authority.
- [ ] Run focused security, full deterministic regression, Product Maturity, build and independent content/authority review.

## Task 6: Mission-readiness adoption — separately gated

- [ ] Require explicit organisation publication/adoption before readiness can block.
- [ ] Prove exact Mission/Base/Aircraft applicability and accepted Fleet-deployment boundary.
- [ ] Prove reference evidence is projected, not recalculated.
- [ ] Prove a changed/expired source fact invalidates only the scoped readiness evidence.

## Non-goals

- no authoritative content or seed migration in Phase 1 research;
- no automatic daily pre-flight reuse;
- no generic CASA or chemical-regulation checklist;
- no Fleet defect/rectification/return-to-service implementation;
- no automatic grounding;
- no Product Maturity promotion or Production action.
