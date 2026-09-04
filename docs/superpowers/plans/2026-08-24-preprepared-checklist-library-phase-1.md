# Preprepared Checklist Library Phase 1 — bounded implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:test-driven-development` for every runtime task and `superpowers:verification-before-completion` before every completion claim.
>
> **Execution gate:** Founder approval dated 24 August 2026 authorises Tasks 1–4 using test fixtures or non-published development content. Task 5 PLATFORM_SYSTEM publication and Task 6 Mission-readiness adoption remain separately gated.

**Goal:** Compose one frozen, applicable operational Checklist from immutable DJI, regulatory and workflow modules without duplicating authority or creating Fleet defects.

**Architecture:** Preserve current Checklist template/version/applicability/execution/finding authority. Add one narrow composition aggregate only because a single template-version snapshot cannot preserve multiple exact module lineages. Resolve all model/configuration/Mission/regulatory applicability server-side and freeze it once at start.

**Authority hardening:** A published profile version is one immutable aggregate: its profile authority fields, applicability, provenance, ordered module membership, exact module versions, sections and item definitions cannot be changed in place. Publication is a checked, atomic transition for either the `PLATFORM_SYSTEM` or `ORGANISATION` plane. Preview returns the stored SHA-256 composition digest; start requires that exact digest and re-resolves all checked context in the same transaction before freezing an execution.

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
- [ ] Canonicalise the authority-only composition as PostgreSQL `jsonb`: canonical object-key ordering and explicit ordered arrays for modules, sections and items. Hash the UTF-8 `jsonb::text` representation with SHA-256.
- [ ] Include profile/version identity, lifecycle and authority scope, organisation/source/supersession identity, applicability, composition provenance, ordered membership, exact module/template versions, module provenance, sections, items and conditional definitions in the digest; exclude timestamps and presentation/runtime noise.
- [ ] Serialize publication with profile/version row locks and serialize membership mutation through a parent-version lock so publication yields either one complete immutable version or no publication.
- [ ] Prove the checked platform publication command rejects organisation modules and tenant-private provenance, while the checked organisation command accepts only global PLATFORM_SYSTEM modules or exact-tenant organisation modules.
- [ ] Include every module's immutable applicability rows in publication validation, the digest and the frozen preview; reject any module whose lifecycle/model/configuration/authority scope conflicts with its profile.
- [ ] Preserve ordered multi-source references (`authorityClass`, source identity, locator and represented outcome) on consolidated items. Require at least two unique references when an item is marked consolidated.
- [ ] Record both the stable source-system profile and exact published source-system profile-version on organisation adoption; validate supersession within the same profile/plane/tenant only.
- [ ] Provision `platform.checklist_system.publish` only to the platform super-administrator role and reject bounded platform applicability/provenance containing tenant-private keys or identifiers.

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
- [ ] Require explicit Aircraft identity whenever manufacturer, model, Aircraft or configuration applicability exists; never infer it from text.
- [ ] Treat zero exact active fitted configuration candidates as unresolved, one as resolved, and more than one as ambiguous; never select an arbitrary candidate.
- [ ] Recheck exact profile digest, Mission/Aircraft/Base scope and fitted configuration under database locks before creating an execution. Any stale or changed authority returns a conflict/domain failure and inserts no execution/audit/outbox rows.
- [ ] Preserve an exact older immutable preview across supersession: publishing a new version never rewrites the old version or a start that names the old version and digest.
- [ ] Serialize fitted-configuration assignment mutation and composed start using the same organisation/Base advisory transaction lock so a phantom assignment cannot appear across resolution and execution creation.

## Task 3: library, inheritance and update behavior

- [ ] RED-test checked library discovery without customer system mutation.
- [ ] RED-test exact clone/adopt behavior, organisation-only additions and authority classification.
- [ ] RED-test update-available without silent replacement.
- [ ] RED-test organisation additions preserving private provenance and never being relabelled as DJI/CASA/PLATFORM_SYSTEM authority.
- [ ] RED-test system update availability against exact adopted lineage while active and completed executions retain their frozen versions.
- [ ] Implement bounded checked reads and adoption commands using existing authority conventions.
- [ ] Checked discovery returns exact published system/organisation version identity and update availability; checked adoption creates a tenant Draft linked to the exact source profile version/digest without mutating system authority.

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
- [ ] Map checked database sentinels to truthful bounded HTTP failures and recursively fail the whole browser response on malformed/oversized authoritative children, especially frozen execution snapshots.
- [ ] Enforce both per-field/container bounds and a global decoded authority budget (depth, total nodes and total text/key bytes).

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
