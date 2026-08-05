# Properties Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a dedicated, production-ready Properties workspace at `/jobs?view=properties` that makes Search, Open, and Add immediately usable while reusing authoritative Client and Property data.

**Architecture:** Extend the existing `ClientList` route component with a route-selected Properties presentation and a bounded Add Property workflow. Reuse `OperationalDataContext`, `AddressAutocomplete`, and the approved map interaction rather than introducing a new route, table, API, or persistence mechanism.

**Tech Stack:** React, TypeScript, Material UI, React Router, Jest, Testing Library, Leaflet, existing versioned `/api/v1` operational resources.

## Global Constraints

- Preserve `/jobs?view=properties`, existing Property APIs, records, relationships, permissions, tenant boundaries, operating-location scope, audit, outbox, and history.
- Do not add a Property table, Property API, standalone route, or browser-authoritative persistence.
- Apply SC-011 Fill Once, Remember Forever; SC-012 Premium Simplicity; SC-013 Inform Early, Enforce Late.
- Reuse the approved map interaction standard and preserve zoom, viewport, and layer during pin movement.
- Stop after deployed Properties refinement for Product Owner review.

---

### Task 1: Properties workspace hierarchy and search

**Files:**
- Modify: `src/pages/ClientList.tsx`
- Test: `src/pages/OperationalWorkflow.test.tsx`

**Interfaces:**
- Consumes: `operational.clients`, `operational.properties`, `operational.fields`, and `useSearchParams()`.
- Produces: route-selected Properties heading, search, directly openable results, and `More property actions`.

- [ ] **Step 1: Write failing route and search tests**

Add assertions that `?view=properties` shows `Properties`, `Search properties`, `Add Property`, and `More property actions`; hides Client-primary actions; filters by Property name, Client name, address, locality, state, postcode, and lot/plan; and opens `/jobs/client/:clientId/property/:propertyId`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --runInBand src/pages/OperationalWorkflow.test.tsx`

Expected: FAIL because the route still renders the Clients workspace.

- [ ] **Step 3: Implement the minimal Properties workspace**

Derive `view` from search parameters, build a property-to-client result projection from current authoritative context data, add case-insensitive multi-field filtering, and render compact results with Property, Client, location, field count, operational area, and one Open Property action.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --runInBand src/pages/OperationalWorkflow.test.tsx`

- [ ] **Step 5: Commit**

Commit only the focused workspace and tests with `IMP-PROP-001` in the message.

### Task 2: Client context and inherited Property location

**Files:**
- Modify: `src/pages/ClientList.tsx`
- Modify only if required: `src/components/AddressAutocomplete.tsx`
- Test: `src/pages/OperationalWorkflow.test.tsx`
- Test only if shared behaviour changes: `src/components/AddressAutocomplete.test.tsx`

**Interfaces:**
- Consumes: `ClientAddress`, `operational.createProperty(input)`, and the existing confirmed-location metadata.
- Produces: Client-first Property draft, inherited location selection, isolated Property adjustment, and explicit confirmation.

- [ ] **Step 1: Write failing creation-flow tests**

Assert that Add Property first selects a Client; confirmed locations are shown with labels and provenance; selecting one prefills address/coordinates; moving the pin affects only the draft; invalid save focuses the location section and preserves form state; and a valid save calls `createProperty` with the chosen Client and confirmed Property location.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --runInBand src/pages/OperationalWorkflow.test.tsx src/components/AddressAutocomplete.test.tsx`

Expected: FAIL because the top-level Properties creation workflow does not exist.

- [ ] **Step 3: Implement the minimal creation flow**

Add controlled Client selection, confirmed Client-location choices, copied Property draft state, plain-language provenance, address search/map adjustment, explicit confirmation, inline validation, focus management, and non-destructive failure handling. Never update the Client during Property creation.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- --runInBand src/pages/OperationalWorkflow.test.tsx src/components/AddressAutocomplete.test.tsx src/components/AddressLocationMap.test.tsx`

- [ ] **Step 5: Commit**

Commit the bounded workflow and tests with `IMP-PROP-001` in the message.

### Task 3: Regression, responsive, and production acceptance

**Files:**
- Modify tests only when an acceptance gap is discovered.

**Interfaces:**
- Consumes: committed Properties workspace.
- Produces: verified build, deployment, and live Product Owner review screen.

- [ ] **Step 1: Run focused UI regression**

Run: `npm test -- --runInBand src/pages/OperationalWorkflow.test.tsx src/components/AddressAutocomplete.test.tsx src/components/AddressLocationMap.test.tsx`

- [ ] **Step 2: Run the complete regression suite**

Run: `npm test -- --runInBand`

- [ ] **Step 3: Run production build and repository checks**

Run: `npm run build`, secret/environment scans, `git diff --check`, and confirm only approved files changed.

- [ ] **Step 4: Commit, push, and deploy without rewriting history**

Push `codex/production-beta` to `BJT-FTF/Spray-Command`, apply `20260806100000_property_lot_plan.sql` to the verified Production Beta Supabase project, and deploy to the existing Spray Command Production Beta Vercel project.

- [ ] **Step 5: Complete live acceptance**

Verify route, hierarchy, search, direct opening, Client-first Add Property, inherited confirmed locations, non-destructive validation, map layers, pin/viewport behaviour, and responsive layouts. Do not create synthetic records. Open the deployed Properties page for Product Owner review.
