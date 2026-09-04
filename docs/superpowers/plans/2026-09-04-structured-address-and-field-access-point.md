# Structured Address and Field Access Point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Client and Property addresses editable and manually enterable while making an explicitly confirmed map pin authoritative, and add an optional confirmed Field access/launch point.

**Architecture:** Extract a controlled structured-location state model behind the shared address component, retaining existing Client and Property persistence contracts. Add narrowly checked nullable Field access-point columns through the existing operational Field authority; the Field boundary and Property address remain separate authorities.

**Tech Stack:** React 19, TypeScript, Material UI, Leaflet, Jest/Testing Library, Playwright-compatible UI, Node operational API, PostgreSQL/Supabase migrations.

**Spec:** `docs/superpowers/specs/2026-09-04-structured-address-and-field-access-point-design.md`

## Global Constraints

- Search results are suggestions; only explicit map confirmation creates authoritative coordinates.
- Manual Australian address entry must remain available when search is unavailable or inaccurate.
- No address edit may silently move a manually adjusted pin.
- Field access/launch points are optional and separate from Property addresses and Field boundaries.
- Existing organisation, RLS, checked-command, audit, outbox, and optimistic-concurrency boundaries remain intact.
- No Production migration, Production deployment, alias change, or genuine Fly The Farm data mutation is authorised.

---

### Task 1: Structured location state and shared address editor

**Files:**
- Create: `src/components/address/structuredLocation.ts`
- Create: `src/components/address/structuredLocation.test.ts`
- Modify: `src/components/AddressAutocomplete.tsx`
- Create: `src/components/AddressAutocomplete.test.tsx`

**Interfaces:**
- Produces: `StructuredAddress`, `ConfirmedLocation`, `invalidateAddressConfirmation`, and the existing `AddressResult` callback contract with editable address components.
- Consumes: existing `/api/geocode` responses and `AddressLocationMap` coordinate changes.

- [ ] Write failing unit tests proving a selected result populates editable fields, manual entry works without a search result, address edits invalidate confirmation without moving coordinates, coordinate edits invalidate confirmation, and stale search results cannot replace newer input.
- [ ] Run `CI=true npm test -- --runInBand src/components/address/structuredLocation.test.ts src/components/AddressAutocomplete.test.tsx` and verify failures describe missing structured/manual behaviour.
- [ ] Implement the pure state transitions and render Search/Manual modes with inputs for street/property address, locality/region, state, and postcode.
- [ ] Retain best-effort search and map placement, but require explicit confirmation after every address or coordinate change.
- [ ] Re-run the focused tests and verify they pass.

### Task 2: Client and Property integration

**Files:**
- Modify: `src/pages/ClientList.tsx`
- Modify: `src/pages/PropertyWorkspace.tsx`
- Modify: `src/pages/OperationalWorkflow.test.tsx`
- Modify: `src/__tests__/trustedOperationalApi.test.js`

**Interfaces:**
- Consumes: the shared `AddressResult` structured/manual contract from Task 1.
- Produces: unchanged Client `addresses[]` and Property checked-command payload shapes with accurate provenance and confirmation timestamps.

- [ ] Add failing workflow tests proving manual Client and Property addresses save with exact structured components and confirmed coordinates, selected results remain editable, and inherited Client locations require Property reconfirmation.
- [ ] Run `CI=true npm test -- --runInBand src/pages/OperationalWorkflow.test.tsx src/__tests__/trustedOperationalApi.test.js` and verify the new cases fail for the absent workflow.
- [ ] Wire both forms to the structured editor, preserve labelled Client locations, and block save on incomplete or unconfirmed locations.
- [ ] Ensure manual entry maps to existing safe provenance values without widening API authority.
- [ ] Re-run the focused workflow/API tests and verify they pass.

### Task 3: Optional Field access-point database authority

**Files:**
- Create: `supabase/migrations/20260904170000_field_access_point_authority.sql`
- Create: `src/__tests__/fieldAccessPointMigration.test.js`
- Modify: `src/__tests__/migrationChain.test.js` if the repository ledger test requires explicit ordering.

**Interfaces:**
- Produces nullable Field columns `access_point_label`, `access_latitude`, `access_longitude`, `access_coordinate_source`, `access_location_confirmed_at` through existing `ftf_write_operational_resource_unlocked` authority.
- Consumes the authenticated organisation and existing Field-to-Property relationship.

- [ ] Write failing migration behaviour/security tests for nullable existing Fields, all-or-none access evidence, coordinate ranges, allowed sources, bounded labels, same-organisation ownership, audit/outbox preservation, and zero direct browser table authority.
- [ ] Run `CI=true npm test -- --runInBand src/__tests__/fieldAccessPointMigration.test.js` and verify it fails because the migration is absent.
- [ ] Add the additive migration, extend only checked Field write projection/trigger handling, and preserve existing grants/RLS.
- [ ] Re-run migration/security tests and verify they pass.

### Task 4: Field API types and mapping

**Files:**
- Modify: `server/operational-api.js`
- Modify: `src/types/fieldManagement.ts`
- Modify: `src/services/operationalApi.ts`
- Modify: `src/services/operationalDataStore.ts` only if its input projection is explicit.
- Modify: `src/services/__tests__/operationalApi.test.ts`
- Modify: `src/__tests__/trustedOperationalApi.test.js`

**Interfaces:**
- Produces `FieldAccessPoint` and nullable Field API properties using the checked operational endpoint.
- Consumes database columns from Task 3.

- [ ] Add failing mapper and API tests proving exact round-trip mapping, omission for existing Fields, rejection of partial/malformed evidence, and same-tenant checked writes.
- [ ] Run `CI=true npm test -- --runInBand src/services/__tests__/operationalApi.test.ts src/__tests__/trustedOperationalApi.test.js` and verify expected failures.
- [ ] Implement minimal types, writable allow-list entries, mapping, and validation.
- [ ] Re-run focused API tests and verify they pass.

### Task 5: Field access/launch point user workflow

**Files:**
- Modify: `src/pages/FieldWorkspace.tsx`
- Create: `src/pages/FieldAccessPoint.test.tsx`
- Modify: `src/pages/OperationalWorkflow.test.tsx`

**Interfaces:**
- Consumes optional Field access-point API shape from Task 4 and existing Property coordinate/boundary context.
- Produces an optional explicitly confirmed point labelled by the operator.

- [ ] Add failing component/workflow tests proving the feature is optional, initially frames the boundary or Property, cannot save partial evidence, requires reconfirmation after moving, and clears as one explicit action.
- [ ] Run `CI=true npm test -- --runInBand src/pages/FieldAccessPoint.test.tsx src/pages/OperationalWorkflow.test.tsx` and verify expected failures.
- [ ] Implement progressive disclosure, accessible map controls, confirmation state, and exact checked Field update.
- [ ] Re-run focused Field tests and verify they pass.

### Task 6: Cross-browser and complete verification

**Files:**
- Create or modify the repository's existing operational Playwright acceptance spec for Client/Property/Field location workflows.
- Modify no Production configuration.

**Interfaces:**
- Consumes all preceding completed behaviour.
- Produces release-preparation evidence only; no Production mutation.

- [ ] Add Chromium and WebKit scenarios for manual rural address entry, editing a searched address, dragging/confirming the exact pin, and optional Field access-point confirmation at phone, tablet, and desktop sizes.
- [ ] Run the focused Jest suites from Tasks 1–5.
- [ ] Run the new Chromium and WebKit scenarios and confirm equivalent payload and confirmation behaviour.
- [ ] Run all deterministic regression shards, Product Maturity verification, migration lint/dry-run tooling, and the Production build using repository-governed commands.
- [ ] Inspect `git diff --check`, `git status --short`, and the complete diff; confirm no unrelated changes, Production mutation, deployment, or genuine-record access occurred.
