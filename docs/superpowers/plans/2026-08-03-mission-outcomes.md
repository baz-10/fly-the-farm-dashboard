# Mission Outcomes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional, longitudinal, immutable Mission Outcome Observations with photos and separate follow-up actions to the deployed completed-Mission workflow.

**Architecture:** Repository-controlled PostgreSQL catalogues and append-only evidence tables provide tenant-safe authoritative storage. One versioned dispatcher resource exposes trusted reads, photo staging, atomic observation creation and optimistic-concurrency follow-up commands. The existing Mission screen renders a chronological Mission Outcomes timeline and one focused observation workflow without changing Mission Completion.

**Tech Stack:** PostgreSQL/Supabase RLS and RPCs, Node/Vercel dispatcher, React/TypeScript, Material UI, Jest, Testing Library, PGlite.

## Global Constraints

- User-facing term: `Mission Outcomes`.
- Observation rows and claimed photo rows are immutable and never deleted.
- Corrections create a new observation with `supersedes_observation_id`.
- Observation types, methods and confidence definitions come from repository-controlled catalogues.
- Mission Outcomes remain optional and never gate Mission Completion.
- Operational Events remain a separate Operational lifecycle stream.
- Operational Knowledge eligibility is stored but nomination/publication is not implemented.
- Files use internal IDs, immutable versions, SHA-256 checksums and opaque provider keys; never permanent provider URLs.
- Tenant, operating-location, permission, audit and transactional-outbox controls are mandatory.
- No browser storage or legacy persistence fallback.

---

### Task 1: PostgreSQL Mission Outcome evidence model

**Files:**
- Create: `supabase/migrations/20260803130000_authoritative_mission_outcomes.sql`
- Create: `src/__tests__/authoritativeMissionOutcomesMigration.test.js`
- Create: `src/__tests__/authoritativeMissionOutcomesPglite.test.js`

**Interfaces:**
- Produces RPCs:
  - `ftf_read_mission_outcomes(uuid, uuid) returns jsonb`
  - `ftf_stage_mission_outcome_photo(uuid, uuid, uuid, jsonb) returns jsonb`
  - `ftf_create_mission_outcome_observation(uuid, uuid, uuid, jsonb) returns jsonb`
  - `ftf_write_mission_outcome_follow_up(uuid, uuid, uuid, uuid, integer, jsonb) returns jsonb`

- [ ] **Step 1: Write failing migration contract tests**

Assert that the migration creates platform catalogues, append-only observations, pending files, immutable claimed files, follow-up actions, RLS, immutability triggers, permissions, RPCs, audit topics and outbox topics. Assert there is no observation update/delete RPC and no Operational Event table reuse.

```js
expect(sql).toContain('create table public.mission_outcome_observations');
expect(sql).toContain("'post_mission.mission.outcome_observed'");
expect(sql).not.toContain('update public.mission_outcome_observations');
```

- [ ] **Step 2: Run the migration contract test and confirm RED**

Run: `CI=true npm test -- --watchAll=false src/__tests__/authoritativeMissionOutcomesMigration.test.js`  
Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Write failing PGlite behaviour tests**

Pressure-test three observations on one completed Mission, server-derived days since application, confidence snapshots, catalogue-backed types/methods, immutable updates/deletes, supersession, missing Completion rejection, invalid observer/location rejection, photo claim atomicity, eligibility rule version 1, follow-up concurrency, Completion snapshot stability, audit and outbox creation.

```js
const originalCompletion = await db.query("select completion_snapshot from mission_completion_revisions where id=$1", [completionId]);
await createObservation({ observationTypeCode: 'INITIAL', confidenceCode: 'HIGH', targetSpecies: ['Lantana'], controlPercentage: 85 });
expect((await db.query("select completion_snapshot from mission_completion_revisions where id=$1", [completionId])).rows[0]).toEqual(originalCompletion.rows[0]);
```

- [ ] **Step 4: Run the PGlite test and confirm RED**

Run: `CI=true npm test -- --watchAll=false src/__tests__/authoritativeMissionOutcomesPglite.test.js`  
Expected: FAIL because the schema and RPCs are absent.

- [ ] **Step 5: Implement the migration**

Create repository-controlled catalogues:

- `mission_outcome_observation_types`: stable ID/code, display name, description, display order, version and active state.
- `mission_outcome_methods`: stable ID/code, display name, description, display order, version and active state.
- `mission_outcome_confidence_levels`: stable ID/code, display name, exact approved definition, display order and version.

Create:

- `mission_outcome_observations` with Completion reference, sequence, snapshots, conditions, structured outcome, supersession and eligibility evidence.
- `mission_outcome_pending_files` with 24-hour expiry and upload ownership.
- `mission_outcome_observation_files` with immutable internal file/version/checksum/provider metadata.
- `mission_outcome_follow_up_actions` with `OPEN | IN_PROGRESS | COMPLETED | CANCELLED` status and row version.

Seed the approved type, method and confidence catalogues. Force RLS. Use `reject_append_only_mutation()` on observations and claimed photos. Provision `mission.outcomes.read`, `mission.outcomes.create`, `mission.outcomes.photo.upload` and `mission.outcomes.follow_up.manage` through normal role provisioning.

In `ftf_create_mission_outcome_observation`, lock the Mission, resolve the latest Completion revision, validate location and Personnel, derive `days_since_application`, snapshot catalogue/Personnel values, derive eligibility rule version 1, atomically claim owned pending files, create the audit event and outbox event, and return the complete observation.

- [ ] **Step 6: Run migration tests until GREEN**

Run both Task 1 test files. Expected: all tests pass.

- [ ] **Step 7: Run production schema regression tests**

Run: `CI=true npm test -- --watchAll=false src/__tests__/productionSchemaMigration.test.js src/__tests__/productionSchemaPglite.test.js`  
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260803130000_authoritative_mission_outcomes.sql src/__tests__/authoritativeMissionOutcomesMigration.test.js src/__tests__/authoritativeMissionOutcomesPglite.test.js
git commit -m "feat: add immutable Mission Outcome evidence (NEW-MIS-001)"
```

### Task 2: Trusted Mission Outcomes API

**Files:**
- Modify: `server/operational-repository.js`
- Modify: `server/operational-api.js`
- Modify: `server/operational-dispatcher.js`
- Create: `src/services/missionOutcomesApi.ts`
- Create: `src/services/__tests__/missionOutcomesApi.test.ts`
- Create: `src/__tests__/missionOutcomesOperationalApi.test.js`
- Modify: `src/__tests__/versionedApiDispatcher.test.js`

**Interfaces:**
- Produces `createMissionOutcomesHandler(dependencies?)`.
- Produces `createMissionOutcomesApi(fetcher?)` with:

```ts
read(missionId: string): Promise<MissionOutcomesState>
stagePhoto(missionId: string, input: StagePhotoInput): Promise<PendingPhoto>
createObservation(missionId: string, input: CreateObservationInput): Promise<MissionOutcomeObservation>
writeFollowUp(missionId: string, actionId: string | null, expectedVersion: number, input: FollowUpInput): Promise<FollowUpAction>
```

- [ ] **Step 1: Write failing handler tests**

Cover read, photo, observation and follow-up dispatch; authentication; permissions; tenant/location denial; completed-Mission requirement; field validation; confidence/type/method validation delegated to the repository; 3 MiB image limit; JPEG/PNG/WebP content types; 10-photo limit; unsupported actions; no observation PATCH/DELETE; and safe error envelopes.

- [ ] **Step 2: Run handler tests and confirm RED**

Run: `CI=true npm test -- --watchAll=false src/__tests__/missionOutcomesOperationalApi.test.js`  
Expected: FAIL because the handler is absent.

- [ ] **Step 3: Write failing client and dispatcher tests**

Assert the client uses only `/api/v1/mission-outcomes`, same-origin credentials and versioned commands. Assert the dispatcher routes only the new resource without changing existing resources.

- [ ] **Step 4: Run client/dispatcher tests and confirm RED**

Run the two Task 2 test files. Expected: FAIL because the API client and resource are absent.

- [ ] **Step 5: Implement repository methods and handler**

Map handler actions exactly:

- GET/no action → `readMissionOutcomes`
- POST/`photo` → validate and call `stageMissionOutcomePhoto`
- POST/`observation` → validate structured observation and call `createMissionOutcomeObservation`
- POST/`follow-up` → validate expected version and call `writeMissionOutcomeFollowUp`

Reject every other method/action. Use existing request context, same-origin, permission and location helpers. Never accept permanent URLs or client-supplied days-since-application/eligibility values.

- [ ] **Step 6: Implement the typed frontend client**

Keep request/response mapping inside `missionOutcomesApi.ts`; do not expose provider SDKs to components.

- [ ] **Step 7: Run Task 2 tests until GREEN**

Expected: handler, client and dispatcher suites pass.

- [ ] **Step 8: Commit**

```bash
git add server/operational-repository.js server/operational-api.js server/operational-dispatcher.js src/services/missionOutcomesApi.ts src/services/__tests__/missionOutcomesApi.test.ts src/__tests__/missionOutcomesOperationalApi.test.js src/__tests__/versionedApiDispatcher.test.js
git commit -m "feat: expose trusted Mission Outcomes API (NEW-MIS-001)"
```

### Task 3: Mission Outcomes timeline and observation workflow

**Files:**
- Create: `src/components/mission/MissionOutcomes.tsx`
- Create: `src/components/mission/__tests__/MissionOutcomes.test.tsx`
- Modify: `src/pages/MissionPlanning.tsx`
- Modify: `src/pages/MissionRemoteWorkflow.test.tsx`

**Interfaces:**
- Consumes `MissionOutcomesApi` from Task 2.
- Produces `<MissionOutcomes missionId={string} />`.

- [ ] **Step 1: Write failing component tests**

Test an empty optional state; timeline order; three immutable observations; catalogue-driven types/methods/confidence; exact confidence definitions; observation conditions; target species; photos by internal identity; follow-up action; correction/supersession display; eligibility display as internal/not published; and no edit/delete controls.

```tsx
expect(screen.getByText('Mission Outcomes')).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Record follow-up observation' })).toBeInTheDocument();
expect(screen.queryByRole('button', { name: /edit observation/i })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run component tests and confirm RED**

Run: `CI=true npm test -- --watchAll=false src/components/mission/__tests__/MissionOutcomes.test.tsx`  
Expected: FAIL because the workflow is absent.

- [ ] **Step 3: Implement the timeline**

Render chronological cards with date, days since application, type, observer snapshot, confidence plus definition, conditions, structured outcome, photos, supersession, eligibility and follow-up actions. Keep an empty completed Mission valid and show an optional invitation rather than a blocker.

- [ ] **Step 4: Implement the focused observation workflow**

Use server catalogues for selects. Prefill current linked Personnel when available and target species from authoritative Mission context where returned. Support photo upload/caption, explicit correction selection, optional follow-up action and one submit action. After success, close the form, reload authoritative state and offer `Record another observation`.

- [ ] **Step 5: Integrate after Operational Closeout**

Add the panel only for an authoritative existing Mission. Do not add it to local/legacy Mission state and do not change Completion readiness or closeout logic.

- [ ] **Step 6: Run component and Mission workflow tests until GREEN**

Run Task 3 tests plus `src/pages/MissionRemoteWorkflow.test.tsx`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/mission/MissionOutcomes.tsx src/components/mission/__tests__/MissionOutcomes.test.tsx src/pages/MissionPlanning.tsx src/pages/MissionRemoteWorkflow.test.tsx
git commit -m "feat: add Mission Outcomes workflow (NEW-MIS-001 IMP-MIS-001)"
```

### Task 4: Production migration, deployment and genuine lifecycle acceptance

**Files:**
- Modify only if deployed acceptance exposes a tested defect.

**Interfaces:**
- Consumes the repository-controlled migration and deployed Mission workflow.
- Produces accepted Post-Mission operational capability.

- [ ] **Step 1: Run complete local verification**

Run `CI=true npm test -- --watchAll=false`, `npm run build`, `git diff --check` and confirm a clean worktree.

- [ ] **Step 2: Verify the linked Supabase project before migration**

Read `.vercel/project.json` and Supabase CLI link state. Confirm project identity against the established Spray Command Production Beta project before any schema write.

- [ ] **Step 3: Apply the migration and verify schema behaviour**

Apply only `20260803130000_authoritative_mission_outcomes.sql`. Run the PostgreSQL behaviour verifier against the controlled production context and confirm tables, RLS, immutability, permissions and RPCs.

- [ ] **Step 4: Deploy to Vercel Production Beta**

Deploy the verified branch, wait for `READY`, confirm the production alias and record the deployment ID.

- [ ] **Step 5: Complete deployed lifecycle acceptance**

Using the completed authoritative Fly The Farm Mission, create three truthful Product Owner-provided observations over time, attach genuine photos, create one follow-up action, refresh, re-login and access from a second authorised session. Create a correction only if genuine corrected evidence exists; do not fabricate evidence solely for acceptance.

- [ ] **Step 6: Verify integrity evidence**

Confirm observation/photo rows, Personnel snapshots, Completion references, supersession where applicable, eligibility rule results, follow-up row versions, audit events and outbox events. Compare the Completion revision and snapshot before/after and prove they are unchanged. Confirm no Operational Knowledge publication record and no local/legacy fallback.

- [ ] **Step 7: Report the operational milestone**

Report what Fly The Farm can now do, the manual process retired, what genuine evidence was used, the deployment ID, test/build results and the next blocker to the first complete real Mission lifecycle.
