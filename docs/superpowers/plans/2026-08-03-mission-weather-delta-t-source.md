# Mission Weather Delta T Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators retain either Kestrel-measured or server-calculated Delta T as immutable Mission Weather evidence.

**Architecture:** Extend the repository-controlled PostgreSQL weather evidence schema and trusted command with explicit Delta T provenance and comparison fields. Keep the public route stable and connect the existing Mission panel through its current API adapter.

**Tech Stack:** React, TypeScript, Material UI, Node/Vercel API, Supabase PostgreSQL, Jest, PGlite.

## Global Constraints

- PostgreSQL remains authoritative for calculations, comparison, evidence and provenance.
- Kestrel evidence is never silently replaced by a calculated value.
- Existing observations remain readable and retain their existing Delta T.
- Existing tenant, location, permission, RLS, audit, outbox and optimistic-concurrency controls remain mandatory.
- No local or legacy persistence fallback.

---

### Task 1: PostgreSQL Delta T evidence provenance

**Files:**
- Create: `supabase/migrations/20260803080000_mission_weather_delta_t_sources.sql`
- Modify: `src/__tests__/authoritativeMissionWeatherPglite.test.js`

**Interfaces:**
- Consumes: `public.ftf_calculate_delta_t(numeric,numeric)` and `public.ftf_create_mission_weather_observation(...)`.
- Produces: observation fields `delta_t_source`, `calculated_delta_t_c`, `delta_t_variance_c`, `delta_t_variance_warning`.

- [ ] Add a failing PGlite test proving calculated mode, Kestrel mode, mismatch warning, immutable provenance, migration compatibility, audit and outbox.
- [ ] Run `CI=true npm test -- --runInBand src/__tests__/authoritativeMissionWeatherPglite.test.js` and confirm RED.
- [ ] Add the four columns, backfill existing records to `CALCULATED`, add constraints, and replace the trusted command so `deltaTMode=CALCULATED` stores the server result while `KESTREL_MEASURED` stores submitted `deltaTC` plus its server comparison and variance.
- [ ] Include source and variance evidence in audit and outbox payloads.
- [ ] Re-run the PGlite test and confirm PASS.

### Task 2: Trusted API validation

**Files:**
- Modify: `server/operational-api.js`
- Modify: `server/operational-repository.js`
- Modify: `src/__tests__/missionWeatherOperationalApi.test.js`

**Interfaces:**
- Consumes: `deltaTMode: 'CALCULATED' | 'KESTREL_MEASURED'`, optional `deltaTC: number`.
- Produces: existing `POST /api/v1/mission-weather` response with the stored evidence fields.

- [ ] Add failing handler tests for both modes, missing/invalid Kestrel values and non-blocking variance evidence.
- [ ] Run `CI=true npm test -- --runInBand src/__tests__/missionWeatherOperationalApi.test.js` and confirm RED.
- [ ] Validate the mode and Kestrel value before repository execution; remove the obsolete mismatch rejection mapping.
- [ ] Re-run the handler tests and confirm PASS.

### Task 3: Mission Weather panel

**Files:**
- Modify: `src/components/mission/MissionWeatherEvidence.tsx`
- Modify: `src/components/mission/__tests__/MissionWeatherEvidence.test.tsx`

**Interfaces:**
- Consumes: trusted Weather response fields from Tasks 1–2.
- Produces: checkbox `Calculate Delta T from temperature and humidity`, Delta T input, source label and mismatch warning.

- [ ] Add failing component tests for checked calculated mode, unchecked Kestrel entry, save payloads, read-only calculated display and non-blocking variance warning.
- [ ] Run the component test and confirm RED.
- [ ] Add the checkbox and Delta T field immediately above Save; calculated mode is read-only and Kestrel mode requires numeric entry.
- [ ] Display the authoritative value, source, comparison and warning from the server response without client-authoritative calculation.
- [ ] Re-run the component tests and confirm PASS.

### Task 4: Verification, migration and deployment

**Files:**
- Modify only if verification exposes a defect in Tasks 1–3.

- [ ] Run focused Weather tests, the complete test suite, migration verifier, `git diff --check` and `npm run build`.
- [ ] Commit with `NEW-WEA-001` and `IMP-MIS-004`, push `codex/production-beta`, and wait for Vercel production readiness.
- [ ] Confirm the Supabase CLI is linked to `fzkrvglzompkuiodqllr`, then apply the repository migration.
- [ ] Verify production smoke tests and the deployed Mission panel.
- [ ] Save and reopen both authoritative modes, then verify refresh, re-login, second-session, concurrency, tenant/location denial, audit, outbox and no-fallback behaviour.
