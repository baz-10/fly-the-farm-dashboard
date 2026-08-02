# Authoritative Mission Weather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Fly The Farm capture and use versioned, readiness-evaluated Weather evidence directly inside an authoritative Mission.

**Architecture:** Add immutable PostgreSQL weather evidence and selection records behind trusted RPCs, the versioned application API, and a provider-neutral frontend adapter. Keep calculation, freshness, observer assignment, and readiness authoritative on the server while extending the existing Mission planner.

**Tech Stack:** PostgreSQL/Supabase migrations and RLS, Node/Vercel API handlers, Open-Meteo adapter, React/TypeScript/MUI, Jest/RTL, PGlite.

## Global Constraints

- Preserve the existing Mission frontend and public `/api/v1/*` contract.
- No standalone Weather module and no browser/local-storage fallback.
- Weather evidence is immutable; selection uses optimistic concurrency.
- Delta T uses the approved Stull approximation and `0.3 °C` mismatch tolerance.
- Manual evidence requires authorised active Personnel and configured Mission assignment.
- Every write is tenant/location scoped and atomic with audit/outbox.
- Provider-specific data remains behind adapters and outside core Mission logic.

---

### Task 1: Weather evidence, policy, calculation, freshness, and readiness contract

**Files:**
- Create: `supabase/migrations/20260802025000_authoritative_mission_weather.sql`
- Create: `scripts/verifyAuthoritativeMissionWeatherMigration.mjs`
- Create: `src/__tests__/authoritativeMissionWeatherPglite.test.js`

**Interfaces:**
- Produces `ftf_calculate_delta_t`, `ftf_create_mission_weather_observation`, `ftf_read_mission_weather`, `ftf_select_mission_weather_observation`, and `ftf_evaluate_mission_weather_readiness`.
- Produces permissions `weather.read`, `weather.observe.manual`, `weather.observe.provider`, and `weather.select`.

- [ ] Write a PGlite behavior runner covering the approved Stull literal fixtures, `0.3 °C` tolerance, manual/provider creation, policy freshness states, explicit inversion, observer assignment, immutable version history, selection conflicts, tenant/location denial, forced RLS, audit, and outbox.
- [ ] Add a Jest wrapper, run it, and confirm RED because the migration is absent.
- [ ] Implement policy, immutable evidence, selection tables, tenant composite keys, indexes, forced RLS, permissions, RPCs, and structured readiness results.
- [ ] Run the focused suite until GREEN, run `git diff --check`, and commit `NEW-WEA-001 IMP-MIS-004`.

### Task 2: Trusted Weather API and Open-Meteo adapter

**Files:**
- Create: `server/mission-weather.js`
- Create: `src/__tests__/missionWeatherOperationalApi.test.js`
- Modify: `server/operational-repository.js`
- Modify: `server/operational-dispatcher.js`

**Interfaces:**
- Produces `/api/v1/mission-weather` GET, manual/provider POST, selection POST, and readiness GET operations.
- Converts Open-Meteo data into the same trusted observation command with governed provenance.

- [ ] Write failing handler tests for authentication, permissions, allowlists, UUID/range/date validation, same-origin writes, tenant/location hiding, provider failure atomicity, blockers, and conflicts.
- [ ] Run focused tests and confirm RED from missing handler/dispatcher/repository methods.
- [ ] Implement transport handlers, repository RPC methods, and an injected Open-Meteo adapter without domain logic in the dispatcher.
- [ ] Run handler/repository/dispatcher regression suites until GREEN and commit `NEW-WEA-001 IMP-MIS-004`.

### Task 3: Provider-neutral frontend Weather adapter

**Files:**
- Create: `src/types/missionWeatherEvidence.ts`
- Create: `src/services/missionWeatherApi.ts`
- Create: `src/services/__tests__/missionWeatherApi.test.ts`

**Interfaces:**
- Produces `createMissionWeatherApi()` with `read`, `createManual`, `createFromOpenMeteo`, `select`, and `readiness` methods.
- Exposes typed observations, freshness, blockers, warnings, and conflict errors.

- [ ] Write failing tests for exact versioned paths, credentials, provider-neutral payloads, blocker envelopes, `409` conflicts, and no legacy endpoints.
- [ ] Implement the minimal types and adapter, run GREEN, and commit `NEW-WEA-001`.

### Task 4: Activate Weather in the existing Mission planner

**Files:**
- Create: `src/components/mission/MissionWeatherEvidence.tsx`
- Create: `src/components/mission/__tests__/MissionWeatherEvidence.test.tsx`
- Modify: `src/pages/MissionPlanning.tsx`
- Modify: `src/pages/MissionRemoteWorkflow.test.tsx`

**Interfaces:**
- Consumes Mission ID, scheduled time, operating-location context, authoritative Personnel, and `createMissionWeatherApi()`.
- Produces manual entry, Open-Meteo capture, history, selection, freshness, Delta T, inversion, and readiness reasons inside Mission.

- [ ] Write failing component tests for required manual fields, Personnel observer, authoritative Delta T display, explicit inversion, freshness, blocker/warning display, selection, history, and failed-save preservation.
- [ ] Write a failing remote Mission test proving Weather is active and no browser persistence is called.
- [ ] Implement the focused panel using existing cards/forms and remove Weather from unavailable capabilities only when authoritative loading succeeds.
- [ ] Run component and Mission workflow suites until GREEN and commit `IMP-MIS-004`.

### Task 5: Release and live Mission acceptance

**Files:**
- Modify only defects discovered by verification; applied-schema corrections use a new forward migration.

**Interfaces:**
- Produces deployed evidence that a real Mission can retain and evaluate Weather.

- [ ] Run all Jest suites, production build, and `git diff --check` sequentially.
- [ ] Confirm project ref and authenticated CLI both identify `fzkrvglzompkuiodqllr` before a migration dry-run and push.
- [ ] Push `codex/production-beta`, wait for the Git-triggered Vercel production deployment, and run unauthenticated route smoke tests.
- [ ] In the deployed Mission planner create manual evidence linked to Personnel, capture Open-Meteo evidence, verify Delta T/freshness/readiness/history/selection, refresh, re-login, second session, stale conflict, tenant/location denial, audit/outbox, and no fallback.
- [ ] Report what Fly The Farm can use and the next blocker in the Weather → Chemicals → JSA chain.

