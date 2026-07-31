# Mission Pack PDF Design

## Purpose

Provide a single, operator-safe PDF export for a saved mission. The pack must be useful for field crews, operational approval, client records and printing without exposing company financial information.

## User experience

- Every saved mission card in the Missions register has an **Export Mission Pack** action alongside **Open**.
- Selecting the action downloads an A4 PDF without navigating away from the register.
- Export remains available for missions in Planning, Approved, Flying, Completed and Locked states.
- Missing optional information is shown as **Not recorded** or **No records**. It does not prevent export.
- A failed export produces a visible error on the Missions page.
- The file name follows `Mission_Pack_<mission-number>_<mission-name>.pdf` with unsafe filename characters removed.

## PDF contents

The pack contains these sections in this order:

1. Controlled cover and document details: mission name, mission number, status, scheduled date, generated timestamp and page numbering.
2. Mission and site: type, priority, description, client reference, location, coordinates, elevation and duration.
3. Aircraft and deployment work pack: assigned aircraft, kit and non-financial work-pack allocations.
4. Planned operation: field/property/client labels, operational values, chemicals and mission notes.
5. Weather: mission requirements, saved forecast snapshot and recorded conditions when available.
6. Boundary, map and flight plan: uploaded boundary manifest, boundary measurements, map-feature register, route and contingency summary. The first release records map geometry and annotations textually; it does not rasterise the interactive map.
7. Mission Checks / JSA: JSA identity and status, every prescribed question, its Yes/No/Not answered result, per-question notes, additional comments and pilot sign-off.
8. Risk Assessment: every triggered control, initial score, mitigation, residual score, plus legacy hazard records and control measures.
9. Compliance and authorisations: compliance flags, mission approvals, signatures, conditions and comments.
10. Audit and execution: status history and recorded flight outcome where available.

Financial estimates, actual costs, margin and profit are never read by or included in the standard Mission Pack generator.

## Architecture

- `src/utils/missionPackPdf.ts` owns deterministic filename creation and PDF rendering from a `MissionRecord`.
- The generator uses the project’s existing `jsPDF` dependency and follows the pagination, text-sanitisation and instrumented-text test pattern used by the Safety Plan PDF.
- `src/pages/MissionRegister.tsx` owns the download action and page-level failure feedback.
- Mission safety question labels come from `MISSION_CHECKS`, ensuring the PDF matches the form shown in the dashboard.
- Pure formatting helpers handle missing values, dates, durations and risk scores. The UI does not duplicate PDF content rules.

## Security and privacy

- The generator accepts a `MissionRecord` but explicitly selects allowed operational fields.
- It must not serialise `financialEstimate`, `financialActual` or unrelated object data.
- The standard PDF has no administrator-only variant in this release.
- Export uses the mission data already available to the authenticated Missions page and introduces no new database endpoint.

## Error handling

- PDF construction failures are caught by the Missions page and displayed in an error alert.
- Empty or legacy records export with explicit fallback labels.
- Invalid dates are printed as **Not recorded** rather than throwing.

## Verification

- Unit tests inspect instrumented PDF text to prove inclusion of mission, JSA, risk, weather, work-pack and approval content.
- Privacy tests use distinctive financial values and prove they never appear in captured PDF text.
- Filename and incomplete-record behaviour are tested.
- Missions register tests prove the export action is available and invokes the download path.
- The full unit suite and production build must pass before the feature is considered complete.

## Out of scope

- Embedding a rendered map image.
- Merging uploaded attachment files into the PDF.
- A financial/internal Mission Pack.
- Persisting the generated PDF as a job attachment. The downloaded PDF can be printed or uploaded through existing job document workflows; automated attachment persistence can be added separately.
