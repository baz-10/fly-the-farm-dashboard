# Guided Mission Address Autofill Implementation Plan

> **Execution:** Implement sequentially in the continuous `codex/production-beta` worktree using strict RED-GREEN-REFACTOR. Do not start the later repeat-work or map-feature packages until this address package is deployed and accepted.

**Goal:** Let an operator find an Australian work address from the guided Mission workflow, retain authoritative coordinates and provenance when a suggestion is selected, and still enter a truthful manual address when geocoding cannot find the site.

**Architecture:** The browser calls Spray Command's same-origin `/api/geocode` boundary; only that server adapter calls the external geocoder. The reusable address control emits either a selected structured result or a manual edit. A Property persists the address, coordinates, and `GEOCODED`/`MANUAL` source through the trusted operational API and repository-controlled PostgreSQL migration. Guided Mission drafts retain the same fields, so Save and exit / Continue setup restores the exact state.

**Requirement:** `IMP-MIS-001`

---

## Task 1: Make the geocoder a provider-neutral Australian address adapter

**Files:**

- Modify: `api/geocode.js`
- Test: `src/__tests__/geocode-api.test.ts`

- [ ] **1.1 Write the failing API contract tests**

Add fixtures that include Nominatim `address` data and assert that each result returns only:

```ts
{
  label: '1 Queen Street, Brisbane City QLD 4000',
  address: '1 Queen Street',
  locality: 'Brisbane City',
  state: 'QLD',
  postcode: '4000',
  lat: -27.4698,
  lng: 153.0251,
  type: 'commercial',
}
```

Also cover:

- long-form Australian state names map to `NSW`, `VIC`, `QLD`, `SA`, `WA`, `TAS`, `NT`, or `ACT`;
- results outside Australian coordinate bounds are discarded even if returned by the provider;
- malformed coordinates are discarded;
- provider failure produces a visible non-200 error envelope;
- short and non-GET requests remain rejected.

- [ ] **1.2 Run the focused test and confirm RED**

Run: `npm test -- --runInBand src/__tests__/geocode-api.test.ts`

Expected: FAIL because `/api/geocode` currently returns only `label`, `lat`, `lng`, and `type`.

- [ ] **1.3 Implement the minimal adapter mapping**

Update the provider request to request address details, map provider-specific response fields behind local helpers, validate Australian bounds, and return the structured provider-neutral contract. Keep the endpoint GET-only, query-limited, cached, and free of credentials.

- [ ] **1.4 Re-run the focused test and confirm GREEN**

Run: `npm test -- --runInBand src/__tests__/geocode-api.test.ts`

Expected: PASS.

- [ ] **1.5 Commit the adapter**

```bash
git add api/geocode.js src/__tests__/geocode-api.test.ts
git commit -m "IMP-MIS-001 provide structured Australian address search"
```

## Task 2: Convert the reusable autocomplete to the trusted same-origin API

**Files:**

- Modify: `src/components/AddressAutocomplete.tsx`
- Create: `src/components/AddressAutocomplete.test.tsx`

- [ ] **2.1 Write failing component tests**

Test with fake timers and mocked `fetch`:

- no request before three characters;
- a debounced request is sent to `/api/geocode?q=...`;
- structured suggestions render and selection emits the complete `AddressResult`;
- typing after a selection emits `onInputChange(value)` so the caller can invalidate stale coordinates;
- an empty result keeps the entered text and displays a manual-entry notice;
- a failed request keeps the entered text and displays a visible retry/manual-entry message;
- no direct browser request is made to Photon, Nominatim, or another provider.

- [ ] **2.2 Run the focused test and confirm RED**

Run: `npm test -- --runInBand src/components/AddressAutocomplete.test.tsx`

Expected: FAIL because the component calls Photon directly and has no manual-change callback or visible failure state.

- [ ] **2.3 Implement the minimal reusable control changes**

Change the props without breaking existing consumers:

```ts
interface Props {
  onSelect: (result: AddressResult) => void;
  onInputChange?: (value: string) => void;
  initialValue?: string;
  label?: string;
  size?: 'small' | 'medium';
  showMap?: boolean;
  mapHeight?: number;
  lat?: number;
  lng?: number;
}
```

Use `/api/geocode`, preserve debounce and cancellation safety, remove Photon-specific parsing from the browser, and show concise `No matches—keep typing or enter the address manually` / retry feedback. Do not block manual input.

- [ ] **2.4 Re-run the focused test and existing autocomplete consumers**

Run:

```bash
npm test -- --runInBand src/components/AddressAutocomplete.test.tsx src/pages/OperationalWorkflow.test.tsx
```

Expected: PASS.

- [ ] **2.5 Commit the reusable control**

```bash
git add src/components/AddressAutocomplete.tsx src/components/AddressAutocomplete.test.tsx
git commit -m "IMP-MIS-001 trust server address autocomplete"
```

## Task 3: Persist address provenance with authoritative Properties

**Files:**

- Modify: `src/types/fieldManagement.ts`
- Modify: `src/services/operationalApi.ts`
- Modify: `server/operational-api.js`
- Create: `supabase/migrations/20260804070000_property_address_source.sql`
- Modify: `src/services/__tests__/operationalApi.test.ts`
- Modify: `src/__tests__/trustedOperationalApi.test.js`
- Create: `src/__tests__/property-address-source-migration.test.ts`

- [ ] **3.1 Write failing type, mapping, transport, and migration tests**

Introduce the domain type:

```ts
export type PropertyAddressSource = 'GEOCODED' | 'MANUAL';
```

Test that:

- API reads map `addressSource` into a `Property`;
- create/update payloads send `addressSource` when supplied;
- the trusted server schema accepts `addressSource`, maps it to `address_source`, and rejects unknown values;
- the migration adds a non-null `address_source` column defaulted to `MANUAL` for historical rows;
- the migration constrains values to `GEOCODED` and `MANUAL`;
- the repository-controlled write function/metadata trigger retains the source on create and update without weakening tenant, location, audit, outbox, or concurrency behaviour.

- [ ] **3.2 Run the focused tests and confirm RED**

Run:

```bash
npm test -- --runInBand src/services/__tests__/operationalApi.test.ts src/__tests__/trustedOperationalApi.test.js src/__tests__/property-address-source-migration.test.ts
```

Expected: FAIL because `Property`, the transport schema, and PostgreSQL do not yet expose `addressSource`.

- [ ] **3.3 Implement the minimal authoritative persistence path**

Add `addressSource` to `Property`, map it in both directions, validate it server-side, and add the repository migration. Historical Properties become `MANUAL`; no existing coordinates or addresses are rewritten. Preserve row versioning, organisation isolation, existing RLS, audit, and transactional outbox behaviour.

- [ ] **3.4 Run focused tests and PostgreSQL behaviour verification**

Run the focused Jest command above, then run the repository's local migration/behaviour verifier used by the adjacent guided-parent metadata migration.

Expected: PASS, including a create/read/update round trip for both source values.

- [ ] **3.5 Commit authoritative persistence**

```bash
git add src/types/fieldManagement.ts src/services/operationalApi.ts server/operational-api.js supabase/migrations/20260804070000_property_address_source.sql src/services/__tests__/operationalApi.test.ts src/__tests__/trustedOperationalApi.test.js src/__tests__/property-address-source-migration.test.ts
git commit -m "IMP-MIS-001 retain authoritative property address source"
```

## Task 4: Connect autocomplete to guided Mission creation and resumable drafts

**Files:**

- Modify: `src/components/mission/GuidedMissionCreation.tsx`
- Modify: `src/components/mission/GuidedMissionCreation.test.tsx`
- Modify only if contract coverage requires it: `src/services/missionSetupDraftApi.ts`
- Modify only if contract coverage requires it: `src/__tests__/mission-setup-drafts-api.test.ts`

- [ ] **4.1 Write failing guided-workflow tests**

Cover both truthful paths:

**Selected suggestion**

- operator enters at least three characters;
- chooses a suggestion;
- address, state, locality, latitude, and longitude fill automatically;
- the screen shows `Address verified from search`;
- property create receives `addressSource: 'GEOCODED'` and the selected coordinates.

**Manual fallback**

- operator types or edits an address without choosing a suggestion;
- stale selected coordinates are cleared immediately;
- source becomes `MANUAL`;
- a visible notice says map confirmation is required in the next step;
- manual entry is allowed to continue and property create receives no invented coordinates.

**Draft restoration**

- Save and exit retains source and coordinates;
- Continue setup restores the selected/manual state exactly;
- no browser/local-storage persistence is used.

- [ ] **4.2 Run the focused workflow test and confirm RED**

Run: `npm test -- --runInBand src/components/mission/GuidedMissionCreation.test.tsx src/__tests__/mission-setup-drafts-api.test.ts`

Expected: FAIL because the guided screen still uses a plain Street address field and does not track provenance.

- [ ] **4.3 Implement the guided Mission behaviour**

Replace only the Street address input with `AddressAutocomplete` using `showMap={false}`. Extend Property form state with `addressSource`. On selection, set structured address fields and `GEOCODED`; on any subsequent manual edit, set `MANUAL` and clear coordinates. Render a small success or warning Alert immediately below the control. The full map confirmation remains in the next workflow step.

- [ ] **4.4 Re-run focused tests and confirm GREEN**

Run the focused workflow tests above.

Expected: PASS.

- [ ] **4.5 Commit the integrated workflow**

```bash
git add src/components/mission/GuidedMissionCreation.tsx src/components/mission/GuidedMissionCreation.test.tsx src/services/missionSetupDraftApi.ts src/__tests__/mission-setup-drafts-api.test.ts
git commit -m "IMP-MIS-001 autofill guided Mission work addresses"
```

## Task 5: Verify, migrate, deploy, and prove the operational capability

**Files:**

- Modify only for discovered regressions: directly affected files above
- Do not create planning artefacts or unrelated features

- [ ] **5.1 Run complete local verification**

Run:

```bash
npm test -- --runInBand
npm run lint
npm run build
git status --short
```

Expected: all suites pass, lint/build pass, and only intentional changes remain.

- [ ] **5.2 Confirm the linked Supabase project before migration**

Verify the CLI is linked to Production Beta project `fzkrvglzompkuiodqllr`. Inspect the migration diff/status before applying it. Stop if the project reference differs.

- [ ] **5.3 Apply the repository migration and deploy**

Apply the new migration, push `codex/production-beta` to `BJT-FTF/Spray-Command`, and deploy the accepted commit to Vercel project `spray-command-production-beta`.

- [ ] **5.4 Run deployed acceptance through the real guided Mission screen**

At `https://spray-command-production-beta.vercel.app/missions/new`, verify:

- Australian suggestions appear after three characters;
- selecting one fills state and retains coordinates/source;
- manual entry remains possible when no suggestion is suitable;
- editing a selected address removes stale verified coordinates;
- Save and exit / Continue setup restores the exact state;
- refresh and re-login preserve the draft;
- saving a Property persists address source and coordinates in PostgreSQL;
- a second authorised session sees the same record;
- tenant/location denial, audit, outbox, and optimistic concurrency remain effective;
- no local-storage or legacy persistence fallback occurs.

Archive any temporary acceptance draft/property through the supported UI/API after capturing evidence; do not fabricate a real Fly The Farm operational record.

- [ ] **5.5 Record the operational checkpoint**

Report only what Fly The Farm can now do, the manual step removed, and the next approved package (`Clients and Jobs repeat-work retrieval`).
