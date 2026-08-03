# Mission Weather Boundary Location Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator explicitly save truthful manual Weather evidence using the exact authoritative Mission-boundary centroid when device GPS is unavailable.

**Architecture:** The UI submits a source-specific evidence command. PostgreSQL resolves and validates the referenced immutable Mission map revision and geometry, calculates the boundary centroid server-side, and stores all provenance on the immutable Weather revision. Readiness, authorisation snapshots, and Mission Packs consume the persisted source without inference from current map state.

**Tech Stack:** React, TypeScript, Material UI, Vitest/Testing Library, Node/Vercel server API, Supabase PostgreSQL/RLS/SQL RPCs.

## Global Constraints

- Device GPS remains preferred; boundary fallback is always explicit.
- `MISSION_BOUNDARY` evidence must reference the exact saved map revision and geometry.
- Later map changes never alter saved Weather evidence.
- No local-storage or legacy fallback.
- Preserve tenant isolation, operating-location scope, permissions, optimistic concurrency, audit, and transactional outbox.

---

### Task 1: Define and prove the transport contract

**Files:**
- Modify: `server/__tests__/mission-weather-api.test.js`
- Modify: `server/operational-api.js`

**Interfaces:**
- Consumes: manual Weather POST body.
- Produces: validated `locationSource`, `locationCapturedAt`, optional `locationAccuracyM`, `locationFailureReason`, `missionMapRevisionId`, `missionBoundaryGeometryId`, and `centroidCalculationVersion`.

- [ ] Write API tests showing valid device and boundary payloads pass, while missing boundary references and unknown sources return validation errors.
- [ ] Run the focused API tests and confirm RED because location provenance is not validated.
- [ ] Add the minimal source-specific request validation.
- [ ] Run the focused API tests and confirm GREEN.

### Task 2: Persist authoritative boundary provenance and centroid

**Files:**
- Create: `supabase/migrations/20260803112000_mission_weather_location_provenance.sql`
- Modify: `scripts/verify-mission-weather-behavior.js`

**Interfaces:**
- Consumes: the validated Weather command and immutable Mission-map identifiers.
- Produces: immutable Weather columns and a server-calculated `MISSION_BOUNDARY` centroid with audit/outbox provenance.

- [ ] Extend the PostgreSQL verifier with literal fixtures for valid fallback, invalid geometry, cross-tenant/location references, readiness, history after a later map revision, audit, and outbox.
- [ ] Run the verifier and confirm RED because the provenance columns and validation do not exist.
- [ ] Add immutable provenance columns, classify existing rows as `LEGACY_RECORDED`, and replace the Weather creation RPC with source-specific validation and authoritative centroid calculation version `POLYGON_CENTROID_V1`.
- [ ] Run the verifier and confirm GREEN.

### Task 3: Expose exact map revision identity

**Files:**
- Modify: `server/operational-api.js`
- Modify: `server/__tests__/mission-maps-api.test.js`
- Modify: `src/services/missionMapsApi.ts`

**Interfaces:**
- Produces: `MissionMapRevision.id` in the existing map response without changing existing fields.

- [ ] Add a failing map API test asserting immutable revision ID is returned.
- [ ] Run it and confirm RED.
- [ ] Map the existing database `id` and type it as `MissionMapRevision.id`.
- [ ] Run it and confirm GREEN.

### Task 4: Remove the browser dead end

**Files:**
- Modify: `src/components/mission/__tests__/MissionWeatherEvidence.test.tsx`
- Modify: `src/components/mission/MissionWeatherEvidence.tsx`
- Modify: `src/pages/MissionPlanning.tsx`

**Interfaces:**
- Consumes: exact authoritative map revision and a valid boundary geometry.
- Produces: explicit GPS or boundary-source Weather commands and visible provenance.

- [ ] Add failing UI tests for GPS success, denied/unavailable GPS, explicit fallback, missing boundary blocker, visible source, and retained references.
- [ ] Run the focused component tests and confirm RED.
- [ ] Pass the authoritative map revision into the Weather panel, expose the fallback only after failure, and submit the source-specific evidence payload.
- [ ] Run the focused tests and confirm GREEN.

### Task 5: Preserve source through readiness and Mission Pack

**Files:**
- Modify: `src/utils/__tests__/missionPackDocument.test.ts`
- Modify: `src/utils/missionPackDocument.ts`
- Modify: `server/__tests__/mission-authorisation-api.test.js`

**Interfaces:**
- Consumes: selected immutable Weather observation already captured in authorisation evidence.
- Produces: Mission Pack copy identifying Device GPS or Mission boundary centroid.

- [ ] Add failing tests for both source labels and boundary revision evidence.
- [ ] Run them and confirm RED.
- [ ] Render the persisted source and boundary references without consulting current map state.
- [ ] Run them and confirm GREEN.

### Task 6: Verify, migrate, deploy, and accept

**Files:**
- Modify only if verification reveals a defect in the approved scope.

- [ ] Run all focused tests, the PostgreSQL verifier, lint, full test suite, and production build.
- [ ] Confirm Supabase CLI is linked to project `fzkrvglzompkuiodqllr` and dry-run the repository migration.
- [ ] Commit with `IMP-WEA-001`, push `codex/production-beta`, then apply the migration and confirm the Vercel deployment is Ready.
- [ ] Prove live fallback selection, save/reopen, readiness, audit/outbox, and Mission Pack source display without browser persistence.
