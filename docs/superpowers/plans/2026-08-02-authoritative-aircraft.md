# Authoritative Aircraft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Aircraft workflow authoritative, tenant- and location-scoped, concurrency-safe, and mission-ready in PostgreSQL without changing Equipment Kits or configurations.

**Architecture:** Add a relational `aircraft` aggregate and repository-controlled trusted-write/RLS migration, expose it through the existing versioned dispatcher, and connect the current Aircraft context to a strict typed API gateway in remote mode. Local mode retains the existing development persistence, while remote mode never reads or writes Aircraft through generic legacy storage.

**Tech Stack:** React 18, TypeScript, Node/Vercel functions, PostgreSQL/Supabase, Jest, PGlite.

## Global Constraints

- Preserve the existing Aircraft screen, form, supported fields, and workflows.
- PostgreSQL is authoritative in Production Beta; no remote fallback to `ftf_aircraft_data` or `ftf_store`.
- Enforce organisation and operating-location scope in trusted server execution and PostgreSQL.
- Require optimistic concurrency, controlled archive, audit events, and transactional outbox delivery.
- Equipment Kits and Aircraft Kit Configurations remain on their existing path until the next package.
- Requirement classification: RET Aircraft user capability; REP legacy Aircraft persistence; IMP Aircraft validation/security/readiness.

---

### Task 1: Relational Aircraft aggregate and trusted persistence

**Files:**
- Create: `supabase/migrations/20260802000000_authoritative_aircraft.sql`
- Create: `src/__tests__/authoritativeAircraftPglite.test.js`

**Interfaces:**
- Produces: tenant-scoped `public.aircraft`, `ftf_write_operational_resource(..., p_resource => 'aircraft')`, RLS/revokes, audit and outbox records.

- [ ] Write PGlite tests that create two organisations and locations, exercise create/update/archive, reject duplicate registration/serial, reject cross-tenant and unassigned-location writes, prove row-version conflict, and verify audit/outbox.
- [ ] Run `npm test -- --watchAll=false src/__tests__/authoritativeAircraftPglite.test.js` and confirm the missing migration behavior fails.
- [ ] Add the migration with normalized identity, readiness, limits, maintenance, insurance, controlled document metadata, provenance, archive, and row-version columns.
- [ ] Re-run the focused test and commit with the approved Aircraft RET/REP/IMP requirement references.

### Task 2: Versioned Aircraft API contract

**Files:**
- Modify: `server/operational-api.js`
- Modify: `server/operational-repository.js`
- Modify: `server/operational-dispatcher.js`
- Create: `src/__tests__/aircraftOperationalApi.test.js`
- Modify: `src/__tests__/versionedApiDispatcher.test.js`

**Interfaces:**
- Produces: `GET|POST|PATCH|DELETE /api/v1/aircraft`, strict field validation, `aircraft.read/create/update/archive/serviceability` permissions, location filtering, and concurrency errors.

- [ ] Write failing handler and dispatcher tests using complete Aircraft fixtures and observable status/payload outcomes.
- [ ] Run the focused tests and confirm failures occur because Aircraft is unsupported.
- [ ] Add the Aircraft schema, validation, location/readiness rules, repository table/filter, and dispatcher entry without adding domain logic to the dispatcher.
- [ ] Re-run the focused tests and commit.

### Task 3: Strict browser Aircraft gateway

**Files:**
- Modify: `src/types/aircraft.ts`
- Create: `src/services/aircraftApi.ts`
- Create: `src/services/__tests__/aircraftApi.test.ts`

**Interfaces:**
- Produces: `AircraftApiGateway` list/create/update/archive functions and strict response mapping to the existing `Aircraft` model with `rowVersion` and `operatingLocationId`.

- [ ] Write failing tests for complete record mapping, malformed responses, API error envelopes, credentials, expected version, and no legacy request path.
- [ ] Run the focused test and confirm the missing gateway failure.
- [ ] Implement the typed gateway against `/api/v1/aircraft` only.
- [ ] Re-run the focused test and commit.

### Task 4: Preserve and connect AircraftContext

**Files:**
- Modify: `src/contexts/AircraftContext.tsx`
- Create: `src/contexts/__tests__/AircraftContext.remote.test.tsx`
- Modify: `src/contexts/__tests__/AircraftContext.compatibility.test.tsx`

**Interfaces:**
- Consumes: `AircraftApiGateway`.
- Produces: existing `useAircraft()` public interface backed by confirmed server records in remote mode; Equipment Kits/configurations remain on their current path.

- [ ] Write failing tests for remote load/create/update/archive, visible failure/conflict/unauthorised states, no optimistic local record, and zero `ftf_aircraft_data` requests.
- [ ] Run the focused tests and confirm they fail on legacy persistence behavior.
- [ ] Split Aircraft remote CRUD from kit/configuration legacy persistence while retaining the existing context interface and local-mode behavior.
- [ ] Re-run context and compatibility tests and commit.

### Task 5: Operating-location selection and migration tooling

**Files:**
- Modify: `src/components/AircraftForm.tsx`
- Modify: `src/pages/AircraftManagement.tsx`
- Create: `scripts/migrate-aircraft.mjs`
- Create: `src/__tests__/aircraftMigration.test.js`
- Create: `src/components/__tests__/AircraftForm.remote.test.tsx`

**Interfaces:**
- Produces: assigned-location selection on the preserved form and an idempotent, dry-run-first migration/reconciliation command with source IDs and error reporting.

- [ ] Write failing UI tests for assigned-location selection and backend error visibility, plus migration tests for mapping, deduplication, idempotency, invalid-record reporting, and reconciliation.
- [ ] Run focused tests and confirm expected failures.
- [ ] Add the minimum form wiring and migration script without redesigning the Aircraft UI.
- [ ] Re-run focused tests and commit.

### Task 6: Full verification and operational evidence

**Files:**
- Create: `docs/production-beta-aircraft-acceptance.md`

**Interfaces:**
- Produces: reproducible evidence for persistence, second-user access, isolation, location scope, concurrency, archive, audit/outbox, RLS, migration, and absence of legacy fallback.

- [ ] Run all Aircraft-focused tests, all existing tests, lint/type checks through the production build, and migration tests.
- [ ] Apply the migration to a controlled environment, run the migration in dry-run and apply modes, reconcile source and target counts, and verify rollback/recovery instructions.
- [ ] Deploy, create and reopen a real Fly The Farm Aircraft through the existing frontend, then capture the required multi-session/security/audit evidence.
- [ ] Commit the verified acceptance evidence only after each claim has current command or deployed proof.
