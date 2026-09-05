# Multi-Field, Multi-Day Mission Authority Inventory

**Frozen:** 4 September 2026  
**Purpose:** read-only compatibility and authority inventory for the founder-approved Multi-Field, Multi-Day Mission Operations design. This document authorises no Production migration, data mutation, or browser-local authority.

## Governing contract

The existing one-Field, one-day and single-aircraft paths remain supported subsets. Every new command must resolve organisation, Client, Property, Field, Mission, Base, aircraft and actor relationships on the server/database side; no browser payload, JSON cache or local state is authoritative.

`REUSE` means the object remains the authority unchanged. `EXTEND` means a future checked command or additive migration may use the existing authority without replacing it. `COMPATIBILITY_PROJECTION` means a legacy read/write shape remains available while checked relational authority becomes the source of truth. `DO_NOT_DUPLICATE` prohibits a competing table, RPC, API route, decoder or UI state owner.

## Adopted authority matrix

| Capability | Current database authority and RPC | Server/API owner | Decoder and UI owner | Classification and required boundary |
| --- | --- | --- | --- | --- |
| Client, Property and Field parent chain | `public.clients`, `public.properties`, `public.fields`; composite foreign keys bind Jobs and Fields to the chain | `server/operational-repository.js`, `server/operational-api.js` | `src/services/operationalApi.ts`; Job workspace/create flows | **REUSE.** Resolve Field → Property → Client server-side for every Job/Mission command. **DO_NOT_DUPLICATE:** no Mission-owned Client/Property/Field master data. |
| Job aggregate and multi-Field scope | `public.jobs` and `public.job_fields` (unique active `(organisation_id, job_id, field_id)`); Job `property_id` is the current first-Property link | `OperationalRepository`; `/api/v1/jobs` through `server/operational-api.js` | `OperationalJob` and `mapApiJob` in `src/services/operationalApi.ts`; `src/pages/JobWorkspace.tsx`, `src/components/mission/GuidedMissionCreation.tsx` | **EXTEND.** `public.job_fields` is the adopted normalized scope relation; future `ftf_write_job_scope` must validate the complete parent chain and lock the Job. **DO_NOT_DUPLICATE:** no second Job-Field join or ungoverned Field array authority. |
| Legacy Job scope shape | Legacy `jobs.fieldIds` application projection and `jobs.property_id` relation | Existing Job resource adapter | `OperationalJob.fieldIds` / `propertyId` in `src/services/operationalApi.ts` and legacy Job screens | **COMPATIBILITY_PROJECTION.** Continue to expose the one-Property/Field shape while relational scope is assessed and then extended; `propertyId` is the first selected Property only. It is not permission authority. |
| Mission identity and planning status | `public.missions`, `public.mission_versions`; current Mission assignment/map/chemical/pre-flight authority | `OperationalRepository`, `server/operational-api.js` | `src/services/operationalApi.ts`; `src/pages/MissionPlanning.tsx` | **EXTEND.** Keep Mission identity and lifecycle as the aggregate root; a future Mission-package boundary attaches to this aggregate. **DO_NOT_DUPLICATE:** no parallel Mission identity/status table. |
| Immutable Mission JSA | `public.mission_jsa_revisions`, responses, hazards, controls, attachments and approvals; `ftf_read_mission_jsa`, `ftf_save_mission_jsa`, `ftf_approve_mission_jsa`, `ftf_evaluate_mission_jsa_readiness` | `OperationalRepository.readMissionJsa/saveMissionJsa/approveMissionJsa`; `/api/v1/mission-jsa` in `createMissionJsaHandler` | `src/services/missionJsaApi.ts`, `src/types/missionJsa.ts`; `src/components/mission/AuthoritativeMissionJsa.tsx` in `src/pages/MissionPlanning.tsx` | **EXTEND.** Daily review confirmations reference the effective existing JSA revision. **DO_NOT_DUPLICATE:** no new daily JSA aggregate, mutable approval record or browser-only checklist authority. |
| CRP/PIC Mission authorisation and package | `public.mission_authorisation_revisions`, `public.mission_pack_revisions`; `ftf_evaluate_mission_readiness`, `ftf_read_mission_authorisation`, `ftf_authorise_mission`, `ftf_read_mission_pack`, `ftf_generate_mission_pack` | `OperationalRepository.readMissionAuthorisation/authoriseMission/readMissionPack/generateMissionPack`; `/api/v1/mission-authorisation` in `createMissionAuthorisationHandler` | `src/services/missionAuthorisationApi.ts`; `src/components/mission/MissionAuthorisation.tsx` in `src/pages/MissionPlanning.tsx` | **EXTEND.** Future package revisions and CRP decisions must preserve this immutable revision/decision model and exact evidence digest. **DO_NOT_DUPLICATE:** no Job-level mutable approval flag or second CRP decision stream. |
| Operational actuals and completion | `public.mission_operational_imports`, resource/chemical revisions, events, `public.mission_operational_revisions`, `public.mission_completion_revisions`; `ftf_read_mission_operational_closeout`, save/submit/complete RPCs | `OperationalRepository` closeout methods; `/api/v1/mission-operational-closeout` in `createMissionOperationalCloseoutHandler` | `src/services/missionOperationalCloseoutApi.ts`; `src/components/mission/MissionOperationalCloseout.tsx` in `src/pages/MissionPlanning.tsx` | **EXTEND.** Daily evidence is additive and final sign-off remains distinct from current operational completion. **DO_NOT_DUPLICATE:** no replacement closeout/Completion history or mutable completed evidence. |
| Mission Outcomes evidence and follow-up | `public.mission_outcome_observation_types`, `public.mission_outcome_methods`, `public.mission_outcome_confidence_levels`, `public.mission_outcome_observations`, `public.mission_outcome_pending_files`, `public.mission_outcome_observation_files`, `public.mission_outcome_follow_up_actions`; `ftf_read_mission_outcomes`, `ftf_stage_mission_outcome_photo`, `ftf_create_mission_outcome_observation`, `ftf_write_mission_outcome_follow_up` | `OperationalRepository.readMissionOutcomes/stageMissionOutcomePhoto/createMissionOutcomeObservation/writeMissionOutcomeFollowUp`; `/api/v1/mission-outcomes` in `createMissionOutcomesHandler` | `request` envelope boundary and `createMissionOutcomesApi` in `src/services/missionOutcomesApi.ts` (there is no separate structural Outcomes decoder); `src/components/mission/MissionOutcomes.tsx` in `src/pages/MissionPlanning.tsx` | **REUSE.** Retain post-completion observations, immutable photo evidence and governed follow-up actions against the existing completion revision. **DO_NOT_DUPLICATE:** no second outcomes timeline, attachment store, customer-effectiveness authority or browser-owned outcome state. |
| Fleet technical-register meter | Append-only `public.asset_meter_readings`, immutable trigger, unique source identity `(organisation_id, meter_definition_id, source_system, source_record_id)`; `ftf_write_asset_maintenance_command` | `server/fleet-maintenance-repository.js`; `/api/v1/asset-maintenance` through `server/fleet-maintenance-api.js` | `src/services/maintenanceApi.ts`; Fleet maintenance workspaces | **EXTEND.** Signed-off aircraft-day time projects through the existing `MISSION` source and stable source identity only. **DO_NOT_DUPLICATE:** no Mission-local technical-register hours or second Fleet meter ledger. |
| Financial Actual operational prefill | `public.ftf_read_financial_actual_operational_prefill`, `ftf_accept_financial_actual_operational_prefill`, source provenance and drift RPCs; it currently reads completed Mission operational revisions | `server/financial-actuals-repository.js`, `server/financial-actuals-api.js`; `/api/v1/financial-actuals` | strict `decodePrefill` in `src/services/financialActualsApi.ts`; Financial Actual workspace | **EXTEND.** Future final-sign-off migration may `create or replace` the existing checked prefill RPC to consume signed-off daily sources while preserving single-closeout reads. **DO_NOT_DUPLICATE:** Financial Actuals consume operational evidence and never own it. |
| Report artefacts | Existing report artefact/output-file authority, requested via `OperationalRepository.requestReportArtefact` | `server/operational-repository.js` and report route/worker | `ReportArtefactStatus`, Mission pack/report UI | **REUSE.** Final reports render frozen signed-off authority. **DO_NOT_DUPLICATE:** no parallel Mission-report store or recalculation from live mutable records. |
| Audit, outbox, tenancy and checked writes | `public.audit_events`, `public.transactional_outbox`, RLS and service-role RPC grants | Existing handler permission, same-origin and Base checks | API errors and bounded client diagnostics | **REUSE.** Every future command records bounded audit/outbox evidence and fails closed. **DO_NOT_DUPLICATE:** no direct browser writes to governed tables or generic service-role table access. |

## Additive objects reserved for later governed slices

These names describe future additive relations only. They do not exist in this Task, are not a Production migration request, and must be introduced only with checked RPCs, RLS/grant review, tests and a separate approval.

| Future capability | Additive authority | Reuses/extends | Compatibility rule |
| --- | --- | --- | --- |
| Checked cross-Property Job mutation | `ftf_write_job_scope` | `public.jobs`, `public.job_fields`, Client → Property → Field chain | Keep legacy `fieldIds` and first `propertyId` projection until separately removed. |
| Mission scope package and CRP gate | Mission-package revision/decision relations and `/api/v1/mission-operations` boundary | Mission, JSA, authorisation, map, chemical and readiness authorities | Do not replace `public.mission_authorisation_revisions`; associate the exact effective revisions. |
| Operating dates, Field activity and JSA continuity | `mission_operating_days`, `mission_day_field_activity`, `mission_day_jsa_reviews` | Mission, effective package/JSA, Base timezone and `public.job_fields` scope | One active aggregate per Mission/local `work_date`; one-day Missions remain valid. |
| Aircraft totals, optional flights and flight-line attribution | `mission_aircraft_day_actuals`, `mission_flight_actuals`, optional day/aircraft links to existing imports | Existing closeout import files and `public.asset_meter_readings` | Totals can exist without flights; geometry never invents regulatory flight time. |
| Daily chemical actuals and frozen weather | `mission_day_chemical_revisions`, `mission_day_chemical_lines`, `mission_day_weather_reports` | Mission planned chemicals, authorised Field scope and existing weather provider | Planned chemical data remains planning; historical weather reads return frozen evidence. |
| Material amendment holds | A focused prospective amendment-policy relation/command | JSA, package, authorisation and completed history | Unrecognised change fails closed as material; completed history is not rewritten. |
| Final sign-off and Job closure | `mission_final_signoffs`, checked `final-signoff` and `job-close` commands | Completed days, closeout, Fleet meters, Financial prefill, audit/outbox and reports | Current operational completion remains a compatibility state; final sign-off is a later immutable authority. |

## Legacy inventory queries — read-only only

Run these only against an approved isolated Production-shaped target using the governed read-only path. Record counts by organisation before any migration proposal; do not use them to update, default, infer or backfill records.

```sql
-- Jobs and legacy scope ambiguity.
select
  count(*) as jobs_total,
  count(*) filter (where archived_at is null) as jobs_active,
  count(*) filter (where property_id is null) as jobs_missing_property
from public.jobs;

select
  count(*) as job_field_rows,
  count(distinct job_id) as jobs_with_job_fields,
  count(*) filter (where archived_at is not null) as job_fields_archived
from public.job_fields;

select
  j.id as job_id,
  j.client_id,
  j.property_id as legacy_property_id,
  count(jf.id) filter (where jf.archived_at is null) as active_field_count,
  count(distinct jf.property_id) filter (where jf.archived_at is null) as active_property_count,
  count(*) filter (where jf.id is not null and f.id is null) as missing_field_parent,
  count(*) filter (where jf.id is not null and p.id is null) as missing_property_parent,
  count(*) filter (where p.client_id is distinct from j.client_id) as cross_client_field
from public.jobs j
left join public.job_fields jf on jf.organisation_id = j.organisation_id and jf.job_id = j.id
left join public.fields f on f.organisation_id = jf.organisation_id and f.id = jf.field_id
left join public.properties p on p.organisation_id = jf.organisation_id and p.id = jf.property_id
group by j.id, j.client_id, j.property_id
having count(jf.id) filter (where jf.archived_at is null) = 0
    or count(distinct jf.property_id) filter (where jf.archived_at is null) > 1
    or count(*) filter (where jf.id is not null and f.id is null) > 0
    or count(*) filter (where jf.id is not null and p.id is null) > 0
    or count(*) filter (where p.client_id is distinct from j.client_id) > 0;

-- Mission volume and current immutable revision streams.
select status, count(*) as missions from public.missions group by status order by status;

select 'jsa_history' as stream, count(*) as revisions, count(distinct mission_id) as missions
from public.mission_jsa_revisions
union all
select 'authorisation_history', count(*), count(distinct mission_id)
from public.mission_authorisation_revisions
union all
select 'operational_history', count(*), count(distinct mission_id)
from public.mission_operational_revisions
union all
select 'completion_history', count(*), count(distinct mission_id)
from public.mission_completion_revisions;

with current_revisions as (
  select 'jsa_current' as stream, organisation_id, mission_id
  from (
    select organisation_id, mission_id,
      row_number() over (partition by organisation_id, mission_id order by version_number desc) as rank
    from public.mission_jsa_revisions
  ) x where rank = 1
  union all
  select 'authorisation_current', organisation_id, mission_id
  from (
    select organisation_id, mission_id,
      row_number() over (partition by organisation_id, mission_id order by version_number desc) as rank
    from public.mission_authorisation_revisions
  ) x where rank = 1
  union all
  select 'operational_current', organisation_id, mission_id
  from (
    select organisation_id, mission_id,
      row_number() over (partition by organisation_id, mission_id order by version_number desc) as rank
    from public.mission_operational_revisions
  ) x where rank = 1
  union all
  select 'completion_current', organisation_id, mission_id
  from (
    select organisation_id, mission_id,
      row_number() over (partition by organisation_id, mission_id order by version_number desc) as rank
    from public.mission_completion_revisions
  ) x where rank = 1
)
select stream, count(*) as current_revisions, count(distinct organisation_id) as organisations
from current_revisions
group by stream
order by stream;

with current_revision_counts as (
  select m.id as mission_id,
    (select count(*) from public.mission_jsa_revisions j where j.organisation_id=m.organisation_id and j.mission_id=m.id) as jsa_revisions,
    (select count(*) from public.mission_authorisation_revisions a where a.organisation_id=m.organisation_id and a.mission_id=m.id) as authorisation_revisions,
    (select count(*) from public.mission_operational_revisions o where o.organisation_id=m.organisation_id and o.mission_id=m.id) as operational_revisions,
    (select count(*) from public.mission_completion_revisions c where c.organisation_id=m.organisation_id and c.mission_id=m.id) as completion_revisions
  from public.missions m
)
select
  count(*) filter (where completion_revisions > 0) as completed_missions,
  count(*) filter (where completion_revisions > 0 and authorisation_revisions = 0) as completed_without_authorisation,
  count(*) filter (where completion_revisions > 0 and operational_revisions = 0) as completed_without_operational_revision,
  count(*) filter (where completion_revisions > 0 and jsa_revisions = 0) as completed_without_jsa,
  count(*) filter (where completion_revisions > 1) as completion_revision_history
from current_revision_counts;

-- Completed evidence preserved as-is, including current file/actual evidence coverage.
select
  count(*) as completion_revisions,
  count(*) filter (where flight_lines_override) as flight_line_overrides,
  count(*) filter (where completion_snapshot is null) as missing_completion_snapshot
from public.mission_completion_revisions;

select evidence_type, parse_status, count(*) as imports
from public.mission_operational_imports
group by evidence_type, parse_status
order by evidence_type, parse_status;

-- Post-completion Mission Outcomes are completed evidence too: preserve their
-- observation/photo history, follow-up lineage and pending-upload ambiguity.
select 'observation_types' as outcome_record, count(*) as records
from public.mission_outcome_observation_types
union all select 'methods', count(*) from public.mission_outcome_methods
union all select 'confidence_levels', count(*) from public.mission_outcome_confidence_levels
union all select 'observations', count(*) from public.mission_outcome_observations
union all select 'pending_files', count(*) from public.mission_outcome_pending_files
union all select 'observation_files', count(*) from public.mission_outcome_observation_files
union all select 'follow_up_actions', count(*) from public.mission_outcome_follow_up_actions;

select
  p.mission_id,
  count(*) filter (where p.claimed_at is null and p.expires_at <= now()) as expired_unclaimed_photo_staging,
  count(*) filter (where p.claimed_at is null and p.expires_at > now()) as active_unclaimed_photo_staging
from public.mission_outcome_pending_files p
group by p.mission_id
having count(*) filter (where p.claimed_at is null) > 0;

select
  o.mission_id,
  count(distinct o.id) as observations,
  count(distinct o.id) filter (where o.supersedes_observation_id is not null) as correction_lineage,
  count(distinct f.id) as attached_photos,
  count(distinct a.id) filter (where a.status not in ('COMPLETED', 'CANCELLED')) as open_follow_ups
from public.mission_outcome_observations o
left join public.mission_outcome_observation_files f
  on f.organisation_id = o.organisation_id and f.observation_id = o.id
left join public.mission_outcome_follow_up_actions a
  on a.organisation_id = o.organisation_id and a.source_observation_id = o.id
group by o.mission_id;
```

### Ambiguity treatment

An ambiguous legacy Job/Mission is an inventory finding, not an invitation to guess. Examples include zero active `job_fields`, multiple Properties before the checked scope command exists, broken parent links, cross-Client scope, completed evidence missing an older stream, absent operating timestamps, unparsed flight files, a completion made with a flight-line override, and expired/unclaimed Mission Outcome photo staging. Preserve its original rows and flag it for review.

**No fabricated historical operating days.** Existing completed Missions must not acquire inferred operating dates, daily Field activity, flight hours, CRP decisions, weather windows, chemical actuals or JSA day confirmations. A date range, planned scope, KML geometry or Financial Actual must never be used to invent that evidence.

## Compatibility and prohibition checklist

- Existing `fieldIds` arrays, Mission statuses, JSA records, chemical plans, maps and completion evidence remain readable as valid historical/simple workflows.
- Existing completed evidence is append-only/immutable; corrections use governed revision or correction lineage, never an update to history.
- Existing Mission Outcome observations and observation files remain immutable completed evidence; follow-up actions retain their current governed row-version lifecycle and are not an alternative operational authority.
- `public.job_fields`, `public.mission_jsa_revisions`, `public.mission_authorisation_revisions`, `public.mission_operational_revisions`, `public.asset_meter_readings` and `public.ftf_read_financial_actual_operational_prefill` are the named adoption points for this design.
- A future migration must state why an adopted authority cannot satisfy the new relation, include record counts and ambiguity classes, preserve completed evidence, specify RLS/grants/checked commands and fix-forward boundary, and obtain separate Production approval.

## Source-owner verification

On 4 September 2026, the unchanged-code ownership claims in this matrix were checked against their referenced files. The verified paths/symbols are: Job `mapApiJob`; JSA `readMissionJsa`, `createMissionJsaHandler`, `createMissionJsaApi`, `AuthoritativeMissionJsa`; authorisation `readMissionAuthorisation`, `createMissionAuthorisationHandler`, `createMissionAuthorisationApi`, `MissionAuthorisation`; closeout `readMissionOperationalCloseout`, `createMissionOperationalCloseoutHandler`, `createMissionOperationalCloseoutApi`, `MissionOperationalCloseout`; Fleet `FleetMaintenanceRepository` and `MaintenanceApiError`; Financial `readPrefill` and `decodePrefill`; reports `requestReportArtefact` and `ReportArtefactStatus`; and Outcomes `readMissionOutcomes`, `createMissionOutcomesHandler`, `createMissionOutcomesApi`, `MissionOutcomes`. This is an inventory verification only; no unchanged implementation file was modified.
