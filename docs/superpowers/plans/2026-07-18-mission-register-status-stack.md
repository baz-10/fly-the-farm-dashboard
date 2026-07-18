# Mission Register Status Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mixed mission register list with four fixed, stacked operational status sections.

**Architecture:** Keep `MissionRegister` as the route-level component and add a pure mission-grouping utility so status mapping and search behaviour are independently testable. Render a reusable section component for consistent counts, empty states, card metadata and collapse behaviour.

**Tech Stack:** React 19, TypeScript 4.9, Material UI 7, Jest, React Testing Library.

## Global Constraints

- Section order is In Progress, Authorised, Planning, Completed.
- Flying must not be grouped with Approved.
- Completed includes Completed and Locked and starts collapsed when non-empty.
- Search filters all sections without changing status placement.
- Existing mission routes and tenant behaviour remain unchanged.

---

### Task 1: Mission grouping model

**Files:**
- Create: `src/utils/missionRegister.ts`
- Create: `src/utils/__tests__/missionRegister.test.ts`

**Interfaces:**
- `MISSION_REGISTER_SECTIONS` defines fixed keys, labels, colours and accepted statuses.
- `groupMissionsForRegister(missions, query)` returns all four section groups in fixed order.
- `getMissionNextAction(mission)` returns the approved state-specific action wording.

- [ ] Write failing table-driven tests for Flying, Approved, Planning, Completed and Locked mapping, fixed order, search preservation and next-action copy.
- [ ] Run `CI=true npm test -- --watchAll=false src/utils/__tests__/missionRegister.test.ts` and confirm failure because the module is absent.
- [ ] Implement the minimal pure grouping and action helpers.
- [ ] Re-run the focused test and require all assertions to pass.
- [ ] Commit with `feat: model mission register status groups`.

### Task 2: Stacked mission register UI

**Files:**
- Modify: `src/pages/MissionRegister.tsx`
- Modify: `src/pages/MissionRegister.test.tsx`

**Interfaces:**
- `MissionRegister` consumes `groupMissionsForRegister()` and renders four sections.
- Completed expansion state is local UI state and defaults to collapsed when the group is non-empty.

- [ ] Update component tests to assert section order and counts, distinct Flying/Approved sections, removal of the status dropdown, Completed collapse/expand and direct mission navigation.
- [ ] Run `CI=true npm test -- --watchAll=false src/pages/MissionRegister.test.tsx` and confirm the existing mixed list fails the new expectations.
- [ ] Implement reusable status section headers and accented cards with date, location, aircraft and next action.
- [ ] Re-run the focused tests, then run `CI=true npm test -- --watchAll=false` and `npm run build`.
- [ ] Browser-check `/missions` for hierarchy, collapse behaviour and console errors.
- [ ] Commit with `feat: stack missions by operational status`.
