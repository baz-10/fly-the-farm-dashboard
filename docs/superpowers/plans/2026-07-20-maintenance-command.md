# Maintenance Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared, field-efficient maintenance system spanning CASA-aligned RPAS technical logs, internal vehicle/support-fleet servicing, PIC defect and field-repair entry, firmware records, Maintenance Controller release and mission serviceability blocking.

**Architecture:** Add a tenant-scoped `MaintenanceProvider` backed by the existing shared persistence API. Keep immutable assets, schedules, records and audit events in one maintenance store; Aircraft, Fleet and Maintenance Command render filtered views of that store. Pure utilities calculate due state, permissions, serviceability and export data so regulatory and mission behaviour is testable outside React.

**Tech Stack:** React 19, TypeScript, Material UI, React Router, Jest/Testing Library, existing `readSharedValue`/`writeSharedValue` persistence.

## Global Constraints

- RPAS records are labelled CASA-aligned and must not claim that software use guarantees compliance.
- RPAS technical-log records are non-destructive and retained for at least seven years after last operation.
- PICs may make an asset unserviceable but may not release an RPAS unless separately authorised.
- Contractors never see financial maintenance fields, profitability or unrelated tenant data.
- Platform administrators cannot view subscriber operational, maintenance or financial records.
- Support-fleet maintenance blocks a mission only when the asset is assigned, mission-critical and unserviceable or overdue on a mandatory task.
- Common field entries must use short adaptive forms and preserve explicit save failures.
- Voice transcription, QR generation, inventory purchasing, supplier portals and direct CASA submission are outside this delivery.

---

## File Structure

### New domain files

- `src/types/maintenance.ts` — assets, readings, schedules, records, workflow, firmware, audit and authority types.
- `src/utils/maintenanceSchedule.ts` — due-state calculation across date, hours, cycles and kilometres.
- `src/utils/maintenanceServiceability.ts` — asset blockers, record transitions and mission readiness.
- `src/utils/maintenancePermissions.ts` — role/authority and financial-visibility rules.
- `src/utils/maintenanceExport.ts` — chronological CASA-aligned RPAS technical-log export model and CSV download.
- `src/contexts/MaintenanceContext.tsx` — tenant-scoped state, persistence and non-destructive commands.

### New UI files

- `src/pages/MaintenanceCommand.tsx` — central overview, action queues, filters and record history.
- `src/components/maintenance/MaintenanceRecordDialog.tsx` — adaptive field entry for defect, inspection, work, part, reading and firmware.
- `src/components/maintenance/MaintenanceAssetPanel.tsx` — asset summary, status, actions, schedule and history reused by Aircraft and Fleet.
- `src/components/maintenance/MaintenanceStatusChip.tsx` — consistent readiness and workflow status.

### Existing integration files

- `src/services/persistence.ts` — add maintenance persistence key.
- `src/App.tsx` — mount provider and `/maintenance` route.
- `src/components/Layout.tsx` — Maintenance navigation item.
- `src/pages/AircraftManagement.tsx` — RPAS Maintenance tab/panel.
- `src/pages/FleetWorkPacks.tsx` — Vehicle & Equipment Maintenance tab/panel.
- `src/types/workPack.ts` and `src/components/TruckProfileForm.tsx` — generator/support-equipment asset classes and meter fields.
- `src/pages/MissionPlanning.tsx` and `src/contexts/MissionContext.tsx` — consume maintenance blockers.

---

### Task 1: Maintenance Domain and Schedule Calculations

**Files:**
- Create: `src/types/maintenance.ts`
- Create: `src/utils/maintenanceSchedule.ts`
- Test: `src/utils/__tests__/maintenanceSchedule.test.ts`

**Interfaces:**
- Produces: `MaintenanceAsset`, `MaintenanceSchedule`, `MaintenanceRecord`, `MaintenanceStore`, `calculateScheduleStatus(schedule, readings, now)`.

- [ ] **Step 1: Write failing schedule tests**

```ts
expect(calculateScheduleStatus(dateSchedule, readings, new Date('2026-08-01'))).toMatchObject({ state: 'overdue' });
expect(calculateScheduleStatus(hourSchedule, { flightHours: 98 }, now)).toMatchObject({ state: 'due-soon', remaining: 2 });
expect(calculateScheduleStatus(kmSchedule, { odometerKm: 90000 }, now)).toMatchObject({ state: 'due' });
```

- [ ] **Step 2: Run the test and require the missing-module failure**

Run: `npm test -- --runInBand src/utils/__tests__/maintenanceSchedule.test.ts`

- [ ] **Step 3: Define domain types and implement the pure calculator**

```ts
export type MaintenanceAssetClass = 'aircraft' | 'battery' | 'controller' | 'spray-kit' | 'truck' | 'trailer' | 'generator' | 'pump' | 'loader' | 'support-equipment';
export type ScheduleMeter = 'calendar' | 'flight-hours' | 'component-hours' | 'cycles' | 'kilometres' | 'operating-hours';
export interface ScheduleStatus { state: 'current' | 'due-soon' | 'due' | 'overdue'; remaining?: number; dueLabel: string; }
export function calculateScheduleStatus(schedule: MaintenanceSchedule, readings: MaintenanceReadings, now = new Date()): ScheduleStatus {
  const current = schedule.meter === 'calendar' ? now.getTime() : Number(readings[schedule.meter] || 0);
  const due = schedule.meter === 'calendar' ? new Date(schedule.dueAt).getTime() : Number(schedule.dueAt);
  const warning = schedule.meter === 'calendar' ? schedule.dueSoonBy * 86400000 : schedule.dueSoonBy;
  const remaining = due - current;
  const state = remaining < 0 ? 'overdue' : remaining === 0 ? 'due' : remaining <= warning ? 'due-soon' : 'current';
  return { state, remaining, dueLabel: String(schedule.dueAt) };
}
```

- [ ] **Step 4: Run the focused test and require PASS**

Run: `npm test -- --runInBand src/utils/__tests__/maintenanceSchedule.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/types/maintenance.ts src/utils/maintenanceSchedule.ts src/utils/__tests__/maintenanceSchedule.test.ts
git commit -m "feat: add maintenance domain and schedules"
```

### Task 2: Serviceability, Workflow and Permissions

**Files:**
- Create: `src/utils/maintenanceServiceability.ts`
- Create: `src/utils/maintenancePermissions.ts`
- Test: `src/utils/__tests__/maintenanceServiceability.test.ts`
- Test: `src/utils/__tests__/maintenancePermissions.test.ts`

**Interfaces:**
- Consumes: maintenance domain types and `ScheduleStatus`.
- Produces: `getAssetServiceability`, `canTransitionMaintenanceRecord`, `getMissionMaintenanceBlockers`, `canReleaseRpas`, `canViewMaintenanceFinancials`.

- [ ] **Step 1: Write failing safety and privacy tests**

```ts
expect(getAssetServiceability(asset, [openDefect], [])).toMatchObject({ state: 'unserviceable', blockers: expect.arrayContaining([expect.stringContaining('defect')]) });
expect(canReleaseRpas({ role: 'contractor', maintenanceAuthority: 'pic' })).toBe(false);
expect(canReleaseRpas({ role: 'admin', maintenanceAuthority: 'maintenance-controller' })).toBe(true);
expect(canViewMaintenanceFinancials({ role: 'contractor' })).toBe(false);
expect(getMissionMaintenanceBlockers({ aircraftIds: ['a1'], supportAssets: [{ id: 'truck-1', missionCritical: false }] }, state)).not.toContainEqual(expect.objectContaining({ assetId: 'truck-1' }));
```

- [ ] **Step 2: Run both files and require FAIL**

Run: `npm test -- --runInBand src/utils/__tests__/maintenanceServiceability.test.ts src/utils/__tests__/maintenancePermissions.test.ts`

- [ ] **Step 3: Implement explicit transition and blocker rules**

```ts
const RELEASE_AUTHORITIES = new Set(['maintenance-controller', 'authorised-maintainer']);
export function canReleaseRpas(actor: MaintenanceActor): boolean { return RELEASE_AUTHORITIES.has(actor.maintenanceAuthority || ''); }
export function canTransitionMaintenanceRecord(record: MaintenanceRecord, next: MaintenanceWorkflowStatus, actor: MaintenanceActor): boolean {
  if (next === 'serviceable' || next === 'deferred') return canReleaseRpas(actor);
  return actor.role === 'admin' || actor.role === 'contractor';
}
```

- [ ] **Step 4: Run both files and require PASS**

- [ ] **Step 5: Commit**

```bash
git add src/utils/maintenanceServiceability.ts src/utils/maintenancePermissions.ts src/utils/__tests__/maintenanceServiceability.test.ts src/utils/__tests__/maintenancePermissions.test.ts
git commit -m "feat: enforce maintenance serviceability rules"
```

### Task 3: Tenant-Scoped Immutable Maintenance Store

**Files:**
- Modify: `src/services/persistence.ts`
- Create: `src/contexts/MaintenanceContext.tsx`
- Test: `src/contexts/__tests__/MaintenanceContext.test.tsx`

**Interfaces:**
- Produces hook `useMaintenance()` with `assets`, `schedules`, `records`, `auditEvents`, `upsertAsset`, `addSchedule`, `submitRecord`, `transitionRecord`, `amendRecord`, `refresh`.

- [ ] **Step 1: Write failing context tests**

```tsx
await act(() => result.current.submitRecord(defectInput));
expect(result.current.records[0]).toMatchObject({ status: 'reported', createdBy: 'pilot-1' });
expect(result.current.auditEvents[0]).toMatchObject({ action: 'record-created' });
expect(() => result.current.deleteRecord).toThrow;
```

Also test that contractor-visible state excludes `cost` fields while the persisted privileged store retains them.

- [ ] **Step 2: Run and require FAIL**

Run: `npm test -- --runInBand src/contexts/__tests__/MaintenanceContext.test.tsx`

- [ ] **Step 3: Add `maintenance: 'ftf_maintenance'` to `PERSISTENCE_KEYS` and implement provider commands**

```ts
interface MaintenanceContextValue extends MaintenanceStore {
  submitRecord(input: MaintenanceRecordInput): Promise<string>;
  transitionRecord(id: string, status: MaintenanceWorkflowStatus, certification?: MaintenanceCertification): Promise<void>;
  amendRecord(id: string, reason: string, changes: MaintenanceRecordAmendment): Promise<string>;
}
```

Use `readSharedValue`/`writeSharedValue`, authenticated tenant/user values, `crypto.randomUUID`, a 50 ms queued save and explicit `loadError`/`saveError`. Do not expose a delete operation.

- [ ] **Step 4: Run context and persistence tests and require PASS**

Run: `npm test -- --runInBand src/contexts/__tests__/MaintenanceContext.test.tsx src/services/__tests__/persistence.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/services/persistence.ts src/contexts/MaintenanceContext.tsx src/contexts/__tests__/MaintenanceContext.test.tsx
git commit -m "feat: persist immutable maintenance records"
```

### Task 4: Adaptive Field Record Dialog

**Files:**
- Create: `src/components/maintenance/MaintenanceRecordDialog.tsx`
- Create: `src/components/maintenance/MaintenanceStatusChip.tsx`
- Test: `src/components/maintenance/__tests__/MaintenanceRecordDialog.test.tsx`

**Interfaces:**
- Consumes: `MaintenanceAsset`, `MaintenanceRecordInput`, `useMaintenance`.
- Produces: reusable quick-entry dialog for all asset pages.

- [ ] **Step 1: Write failing interaction tests**

```tsx
await user.click(screen.getByRole('button', { name: 'Report defect' }));
await user.type(screen.getByLabelText('What happened?'), 'Motor vibration after landing');
await user.click(screen.getByLabelText('This affects safe operation'));
await user.click(screen.getByRole('button', { name: 'Submit defect' }));
expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ type: 'defect', resultingServiceability: 'unserviceable' }));
```

Test inspection, field repair, reading, part-change and firmware-specific fields.

- [ ] **Step 2: Run and require FAIL**

- [ ] **Step 3: Implement the short adaptive form**

Use a two-stage dialog: activity selection then relevant fields. Always show asset, captured timestamp and resulting status. Hide costs unless `canViewMaintenanceFinancials` is true. Preserve entered state when save fails and show the provider error.

- [ ] **Step 4: Run focused UI test and require PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/maintenance
git commit -m "feat: add field maintenance entry"
```

### Task 5: Reusable Asset Maintenance Panel

**Files:**
- Create: `src/components/maintenance/MaintenanceAssetPanel.tsx`
- Test: `src/components/maintenance/__tests__/MaintenanceAssetPanel.test.tsx`

**Interfaces:**
- Consumes: `assetId`, optional `scope: 'rpas' | 'fleet'`.
- Produces: summary, due work, technical/internal label, actions and chronological history.

- [ ] **Step 1: Write failing rendering tests**

Verify RPAS panels show `CASA-aligned RPAS technical log`, fleet panels show `Internal fleet-maintenance record`, a contractor cannot see costs and an unserviceable asset displays the blocking record.

- [ ] **Step 2: Run and require FAIL**

- [ ] **Step 3: Implement panel using provider selectors and the adaptive dialog**

The panel must display current readings, serviceability, mandatory due work, open defects, firmware, recent history and quick actions. Use `MaintenanceStatusChip` consistently.

- [ ] **Step 4: Run and require PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/maintenance/MaintenanceAssetPanel.tsx src/components/maintenance/__tests__/MaintenanceAssetPanel.test.tsx
git commit -m "feat: add reusable asset maintenance view"
```

### Task 6: Aircraft and Fleet Entry Points

**Files:**
- Modify: `src/pages/AircraftManagement.tsx`
- Modify: `src/pages/FleetWorkPacks.tsx`
- Modify: `src/types/workPack.ts`
- Modify: `src/components/TruckProfileForm.tsx`
- Test: `src/pages/AircraftManagement.maintenance.test.tsx`
- Test: `src/pages/FleetWorkPacks.maintenance.test.tsx`

**Interfaces:**
- Consumes: `MaintenanceAssetPanel` and `useMaintenance`.
- Produces: Aircraft `RPAS Maintenance` and Fleet `Vehicle & Equipment Maintenance` tabs.

- [ ] **Step 1: Write failing page tests**

Assert that selecting RPAS Maintenance exposes each aircraft and its quick actions. Assert Fleet supports `truck`, `trailer`, `generator`, `pump`, `loader`, `support-equipment`, meter readings and the internal-maintenance label.

- [ ] **Step 2: Run and require FAIL**

- [ ] **Step 3: Extend deployment asset types and forms**

```ts
export type DeploymentAssetType = 'truck' | 'trailer' | 'generator' | 'pump' | 'loader' | 'support-equipment';
export interface DeploymentAssetMeter { odometerKm?: number; engineHours?: number; operatingHours?: number; }
```

Sync aircraft, kits and deployment assets into maintenance assets by stable source IDs without overwriting maintenance history.

- [ ] **Step 4: Add the two maintenance tabs and panels**

- [ ] **Step 5: Run both tests and require PASS**

- [ ] **Step 6: Commit**

```bash
git add src/pages/AircraftManagement.tsx src/pages/FleetWorkPacks.tsx src/types/workPack.ts src/components/TruckProfileForm.tsx src/pages/*maintenance.test.tsx
git commit -m "feat: add aircraft and fleet maintenance tabs"
```

### Task 7: Maintenance Command Dashboard

**Files:**
- Create: `src/pages/MaintenanceCommand.tsx`
- Test: `src/pages/MaintenanceCommand.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

**Interfaces:**
- Consumes: maintenance selectors, schedules, permissions and quick-entry dialog.
- Produces: `/maintenance` route and left navigation item.

- [ ] **Step 1: Write failing dashboard test**

Assert summary counts for unserviceable, due soon, awaiting release and ready assets; filters for RPAS/Fleet; action queue ordering; quick-entry button; and no financial data for contractors.

- [ ] **Step 2: Run and require FAIL**

- [ ] **Step 3: Implement route, provider placement and nav**

Mount `MaintenanceProvider` inside `AircraftProvider` and `WorkPackProvider` so it can synchronise source assets. Add `/maintenance` protected for admin/contractor and a Build icon nav item labelled Maintenance.

- [ ] **Step 4: Implement responsive dashboard**

Use four summary cards, action queue, upcoming schedule, firmware section and recent activity. Use RPAS Compliance, Vehicle & Support Fleet and All filters.

- [ ] **Step 5: Run dashboard and App tests and require PASS**

- [ ] **Step 6: Commit**

```bash
git add src/pages/MaintenanceCommand.tsx src/pages/MaintenanceCommand.test.tsx src/App.tsx src/components/Layout.tsx
git commit -m "feat: add maintenance command dashboard"
```

### Task 8: Firmware Campaigns and RPAS Technical-Log Export

**Files:**
- Create: `src/utils/maintenanceExport.ts`
- Test: `src/utils/__tests__/maintenanceExport.test.ts`
- Modify: `src/pages/MaintenanceCommand.tsx`
- Modify: `src/contexts/MaintenanceContext.tsx`

**Interfaces:**
- Produces: `createFirmwareCampaign`, `completeFirmwareForAsset`, `buildRpasTechnicalLog`, `downloadRpasTechnicalLogCsv`.

- [ ] **Step 1: Write failing campaign/export tests**

```ts
expect(createCampaign(['a1', 'a2'], version)).toHaveLength(2);
expect(buildRpasTechnicalLog('a1', store)).toMatchObject({ identity: expect.any(Object), records: expect.arrayContaining([expect.objectContaining({ type: 'firmware' })]) });
expect(exported.records.every((record) => record.assetId === 'a1')).toBe(true);
```

- [ ] **Step 2: Run and require FAIL**

- [ ] **Step 3: Implement per-asset firmware records and chronological export**

Include prior/new version, source, installer, checks, issues, limitations, certification and audit/amendment references. Exclude financial fields.

- [ ] **Step 4: Add campaign and export actions to Maintenance Command**

- [ ] **Step 5: Run and require PASS**

- [ ] **Step 6: Commit**

```bash
git add src/utils/maintenanceExport.ts src/utils/__tests__/maintenanceExport.test.ts src/pages/MaintenanceCommand.tsx src/contexts/MaintenanceContext.tsx
git commit -m "feat: add firmware campaigns and technical log export"
```

### Task 9: Mission Authorisation Integration

**Files:**
- Modify: `src/contexts/MissionContext.tsx`
- Modify: `src/pages/MissionPlanning.tsx`
- Test: `src/contexts/__tests__/MissionContext.maintenance.test.ts`
- Test: `src/utils/__tests__/maintenanceServiceability.test.ts`

**Interfaces:**
- Consumes: `getMissionMaintenanceBlockers`.
- Produces exact aircraft, kit and critical-support blockers in mission readiness.

- [ ] **Step 1: Write failing mission tests**

Verify unresolved aircraft defect, mandatory overdue task and awaiting release block authorisation. Verify unassigned or non-critical truck maintenance does not block. Verify assigned mission-critical unserviceable generator blocks.

- [ ] **Step 2: Run and require FAIL**

- [ ] **Step 3: Add maintenance readiness to existing aircraft/work-pack checks**

Do not replace existing aircraft status/date checks. Merge new blockers and surface the linked record title and `/maintenance` resolution link.

- [ ] **Step 4: Run regression tests including T100 workflow and require PASS**

Run: `npm test -- --runInBand src/contexts/__tests__/MissionContext.maintenance.test.ts src/contexts/__tests__/MissionContext.kitSelection.test.ts src/utils/__tests__/t100MissionRegression.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/contexts/MissionContext.tsx src/pages/MissionPlanning.tsx src/contexts/__tests__/MissionContext.maintenance.test.ts src/utils/__tests__/maintenanceServiceability.test.ts
git commit -m "feat: block unsafe assets from missions"
```

### Task 10: Full Verification and Field Usability Check

**Files:**
- Modify only files exposed by verification.

- [ ] **Step 1: Run all tests**

Run: `CI=true npm test -- --runInBand --watchAll=false`
Expected: every suite passes.

- [ ] **Step 2: Build production bundle**

Run: `npm run build`
Expected: exit 0; existing unrelated lint warnings may remain.

- [ ] **Step 3: Check whitespace and scope**

Run: `git diff --check && git status --short`
Expected: clean diff check and no unrelated files.

- [ ] **Step 4: Browser-test desktop and mobile workflows**

Verify Maintenance Command filters, aircraft/fleet entry points, one-minute defect entry, field repair, firmware campaign, MC release, technical-log export, serviceability mission block and contractor financial privacy.

- [ ] **Step 5: Request independent code review**

Require no unresolved Critical or Important findings before publishing.

- [ ] **Step 6: If verification required corrections, rerun Steps 1–3 after committing only the files shown by `git status --short` that belong to this feature**
