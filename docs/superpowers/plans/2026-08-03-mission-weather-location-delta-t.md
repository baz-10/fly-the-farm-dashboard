# Mission Weather Location Capture and Delta T Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture device coordinates explicitly in the Mission Weather panel and visibly retain PostgreSQL-calculated Delta T.

**Architecture:** Add a small injected geolocation boundary to `MissionWeatherEvidence`; the component owns capture state while the trusted Weather API remains unchanged. Coordinates are read-only and Delta T is rendered only from server-created or server-read records.

**Tech Stack:** React 19, TypeScript, Material UI, Jest/Testing Library, PostgreSQL trusted commands, Vercel.

## Global Constraints

- No automatic location request when the panel opens.
- No editable latitude or longitude fields.
- No client-side Delta T calculation or fallback.
- No browser or legacy persistence.
- Existing authentication, permission, tenant, operating-location, versioning, audit and outbox controls remain unchanged.

---

### Task 1: Explicit device location capture

**Files:**
- Modify: `src/components/mission/MissionWeatherEvidence.tsx`
- Test: `src/components/mission/__tests__/MissionWeatherEvidence.test.tsx`

**Interfaces:**
- Consumes: `getCurrentPosition(success, failure, options)` compatible with `navigator.geolocation.getCurrentPosition`.
- Produces: read-only latitude/longitude form state and visible capture status.

- [ ] **Step 1: Write the failing capture test**

Add a test that injects a geolocation function returning latitude `-27.5`, longitude `153.1`, and accuracy `8`; click `Capture current location`; assert the read-only Latitude and Longitude inputs contain those values and the capture message includes `8 m`.

- [ ] **Step 2: Verify RED**

Run `CI=true npm test -- --runInBand src/components/mission/__tests__/MissionWeatherEvidence.test.tsx` and expect failure because the capture action is absent.

- [ ] **Step 3: Implement the minimum capture boundary**

Add optional prop `getCurrentPosition?: Geolocation['getCurrentPosition']`, defaulting to a wrapper around `navigator.geolocation.getCurrentPosition`. The button invokes it with `{enableHighAccuracy:true,timeout:15000,maximumAge:0}`. On success store finite in-range coordinates and accuracy; on failure show a visible error. Render coordinate fields with `InputProps={{readOnly:true}}`.

- [ ] **Step 4: Add and pass failure/save-gating tests**

Test permission failure shows `Current location could not be captured` and does not invoke `weatherApi.createManual`. Assert save remains disabled until observer, captured location and required weather values exist.

- [ ] **Step 5: Run focused tests**

Run the component, API, PostgreSQL and remote Mission tests; all must pass.

### Task 2: Server-authoritative Delta T visibility

**Files:**
- Modify: `src/components/mission/MissionWeatherEvidence.tsx`
- Test: `src/components/mission/__tests__/MissionWeatherEvidence.test.tsx`

**Interfaces:**
- Consumes: `delta_t_c` from `weatherApi.createManual` and `weatherApi.read`.
- Produces: visible `Authoritative Delta T: <value> °C` only when persisted server evidence supplies the value.

- [ ] **Step 1: Write the failing Delta T test**

Save an observation whose API result contains `delta_t_c: 9.6`; assert `Authoritative Delta T: 9.6 °C`. Render retrieved history with the same field and assert the same visible evidence survives component reload.

- [ ] **Step 2: Verify RED**

Run the focused component test and expect the new authoritative label to be absent.

- [ ] **Step 3: Implement server-only display**

Render the label from `delta_t_c`/`deltaTC` on persisted observation records. Do not add a calculation utility or a Delta T input.

- [ ] **Step 4: Verify GREEN and regression suite**

Run `CI=true npm test -- --runInBand`, `node scripts/verifyAuthoritativeMissionWeatherMigration.mjs`, `npm run build`, and `git diff --check`.

- [ ] **Step 5: Commit and deploy**

Commit with `NEW-WEA-001` and `IMP-MIS-004`, push `codex/production-beta`, wait for Vercel Ready, and smoke-test the deployed API.

### Task 3: Deployed operational acceptance

**Files:**
- No production file changes expected.

**Interfaces:**
- Consumes: deployed Mission planner, real authorised Personnel observer, device geolocation and real weather readings.
- Produces: persisted versioned Mission Weather evidence selected for readiness.

- [ ] **Step 1: Capture the operator's current location in the deployed Mission**
- [ ] **Step 2: Save the real manual observation and verify returned Delta T**
- [ ] **Step 3: Refresh, re-login and reopen from a second authorised session**
- [ ] **Step 4: Exercise stale-write, tenant and operating-location denials**
- [ ] **Step 5: Verify audit and outbox evidence and confirm no legacy fallback**

