# Maintenance Requirements and Due-State Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add versioned maintenance requirements and an authoritative, deterministic, explainable due-state engine for Aircraft, Fleet assets, attached equipment, systems, and future component positions.

**Architecture:** Store immutable approved requirement versions and typed threshold rows in PostgreSQL, with organisation/Platform authority planes, optimistic lifecycle commands, audit/outbox evidence, and exact optional Service Kit links. Calculate due state server-side at an explicit `asOf` using authoritative effective requirements, baselines, corrected meter projections, and organisation/Base timezone policy; expose compact read-only summaries without changing serviceability or availability.

**Tech Stack:** PostgreSQL/Supabase migrations and RLS, Node operational API, React/TypeScript/MUI, Jest/PGlite, Playwright Chromium/WebKit.

**Spec:** Founder-approved Slice 4 brief in `/Users/bjt/.codex/attachments/4be3cd73-40e8-43e5-8a19-051773dcd9a1/pasted-text.txt`, extending `docs/superpowers/specs/2026-08-19-fleet-technical-register-maintenance-system-design.md`.

## Global Constraints

- Threshold combination policy is `ANY`; `ALL` is rejected until separately governed.
- Only approved, `EFFECTIVE`, in-interval versions participate.
- Missing baselines or current readings return `INSUFFICIENT_DATA`; never infer zero.
- Due state never mutates serviceability, `mission_ready`, Fleet status, or availability.
- Manufacturer authority requires approved evidence and remains distinct from organisation standards.
- Calendar calculations use explicit IANA organisation/Base timezone, including `Australia/Brisbane` tests.
- Service Kits describe expected work; requirements decide when. Service Kit linkage is optional.
- No maintenance events, defects, purchasing, Prepare Service execution, AI ingestion, full component-life accumulation, or Production action.

---

### Task 1: Versioned requirement authority schema

**Files:**
- Create: `supabase/migrations/20260821100000_maintenance_requirements_due_state.sql`
- Create: `src/__tests__/maintenanceRequirementsMigration.test.js`
- Create: `src/__tests__/maintenanceRequirementsPglite.test.js`

**Interfaces:**
- Produces stable requirements, immutable versions, typed thresholds, explicit baselines, optional exact Service Kit links, and proposal/review/approve/effective lifecycle RPCs.
- Produces `ftf_read_asset_maintenance_due_state(organisation, actor, registry, as_of)` for Tasks 2–4.

- [ ] Write structural and PGlite tests for lifecycle, authority/evidence, exact scope coherence, explicit `ANY`, typed units, due-soon rules, Service Kit links, immutability, optimistic concurrency, tenant/Base denial, audit/outbox atomicity, and no availability mutation.
- [ ] Run focused tests and confirm RED because the migration and RPCs do not exist.
- [ ] Implement schema, forced RLS, least-privilege grants, fixed-search-path `SECURITY DEFINER` commands, and deterministic read projection.
- [ ] Run focused tests to GREEN and commit only Task 1 files.

### Task 2: Deterministic due-state calculation contract

**Files:**
- Create: `src/domain/maintenance/dueState.ts`
- Create: `src/domain/maintenance/dueState.test.ts`
- Modify: `src/types/fleetMaintenance.ts`

**Interfaces:**
- Consumes the database projection evidence contract.
- Produces typed `MaintenanceDueResult`, threshold explanation, controlling threshold, baseline/current evidence, and attached-equipment summary types.

- [ ] Write table-driven RED tests for exact threshold, one unit before/after, calendar/leap/Brisbane boundaries, `ANY` controlling-threshold changes, missing baseline/current meter, corrected readings, condition and one-time evidence, superseded/inactive versions, Service Kit linked/unlinked, and attached-state isolation.
- [ ] Implement minimal pure normalization/ranking/explanation helpers matching the server projection; prohibit `UNSERVICEABLE` and availability mutation fields.
- [ ] Run focused tests to GREEN and commit Task 2.

### Task 3: Governed due-state API and Fleet summary

**Files:**
- Modify: `server/fleet-maintenance-repository.js`
- Modify: `server/fleet-maintenance-api.js`
- Modify: `server/operational-dispatcher.js`
- Create: `server/__tests__/maintenance-due-read-model.test.js`
- Modify: `src/services/maintenanceApi.ts`
- Modify: `src/services/__tests__/maintenanceApi.test.ts`

**Interfaces:**
- `GET /api/v1/asset-maintenance?action=due-state&assetId=<registry>&asOf=<ISO>` returns one scoped explainable projection.
- `GET /api/v1/asset-maintenance?action=fleet-due-summary&asOf=<ISO>&baseId=&assetType=&state=` returns compact scoped counts/rows.

- [ ] Write RED tests for exact asOf validation, organisation/Base/archived-asset denial, permission separation, corrected-meter use, safe diagnostics, no read-side audit/mutation, attached asset separation, and Fleet filters.
- [ ] Implement repository/API methods with one authoritative asOf and fail-closed response validation.
- [ ] Run server and browser-service tests to GREEN and commit Task 3.

### Task 4: Compact Maintenance and Fleet summary UI

**Files:**
- Create: `src/components/maintenance/MaintenanceWorkspace.tsx`
- Create: `src/components/maintenance/MaintenanceWorkspace.test.tsx`
- Create: `src/components/maintenance/FleetMaintenanceSummary.tsx`
- Create: `src/components/maintenance/FleetMaintenanceSummary.test.tsx`
- Modify: `src/pages/AssetWorkspace.tsx`
- Create: `e2e/aircraft/maintenance-due-state.spec.ts`
- Modify: `src/productMaturity/registry.ts`

**Interfaces:**
- Consumes Task 3 API through the existing authoritative route resolver and stable per-session `asOf`.
- Shows collapsed `DUE NOW`, `DUE SOON`, `UPCOMING`, `CURRENT`, and `NEEDS ATTENTION` groups with one expanded group/card at a time.

- [ ] Write RED component tests for progressive disclosure, explanation/evidence, manufacturer-vs-organisation labels, Service Kit optionality, attached-equipment attention without parent contamination, loading/error/empty states, and no availability controls.
- [ ] Implement compact responsive UI and Fleet filters without giant tables.
- [ ] Add test-only FTF-11, GEN-003, and T100-002 fixtures proving CURRENT/DUE_SOON/DUE/OVERDUE and controlling threshold changes.
- [ ] Run Chromium/WebKit at phone/tablet/desktop and commit Task 4.

### Task 5: Integration and release-preparation evidence

**Files:**
- Create: `.superpowers/sdd/2026-08-19-fleet-technical-register-maintenance-system/task-4-report.md`

- [ ] Run focused requirement/due-state/timezone/security/migration tests.
- [ ] Run full deterministic regression, Product Maturity, production build, and Chromium/WebKit acceptance.
- [ ] Perform independent authority/security review and correct every material finding test-first.
- [ ] Record Slice 4 commit, migration ID/checksum, schemas, API, Service Kit link, timezone model, verification results, and combined Slice 1→4 migration order.
- [ ] Confirm clean worktree and explicitly record that no Production migration, deployment, backfill, or genuine record mutation occurred.
