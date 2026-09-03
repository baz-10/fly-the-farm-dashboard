# Fleet Technical Register and Maintenance System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one authoritative, progressively disclosed Fleet Technical Register and Maintenance System across existing Aircraft, Equipment Kits and new relational Fleet assets.

**Architecture:** Compose the existing authoritative asset domains through a typed maintainable-asset registry. Store maintenance facts relationally and historically; keep canonical technical part/fluid identity separate from tenant-private purchasing preferences. Build optional versioned service templates that compose requirements into immutable prepared-service manifests.

**Tech Stack:** React 18, TypeScript, Material UI, Jest/Testing Library, Playwright (Chromium and WebKit), Vercel Node APIs, PostgreSQL/Supabase migrations, RLS, transactional outbox and repository-controlled Product Maturity.

**Spec:** `docs/superpowers/specs/2026-08-19-fleet-technical-register-maintenance-system-design.md`

## Global Constraints

- No Aircraft, Equipment Kit, Personnel, Organisation, Base, audit, outbox or document rewrite.
- No browser-local maintenance authority or persistence fallback.
- No Production migration or deployment without a separate Product Owner approval containing an immutable merged-main SHA and exact migration set.
- Each task starts with a failing test, implements the minimum behavior, then runs focused verification before commit.
- Each slice receives independent authority/security review before the next architectural boundary begins.
- Canonical technical facts never contain tenant-private commercial metadata.
- AI-extracted facts remain proposals until human approval and evidence.
- Service templates and component tracking remain optional.
- No automatic grounding; availability changes require an explicit governed command.

---

## Slice 1 — Fleet asset and maintainable-registry foundation

### Task 1.1: Lock the relational schema contract in tests

**Files:**

- Create: `src/__tests__/fleetMaintenanceFoundationMigration.test.js`
- Create: `supabase/migrations/20260820090000_authoritative_fleet_assets.sql`

- [ ] Write migration-contract tests that require `fleet_assets` and `maintainable_asset_registry`, exact source-link exclusivity, tenant-scoped uniqueness, row versions, archive state, source/organisation consistency triggers, audit and outbox hooks.
- [ ] Add PGlite behavioral cases for cross-organisation source links, duplicate registry links, stale row versions and Base-scope rejection.
- [ ] Run the focused test and confirm it fails because the migration does not yet contain the required objects:

```bash
npm test -- --watchAll=false --runInBand src/__tests__/fleetMaintenanceFoundationMigration.test.js
```

- [ ] Implement the additive migration with no modification of Aircraft or Equipment Kit tables beyond safe registry FKs/indexes.
- [ ] Re-run the focused test until it passes.
- [ ] Commit only the migration and its test:

```bash
git add supabase/migrations/20260820090000_authoritative_fleet_assets.sql src/__tests__/fleetMaintenanceFoundationMigration.test.js
git commit -m "feat(fleet): add authoritative maintainable asset foundation"
```

### Task 1.2: Add typed API and repository boundaries

**Files:**

- Create: `src/types/fleetMaintenance.ts`
- Create: `src/services/fleetAssetsApi.ts`
- Create: `src/services/__tests__/fleetAssetsApi.test.ts`
- Create: `server/fleet-maintenance-repository.js`
- Create: `server/fleet-maintenance-api.js`
- Create: `server/__tests__/fleet-maintenance-api.test.js`
- Modify: `server/operational-dispatcher.js`
- Modify: `api/v1/[resource].js`

- [ ] Define discriminated Fleet asset types and registry source references. Registry input must accept exactly one `aircraftId`, `equipmentKitId` or `fleetAssetId`.
- [ ] Test same-origin CRUD, tenant/Base scope, safe validation failures, archive semantics and `If-Match`/row-version conflict behavior.
- [ ] Test that the dispatcher never accepts organisation IDs from an untrusted body as authority.
- [ ] Run both focused suites and observe failure:

```bash
npm test -- --watchAll=false --runInBand src/services/__tests__/fleetAssetsApi.test.ts server/__tests__/fleet-maintenance-api.test.js
```

- [ ] Implement repository functions using existing trusted-session, permission, audit and outbox utilities.
- [ ] Expose only typed Fleet asset and registry resources through the existing dispatcher.
- [ ] Re-run focused suites, then run the existing Aircraft and Equipment Kit API suites.
- [ ] Commit the API boundary.

### Task 1.3: Build compact registers without changing existing authority

**Files:**

- Create: `src/pages/FleetRegister.tsx`
- Create: `src/pages/FleetRegister.test.tsx`
- Create: `src/components/maintenance/AssetSummaryCard.tsx`
- Create: `src/components/maintenance/AssetSummaryCard.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/navigation/organisationNavigation.tsx`
- Modify: `src/productMaturity/product-maturity-registry.json`

- [ ] Write tests for search by registration/asset identity, Base/status filters, honest loading/error/empty states and next actions.
- [ ] Prove `/aircraft` remains authoritative, `/fleet` opens the new register and `/fleet-work-packs` remains reachable.
- [ ] Implement cards that show identity, Base, operational/serviceability state, the authoritative due summary or an honest “Maintenance not configured” state, and the primary action without long forms.
- [ ] Add Beta classifications for only the new register/workflows and update route completeness tests.
- [ ] Run focused UI, navigation and Product Maturity tests.
- [ ] Commit the register slice.

### Slice 1 gate

- [ ] Run foundation, API, Aircraft and Equipment Kit regressions.
- [ ] Run `npm run verify:product-maturity` and `npm run build`.
- [ ] Obtain independent authority review of registry ownership, RLS, Base scope and no-duplicate authority.
- [ ] Prepare an exact migration dry run; do not apply it.

---

## Slice 2 — Attachments, meters, systems and positions

### Task 2.1: Add relationship and meter schema

**Files:**

- Create: `supabase/migrations/20260820100000_asset_relationships_meters_and_systems.sql`
- Create: `src/__tests__/assetRelationshipsMetersMigration.test.js`

- [ ] Test `asset_attachment_periods`, `asset_meter_definitions`, `asset_meter_readings`, `asset_systems` and `component_positions` contracts.
- [ ] Prove attachments require the same organisation, prevent active cycles and prevent overlapping active parents for a child.
- [ ] Prove meter readings are append-only, idempotent by source and corrected only by supersession.
- [ ] Prove systems/positions can be empty, hierarchical and organisation/model scoped without fixed aircraft geometry.
- [ ] Implement the migration and pass PGlite behavioral tests.
- [ ] Commit migration and tests.

### Task 2.2: Add relationship and meter commands

**Files:**

- Create: `src/services/maintenanceApi.ts`
- Create: `src/services/__tests__/maintenanceApi.test.ts`
- Modify: `server/fleet-maintenance-repository.js`
- Modify: `server/fleet-maintenance-api.js`
- Create: `server/__tests__/asset-relationships-meters.test.js`

- [ ] Test attach, detach, record reading and correct reading commands with row-version/idempotency behavior.
- [ ] Test attachment movement retains the child's history and does not move historical events into the parent.
- [ ] Test source-derived Mission reading duplicate delivery is idempotent.
- [ ] Implement minimal commands and read models, participating in audit/outbox transactions.
- [ ] Pass focused tests and commit.

### Task 2.3: Add Overview workspace composition

**Files:**

- Create: `src/pages/AssetWorkspace.tsx`
- Create: `src/pages/AssetWorkspace.test.tsx`
- Create: `src/components/maintenance/AssetWorkspaceNavigation.tsx`
- Create: `src/components/maintenance/AssetContextBar.tsx`
- Create: `src/components/maintenance/AttachedAssetsSummary.tsx`
- Modify: `src/App.tsx`

- [ ] Test shared composition for Aircraft and Fleet asset routes without changing source identity.
- [ ] Test one active section, persistent context, route-addressable navigation and attached-asset deep links.
- [ ] Test loading disables mutations until organisation/Base/asset data is authoritative.
- [ ] Implement Overview only; other sections render honest Beta empty states until their slices land.
- [ ] Verify desktop, tablet, mobile and keyboard layout with component tests.
- [ ] Commit and pass Slice 2 gate.

---

## Slice 3 — Canonical technical catalogue and private preferences

### Task 3.1: Add canonical parts, fluids and proposal schema

**Files:**

- Create: `supabase/migrations/20260820110000_maintenance_technical_catalogue.sql`
- Create: `src/__tests__/maintenanceTechnicalCatalogueMigration.test.js`

- [ ] Test immutable `technical_part_versions`, `technical_part_equivalences`, `technical_fluid_specification_versions`, evidence and effective-state constraints.
- [ ] Test `technical_data_proposals` has no direct compatibility/applicability effect.
- [ ] Test equivalence publication requires human approver, evidence and exact effective versions.
- [ ] Test `organisation_part_preferences` and `organisation_fluid_preferences` are tenant scoped and cannot be read cross-organisation.
- [ ] Test canonical result sets contain no supplier, internal SKU, package preference, notes or purchasing metadata.
- [ ] Test asset part/fluid applicability links exact effective versions, quantities and controlled units.
- [ ] Implement and pass the migration tests.
- [ ] Commit.

### Task 3.2: Add catalogue approval and preference APIs

**Files:**

- Create: `server/technical-catalogue-repository.js`
- Create: `server/technical-catalogue-api.js`
- Create: `server/__tests__/technical-catalogue-authority.test.js`
- Create: `src/services/technicalCatalogueApi.ts`
- Create: `src/services/__tests__/technicalCatalogueApi.test.ts`
- Modify: `server/operational-dispatcher.js`

- [ ] Test canonical reads separately from organisation preference reads.
- [ ] Test proposal, review and publish commands; AI/source metadata alone must not publish.
- [ ] Test human approval permission, evidence, optimistic concurrency and safe errors.
- [ ] Test organisation users cannot mutate canonical facts and catalogue curators cannot enumerate private preferences.
- [ ] Implement, pass tests and commit.

### Task 3.3: Build Parts & Fluids progressive disclosure

**Files:**

- Create: `src/components/maintenance/PartsFluidsWorkspace.tsx`
- Create: `src/components/maintenance/PartsFluidsWorkspace.test.tsx`
- Create: `src/components/maintenance/SystemTechnicalSummary.tsx`
- Modify: `src/pages/AssetWorkspace.tsx`

- [ ] Test collapsed system summaries, exact evidence/authority labels and separate “Technical requirement” versus “Our preference” presentation.
- [ ] Test the workspace answers part/filter/fluid/capacity questions without exposing private data from another tenant.
- [ ] Implement one-expanded-section behavior and accessible loading/error states.
- [ ] Commit and pass Slice 3 security gate.

---

## Slice 4 — Versioned maintenance requirements and deterministic due state

### Task 4.1: Add requirement schema

**Files:**

- Create: `supabase/migrations/20260820120000_maintenance_requirements.sql`
- Create: `src/__tests__/maintenanceRequirementsMigration.test.js`

- [ ] Test stable requirements, immutable versions, typed thresholds and exact authority values.
- [ ] Test ANY_THRESHOLD and ALL_THRESHOLDS are explicit; ambiguous multi-threshold rows fail.
- [ ] Test completion records point to exact requirement versions and maintenance events.
- [ ] Test effective/superseded version constraints and organisation/canonical scope.
- [ ] Implement the migration and commit after focused pass.

### Task 4.2: Implement the pure due-state engine

**Files:**

- Create: `src/domain/maintenance/dueState.ts`
- Create: `src/domain/maintenance/dueState.test.ts`
- Create: `src/domain/maintenance/componentLife.ts`
- Create: `src/domain/maintenance/componentLife.test.ts`

- [ ] Write table-driven tests for calendar, kilometres, hours, cycles, missions, area, condition and one-time thresholds.
- [ ] Test explicit `asOf`, warning thresholds, whichever-first, all-threshold, missing evidence and meter correction behavior.
- [ ] Test UNKNOWN/NEEDS_ATTENTION rather than false CURRENT when inputs are absent.
- [ ] Implement pure deterministic functions returning state plus explainable inputs.
- [ ] Add property/invariant cases for boundary instants and unit precision.
- [ ] Commit.

### Task 4.3: Expose due summaries and Maintenance workspace

**Files:**

- Modify: `server/fleet-maintenance-repository.js`
- Modify: `server/fleet-maintenance-api.js`
- Create: `server/__tests__/maintenance-due-read-model.test.js`
- Create: `src/components/maintenance/MaintenanceWorkspace.tsx`
- Create: `src/components/maintenance/MaintenanceWorkspace.test.tsx`
- Modify: `src/pages/AssetWorkspace.tsx`

- [ ] Test server calculation uses one recorded `asOf` and authoritative readings/completions.
- [ ] Test Manufacturer, Organisation Standard and Condition authority remain visible.
- [ ] Test due state does not mutate availability.
- [ ] Implement collapsed Current/Due Soon/Due/Overdue/Needs Attention groups and next action.
- [ ] Commit and pass Slice 4 deterministic/timezone gate.

---

## Slice 5 — Maintenance events, defects and documents

### Task 5.1: Add historical execution schema

**Files:**

- Create: `supabase/migrations/20260820130000_maintenance_events_defects_documents.sql`
- Create: `src/__tests__/maintenanceEventsDefectsMigration.test.js`

- [ ] Test event, requirement completion, part/fluid use, personnel, meter, defect, component-action and document-link tables.
- [ ] Test one-transaction audit/outbox behavior and append/supersede correction semantics.
- [ ] Test defect transitions and require explicit availability decision authority.
- [ ] Test documents reference existing immutable file versions and explicit purpose/provenance.
- [ ] Implement, pass and commit.

### Task 5.2: Add event and defect commands

**Files:**

- Modify: `server/fleet-maintenance-repository.js`
- Modify: `server/fleet-maintenance-api.js`
- Create: `server/__tests__/maintenance-events-defects.test.js`
- Modify: `src/services/maintenanceApi.ts`

- [ ] Test record/amend event, report/assess/defer/rectify/close defect and availability-decision commands.
- [ ] Prove defect reporting alone never grounds an asset.
- [ ] Prove maintenance completion updates due-state inputs only through the event transaction.
- [ ] Implement, pass and commit.

### Task 5.3: Build Defects, Documents and History workspaces

**Files:**

- Create: `src/components/maintenance/DefectsWorkspace.tsx`
- Create: `src/components/maintenance/DocumentsWorkspace.tsx`
- Create: `src/components/maintenance/MaintenanceHistoryWorkspace.tsx`
- Create: `src/components/maintenance/MaintenanceExecutionDialog.tsx`
- Create: `src/components/maintenance/MaintenanceExecutionDialog.test.tsx`
- Modify: `src/pages/AssetWorkspace.tsx`

- [ ] Test one-question-per-dialog actions, exact authority/evidence display and no giant form.
- [ ] Test mobile progressive disclosure and failed-save work preservation.
- [ ] Test Save advances only after authoritative success and one failure renders once.
- [ ] Implement, pass accessibility tests and commit.

---

## Slice 6 — Components, installations and calculated life

### Task 6.1: Add component schema

**Files:**

- Create: `supabase/migrations/20260820140000_tracked_components_and_installations.sql`
- Create: `src/__tests__/trackedComponentsMigration.test.js`

- [ ] Test serialised and batched/non-serialised identities, lifecycle states and optional tracking.
- [ ] Test installation periods prevent overlaps, enforce same organisation and preserve transfer history.
- [ ] Test history-only retirement does not delete events/installations.
- [ ] Implement, pass and commit.

### Task 6.2: Add component commands and life projection

**Files:**

- Modify: `server/fleet-maintenance-repository.js`
- Modify: `server/fleet-maintenance-api.js`
- Create: `server/__tests__/tracked-components.test.js`
- Modify: `src/services/maintenanceApi.ts`

- [ ] Test create/install/remove/transfer/retire commands and exact position validation.
- [ ] Test calculated life across multiple assets and corrected meter readings.
- [ ] Test negative delta, rollover ambiguity and missing readings fail as Needs Attention.
- [ ] Implement, pass and commit.

### Task 6.3: Build Components workspace

**Files:**

- Create: `src/components/maintenance/ComponentsWorkspace.tsx`
- Create: `src/components/maintenance/ComponentsWorkspace.test.tsx`
- Create: `src/components/maintenance/ComponentDetailPanel.tsx`
- Modify: `src/pages/AssetWorkspace.tsx`

- [ ] Test no-components state remains valid and invites optional setup.
- [ ] Test 3, 30 and 300-component fixtures render compact collapsed groups without full-detail mounting.
- [ ] Test install/inspect/replace/remove/history actions in keyboard and mobile layouts.
- [ ] Implement virtualization/pagination only where measurement proves needed; do not pre-optimise.
- [ ] Commit and pass Slice 6 gate.

---

## Slice 7 — Optional service templates and Prepare Service

### Task 7.1: Add versioned service-template schema

**Files:**

- Create: `supabase/migrations/20260820150000_service_templates_and_prepared_manifests.sql`
- Create: `src/__tests__/serviceTemplatesMigration.test.js`

- [ ] Test template root/version, applicability, requirement links, actions, parts and fluids.
- [ ] Test PLATFORM versus ORGANISATION ownership, immutable effective versions and evidence.
- [ ] Test template absence does not prevent requirement creation, due state or maintenance completion.
- [ ] Test constrained conditional schema rejects executable/unrecognised expressions.
- [ ] Test prepared revisions and lines retain every source version/origin.
- [ ] Implement, pass and commit.

### Task 7.2: Implement deterministic manifest assembly

**Files:**

- Create: `src/domain/maintenance/prepareService.ts`
- Create: `src/domain/maintenance/prepareService.test.ts`
- Modify: `server/fleet-maintenance-repository.js`
- Modify: `server/fleet-maintenance-api.js`
- Create: `server/__tests__/prepare-service.test.js`

- [ ] Test assembly from due requirements without a template.
- [ ] Test optional selected template versions plus component state, open defects and attached assets.
- [ ] Test exact-origin de-duplication and safe quantity aggregation only for identical canonical identity/unit/compatibility.
- [ ] Test organisation preferences remain an overlay and never rewrite canonical lines.
- [ ] Test no package rounding/procurement assumptions.
- [ ] Test preview is read-only and saved manifest is immutable/versioned.
- [ ] Implement, pass and commit.

### Task 7.3: Build Service Template and Prepare Service workspaces

**Files:**

- Create: `src/pages/ServiceTemplates.tsx`
- Create: `src/pages/ServiceTemplates.test.tsx`
- Create: `src/components/maintenance/PrepareServiceWorkspace.tsx`
- Create: `src/components/maintenance/PrepareServiceWorkspace.test.tsx`
- Modify: `src/pages/AssetWorkspace.tsx`
- Modify: `src/navigation/organisationNavigation.tsx`
- Modify: `src/productMaturity/product-maturity-registry.json`

- [ ] Test authority labels, version selection and evidence review.
- [ ] Test Prepare Service clearly separates technical requirement, required quantity and preferred purchasing package.
- [ ] Test attached assets remain separately identified while totals aggregate safely.
- [ ] Test operator can proceed with no template.
- [ ] Classify templates Beta and Prepare Service Coming Soon until end-to-end acceptance.
- [ ] Commit and pass Slice 7 gate.

---

## Slice 8 — Integration, reconciliation and complete acceptance

### Task 8.1: Reconcile Work Pack Fleet assets without dual authority

**Files:**

- Create: `supabase/migrations/20260820160000_work_pack_fleet_asset_reconciliation.sql`
- Create: `src/__tests__/workPackFleetAssetReconciliationMigration.test.js`
- Modify: `src/types/workPack.ts`
- Modify: `src/contexts/WorkPackContext.tsx`
- Modify: `src/pages/FleetWorkPacks.tsx`

- [ ] Test idempotent source-ID/digest reconciliation from existing Work Pack deployment assets.
- [ ] Test mismatches fail closed and existing JSON is retained as historical compatibility evidence during cutover.
- [ ] Test new Work Pack selections reference relational Fleet asset IDs and cannot invent technical data.
- [ ] Implement compatibility reads only; no browser-local maintenance writes.
- [ ] Commit.

### Task 8.2: Integrate Mission meter evidence and availability gates

**Files:**

- Modify: `server/operational-repository.js`
- Modify: `server/fleet-maintenance-repository.js`
- Create: `server/__tests__/mission-maintenance-integration.test.js`
- Modify: `src/utils/aircraftMaintenance.ts`
- Modify: `src/utils/aircraftMaintenance.test.ts`

- [ ] Test accepted Mission closeout emits idempotent readings for configured flight/cycle/mission/area meters.
- [ ] Test rejected/draft closeout cannot change maintenance state.
- [ ] Test legacy Aircraft summary remains compatible while the new due engine is authoritative for new workflow surfaces.
- [ ] Test availability gate changes only after explicit governed decision.
- [ ] Implement, pass and commit.

### Task 8.3: Add cross-browser operational acceptance

**Files:**

- Create: `e2e/acceptance/fleet-maintenance.spec.ts`
- Create: `playwright.fleet-maintenance.config.ts`
- Modify: `.github/workflows/production-beta-operational-acceptance.yml`
- Modify: `src/__tests__/productionBetaAcceptanceWorkflow.test.js`

- [ ] Cover simple path: create Fleet asset, record one requirement/event, reopen and verify authoritative persistence.
- [ ] Cover advanced path: system, canonical part/fluid preference, component transfer, due calculation, optional template and prepared manifest.
- [ ] Cover attachments retaining independent history.
- [ ] Cover failed save preservation, stale row version, tenant denial and direct-route denial.
- [ ] Run equivalent Chromium and WebKit desktop, tablet and mobile projects.
- [ ] Ensure authentication artefacts remain credential-safe and controlled records use existing scoped cleanup.
- [ ] Commit.

### Task 8.4: Final security and release preparation

**Files:**

- Create: `supabase/migrations/20260820170000_fleet_maintenance_authority_hardening.sql`
- Create: `src/__tests__/fleetMaintenanceAuthorityHardeningMigration.test.js`
- Modify: `src/productMaturity/product-maturity-registry.json`
- Modify: `docs/operations/production-beta-release.md`

- [ ] Prove exact RLS/ACL matrix for canonical catalogue, tenant preferences, Base-scoped assets, templates, events, components and manifests.
- [ ] Prove service role gains no generic cross-tenant catalogue/preference enumeration surface.
- [ ] Prove audit/outbox coverage for every command and no mutation endpoint omits optimistic concurrency.
- [ ] Prove all new routes have maturity classification and permission-aware navigation tests.
- [ ] Run focused PostgreSQL and workflow-governance tests.
- [ ] Run full deterministic regression:

```bash
TZ=Australia/Brisbane npm run test:ci:sharded
```

- [ ] Run Product Maturity and Production build:

```bash
npm run verify:product-maturity
npm run build
```

- [ ] Run Chromium and WebKit acceptance against a non-Production environment.
- [ ] Request independent architecture/security review and resolve every concrete finding test-first.
- [ ] Merge through normal PR governance without squash/rebase/history rewrite.
- [ ] From merged `main`, capture immutable `RELEASE_SHA`, exact pending migration IDs and dry-run/ledger proof.
- [ ] Run the complete non-mutating Production Beta release rehearsal.
- [ ] Return for separate Product Owner approval before any Production migration or deployment.

## Completion evidence

The implementation is ready for a Production decision only when all eight slice gates are complete and the handoff contains:

- merged-main SHA and complete commit lineage;
- exact migration set and ledger/dry-run proof;
- focused security and PostgreSQL results;
- complete deterministic regression result;
- Product Maturity result;
- Production build result;
- Chromium/WebKit desktop/tablet/mobile results;
- authoritative API and database verification;
- explicit proof that no existing Aircraft, Personnel, genuine Fleet record or tenant boundary was weakened;
- GO/NO-GO recommendation.

Production mutation remains separately authorised even if every item above passes.
