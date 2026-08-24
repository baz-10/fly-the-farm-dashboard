# Preprepared Checklist Library — Phase 1.6 Founder/operator refinement

**Status:** design refinement only; no content implemented, seeded, or published  
**Priority:** DJI AGRAS T100  
**Decision:** approved Founder direction incorporated  
**Principle:** ask what the pilot must inspect or decide; project authoritative system facts as evidence

## Classification and response contract

- **PHYSICAL TAP** — current human inspection; response `PASS / DEFECT`.
- **OPERATOR DECISION TAP** — current operational judgement/review; response `PASS / DEFECT`.
- **CONDITIONAL TAP** — appears only when authoritative applicability is true; response `COMPLETE / DEFECT` or `PASS / DEFECT` as stated.
- **SYSTEM RESOLVED — NO TAP** — displayed evidence; no acknowledgement control.
- **EXCEPTION ONLY** — the same evidence row changes into a blocking/action state when missing, expired, inconsistent, or changed; it never silently passes.

`CRITICAL` blocks Checklist completion/readiness under existing Checklist authority. It does not ground an Aircraft or change Fleet serviceability.

## A. Complete effective T100 SPRAY preflight

The header identifies the exact Aircraft, Base, Mission, and `SPRAY` configuration. Every consolidated frozen item retains all source references listed in its source cell.

| # | Section | Exact operator-facing wording | Authority / source | Classification | Response | Criticality | Conditional logic |
|---|---|---|---|---|---|---|---|
| S01 | Aircraft | Airframe and landing structure — no visible damage or foreign objects | DJI; T100-UM pp36–37 | PHYSICAL TAP | PASS / DEFECT | CRITICAL | always |
| S02 | Aircraft | Arms and locks — fully opened, locked and secure | DJI; T100-UM p36 | PHYSICAL TAP | PASS / DEFECT | CRITICAL | always |
| S03 | Aircraft | Installed aircraft parts — correct for this aircraft, securely fitted and serviceable; battery, payload and cables correctly connected | DJI; T100-UM p36, combining original parts, fitment and connection outcomes | PHYSICAL TAP | PASS / DEFECT | CRITICAL | always; component age/life is excluded and projected from Fleet |
| S04 | Sensors | Radar and vision sensors — clean, clear, unobstructed and free of visible damage | DJI; T100-UM pp36–37 | PHYSICAL TAP | PASS / DEFECT | CRITICAL | always |
| S05 | Sensors | LiDAR window — clean, clear and undamaged | DJI; T100-UM p44, LiDAR Maintenance | PHYSICAL TAP | PASS / DEFECT | CRITICAL | T100 only; inspection, not cleaning action |
| S06 | Propulsion | Propellers — correctly mounted and secure; no cracks, deformation, excessive wear, damage or obstruction | DJI; T100-UM pp36, 44; preserves both original propeller outcomes | PHYSICAL TAP | PASS / DEFECT | CRITICAL | always |
| S07 | Propulsion | Motors — clean, unobstructed and free of visible damage or abnormal condition | DJI; T100-UM pp36–37 | PHYSICAL TAP | PASS / DEFECT | CRITICAL | always |
| S08 | Battery & power | Aircraft and controller battery levels — adequate for the planned operation | DJI; T100-UM p36 | OPERATOR DECISION TAP | PASS / DEFECT | CRITICAL | always; available telemetry may be displayed but does not replace adequacy judgement |
| S09 | Battery & power | Flight battery — undamaged and securely locked; connectors clean, dry and serviceable | DJI; T100-UM pp36, 63–64, maintenance table p74; preserves condition, connector, and lock outcomes | PHYSICAL TAP | PASS / DEFECT | CRITICAL | always |
| S10 | RC / status | DJI Agras app and Aircraft status — normal, flight-data recording available, and no blocking warning | DJI; T100-UM pp36–37 | SYSTEM RESOLVED — NO TAP | resolved evidence | CRITICAL | live app/status evidence; becomes EXCEPTION ONLY if unavailable or blocking |
| S11 | RC / communications | Controller link and signal — Aircraft connected with adequate signal; antennas correctly positioned and unobstructed | DJI; T100-UM pp35–36 and RC guidance | PHYSICAL TAP | PASS / DEFECT | CRITICAL | always; combines link/signal display with antenna action |
| S12 | Take-off confirmation | Flight-control response — normal before commencing the operation | DJI; T100-UM Take Off p36 | CONDITIONAL TAP | PASS / DEFECT | CRITICAL | shown in take-off confirmation after motors/control response can safely be assessed; not a walk-around tap |
| S13 | Positioning | Positioning mode — RTK source is correct and solution ready | DJI; T100-UM Take Off pp35–36 | CONDITIONAL TAP | PASS / DEFECT | CRITICAL | only when authoritative Mission/configuration selects RTK; non-RTK mode is displayed without a redundant `RTK disabled` tap |
| S14 | Positioning | Compass calibration — complete the DJI Agras prompted procedure | DJI; T100-UM pp34–36 | CONDITIONAL TAP | COMPLETE / DEFECT | ATTENTION | only when the app requires calibration; absent otherwise |
| S15 | Positioning | Home Point and RTH altitude — suitable for this site and obstacle environment | DJI; T100-UM pp40–41 | OPERATOR DECISION TAP | PASS / DEFECT | CRITICAL | T100 source-supported; current values displayed with the decision |
| S16 | Spray system | Spray tank and system — tank secure and cap closed; no leaks, damaged lines or blockage | DJI; T100-UM pp36–37 | PHYSICAL TAP | PASS / DEFECT | CRITICAL | `SPRAY` configuration only |
| S17 | Spray system | Atomisers / sprinklers — clean, unobstructed and operating normally | DJI; T100-UM pp36, 44 | PHYSICAL TAP | PASS / DEFECT | CRITICAL | `SPRAY` only |
| S18 | Spray system | Spray test — output normal with no leak or blockage | DJI; T100-UM preflight and spraying-system guidance | PHYSICAL TAP | PASS / DEFECT | CRITICAL | `SPRAY` only; performed at the safe workflow point |
| S19 | Spray system | Flow calibration — complete the DJI Agras calibration procedure | DJI; T100-UM Flow Meter Calibration | CONDITIONAL TAP | COMPLETE / DEFECT | ATTENTION | only when authoritative DJI/app state requires calibration; never asks whether it is required |
| S20 | Resolved evidence | Mission — exact Mission selected | SPRAY COMMAND; authoritative Mission identity | SYSTEM RESOLVED — NO TAP | resolved evidence | CRITICAL | becomes EXCEPTION ONLY if absent/changed |
| S21 | Resolved evidence | Aircraft — exact T100 selected | SPRAY COMMAND; authoritative Fleet identity | SYSTEM RESOLVED — NO TAP | resolved evidence | CRITICAL | becomes EXCEPTION ONLY if absent/inconsistent |
| S22 | Resolved evidence | Base — exact authorised Base selected | SPRAY COMMAND; authoritative operating-location identity | SYSTEM RESOLVED — NO TAP | resolved evidence | CRITICAL | becomes EXCEPTION ONLY if absent/cross-scope |
| S23 | Resolved evidence | Payload configuration — SPRAY configuration matches the Mission | SPRAY COMMAND; authoritative Mission/Fleet configuration | SYSTEM RESOLVED — NO TAP | resolved evidence | CRITICAL | mismatch is EXCEPTION ONLY |
| S24 | Resolved evidence | Pilot authority — current for this Aircraft and operation | CASA; CASR 101.252 and resolved category/ReOC context | SYSTEM RESOLVED — NO TAP | resolved evidence | CRITICAL | missing/expired/inapplicable authority is EXCEPTION ONLY |
| S25 | Resolved evidence | Aircraft registration / operating authority — current for this operation | CASA; CASR Part 101 and CASA category guidance | SYSTEM RESOLVED — NO TAP | resolved evidence | CRITICAL | unresolved authority is EXCEPTION ONLY |
| S26 | Resolved evidence | Operating basis — exact ReOC, excluded-category or approval basis resolved | CASA; CASR 101.237 and CASA ReOC guidance | SYSTEM RESOLVED — NO TAP | resolved evidence | CRITICAL | unresolved/contradictory basis is EXCEPTION ONLY |
| S27 | Resolved evidence | Fleet state — serviceability, maintenance due-state and applicable component life current | SPRAY COMMAND; Fleet authority projection | SYSTEM RESOLVED — NO TAP | resolved evidence | CRITICAL | Checklist does not recalculate; non-current state is EXCEPTION ONLY |
| S28 | Resolved evidence | Required operational release and records — present for this operating category | CASA; MOS-101 Ch10 | SYSTEM RESOLVED — NO TAP | resolved evidence | CRITICAL | only where applicable; missing evidence is EXCEPTION ONLY |
| S29 | Site & Mission | Airspace / approvals — current result reviewed; no unresolved restriction | CASA; CASR 101.238, 101.250 and CASA airspace guidance | OPERATOR DECISION TAP | PASS / DEFECT | CRITICAL | current authoritative result and approval state displayed |
| S30 | Site & Mission | People and operating area — required separation can be maintained | CASA; CASR 101.238, 101.245, 101.280 | OPERATOR DECISION TAP | PASS / DEFECT | CRITICAL | each Mission/site |
| S31 | Site & Mission | Flight conditions — suitable and within the resolved operating limits | CASA; CASR 101.238; exact approval branch where applicable | OPERATOR DECISION TAP | PASS / DEFECT | CRITICAL | each Mission/time |
| S32 | Site & Mission | Emergency / public-safety activity — no conflicting operation | CASA; CASR 101.238(e) | OPERATOR DECISION TAP | PASS / DEFECT | CRITICAL | each Mission/time; exact approval state shown if relevant |
| S33 | Site & Mission | Launch and task area — helmet in use; clear of people, vehicles, obstacles and loose debris | DJI; T100-UM p36 | OPERATOR DECISION TAP | PASS / DEFECT | CRITICAL | current-world assessment immediately before operation |

### T100 SPRAY metrics

- **Total source-backed outcomes:** 38 original governed outcomes, all retained in provenance.
- **Visible items:** 33 maximum; normally 30–31 because compass/flow items are absent unless required.
- **Routine operator taps:** 19.
- **Conditional taps:** 4 possible: control response, RTK, compass calibration, flow calibration.
- **System-resolved facts:** 10 rows (app/status plus nine Mission/Fleet/CASA/record facts).
- **Exception-only states:** 10 corresponding fail-closed evidence states; these are alternate states of resolved rows, not extra taps.

## B. Complete effective T100 SPREAD preflight

Rows D01–D15 and D20–D33 are identical in wording, source, classification, response, criticality, and logic to SPRAY rows S01–S15 and S20–S33 respectively. They are reproduced by reference here as frozen common outcomes, not inherited without provenance: D01–D15 map one-for-one to S01–S15; D20–D33 map one-for-one to S20–S33. The payload section is replaced in full by these T100/T70-series spread rows:

| # | Section | Exact operator-facing wording | Authority / source | Classification | Response | Criticality | Conditional logic |
|---|---|---|---|---|---|---|---|
| D16 | Spread system | Spreader — correct compatible T100/T70-series system installed securely; cables and covers secure; spinner has clear movement | DJI; T100-SPREAD pp2–3, warnings 1 and 5 plus Installation; retains compatibility, firmware, installation, cable/cover and clearance outcomes | PHYSICAL TAP | PASS / DEFECT | CRITICAL | `SPREAD` configuration only; exact installed identity and supported firmware also displayed |
| D17 | Spread system | Material — compatible, dry and free of clumps or foreign material | DJI; T100-SPREAD p2, warnings 2–3 | PHYSICAL TAP | PASS / DEFECT | CRITICAL | `SPREAD` only; exact T70-series diameter/material rules apply |
| D18 | Spread system | Load — within the current DJI Agras app recommendation | DJI; T100-SPREAD p2, warning 4 and specification note | OPERATOR DECISION TAP | PASS / DEFECT | CRITICAL | `SPREAD` only; live recommendation displayed |
| D19 | Spread system | Feeder and spinner — functioning normally | DJI; T100-SPREAD p2, warning 6 | PHYSICAL TAP | PASS / DEFECT | CRITICAL | before each use |

The complete D20–D33 sequence is: exact Mission, exact T100, exact Base, SPREAD payload match, pilot authority, Aircraft authority, operating basis, Fleet state, operational records, airspace/approvals, people/area, flight conditions, emergency activity, and launch/task area, using the exact S20–S33 contracts above.

### T100 SPREAD metrics

- **Total source-backed outcomes:** 40 original governed outcomes, all retained in provenance.
- **Visible items:** 33 maximum; normally 31–32 because compass appears only when prompted.
- **Routine operator taps:** 20.
- **Conditional taps:** 3 possible: control response, RTK, compass calibration.
- **System-resolved facts:** 10.
- **Exception-only states:** 10 corresponding fail-closed evidence states.

## C. Recommended T100 walk-around order

1. **Header and resolved evidence:** Mission, T100, Base, payload, authorities, Fleet state, records. Resolve exceptions before approaching start readiness.
2. **Airframe at the rear/start position:** airframe/landing structure, arms/locks, installed parts and connections.
3. **Clockwise propulsion circuit:** inspect each propeller and motor once; the UI records Aircraft/system/position automatically.
4. **Sensor face:** radar/vision, then T100 LiDAR window.
5. **Battery/power station:** charge adequacy, battery/lock/connectors.
6. **Payload station:** either the three spray checks plus conditional flow calibration, or the four spread checks.
7. **Controller position:** link/signal/antenna; display app/status and positioning evidence; show only applicable RTK/compass action.
8. **Site-facing decisions:** airspace, people/area, conditions, emergency activity, launch/task area.
9. **Take-off confirmation:** control response after it can safely and meaningfully be assessed.

This changes presentation order only. Source authority and frozen provenance remain attached to each outcome.

## D. RC / control-response decision

**Decision: B — take-off confirmation.**

The T100 manual's Pre-Flight Checklist establishes general component working order. The explicit control-response wording appears under **Take Off** after the motor-start and take-off sequence: before the operation, controller stick control and Aircraft response must be normal; if abnormal, land and resolve the issue. That placement requires genuine dynamic response rather than a static walk-around assertion. Preserve it as a DJI-critical take-off confirmation, not a routine preflight checkbox. T25P may use the same pattern where its own primary source supports it. T50/T25 do not inherit it without equivalent evidence.

## E. Governed conditional flows

### Positioning

1. Display authoritative `POSITIONING MODE: RTK` or `GNSS / NON-RTK`.
2. For RTK, show one conditional action: `RTK source is correct and solution ready`.
3. For non-RTK, show resolved state only; never ask for `RTK disabled` confirmation.
4. Display GNSS/status telemetry as evidence and surface an exception if inadequate.
5. Show compass calibration only when DJI Agras requires it.

### Spray

The effective physical flow is: tank/system integrity; atomiser/sprinkler condition and operation; spray test. Flow calibration is shown only when authoritative state requires it. The pilot is never asked to decide calibration applicability.

### Spread

The effective physical flow is: correct/secure compatible system and clear spinner; compatible dry material; load within live recommendation; normal feeder/spinner function. The frozen item retains each represented source outcome and exact T100/T70-series identity.

## F. Site & Mission resolved-evidence model

The module opens with: `Aircraft checks establish physical readiness. These checks establish whether this operation may proceed.`

Resolved evidence is a compact status panel, not a checklist of green buttons. It shows exact Mission, Aircraft, Base, payload match, pilot authority, Aircraft authority, operating basis, Fleet state, and required record/release state. Each row includes source, observed version/time, and status. A missing, expired, changed, inconsistent, or indeterminate row becomes a prominent blocking exception with its exact next action.

The five operator-owned decisions remain taps: airspace/approval result reviewed; people separation maintainable; flight conditions suitable; no conflicting emergency/public-safety operation; launch/task area safe. CASA applicability is derived from the resolved operating context. Jurisdiction-specific chemical regulation remains outside universal v1.

## G. Finding UX

For a failed physical or decision item:

`DEFECT` → bounded note requirement from item rule → optional/required photo/evidence → Aircraft, system, component position, Checklist item, Mission, and source context captured automatically → `DEFECT_HANDOFF_PENDING` where existing authority requires handoff.

The pilot never re-selects known context. Critical failure may block Checklist completion/readiness; it does not create a Fleet serviceability transition or automatically ground the Aircraft.

## H. Post-Flight

| Order | Operator wording | Classification | Authority / source |
|---|---|---|---|
| 1 | Aircraft powered down and battery removed safely | PHYSICAL ACTION TAP | DJI; T50T25-UM p61 and model operating manuals |
| 2 | Aircraft / propulsion — no new damage, looseness or abnormal condition | PHYSICAL TAP | DJI; model post-flight/maintenance guidance |
| 3 | Payload system — no new leak, damage, blockage or unsafe residue | PHYSICAL TAP | DJI; T50T25-UM p61; T100-UM p43 |
| 4 | Battery / connector — no new abnormal condition | PHYSICAL TAP | DJI; T50T25-UM p61 and model battery guidance |
| 5 | New warnings / faults — none, or captured as Checklist findings | OPERATOR DECISION TAP | SPRAY COMMAND; Checklist finding authority |

No repair, maintenance completion, or return-to-service claim is made.

## I. End-of-Day

| Order | Operator wording/status | Classification | Logic |
|---|---|---|---|
| 1 | Aircraft / payload cleaned, dry, emptied and prepared for storage as applicable | PHYSICAL ACTION TAP | model/configuration applicable; organisation chemical method remains separate |
| 2 | T100 LiDAR window cleaned using the approved DJI procedure | CONDITIONAL TAP | only if required; DJI T100-UM p44; distinct from preflight inspection |
| 3 | Operational records completed | SYSTEM RESOLVED — NO TAP | only ask for action when authoritative completion cannot be proved |
| 4 | Outstanding findings — e.g. `2 findings awaiting maintenance handoff` | SYSTEM RESOLVED — NO TAP / EXCEPTION ONLY | display current finding state; never ask the pilot to tick that open findings exist |

## J. Propagation to T50, T25P, and T25

### T50

- Apply the consolidated installed-parts, propeller, battery, spray, spread, resolved-evidence, conditional RTK, and conditional compass patterns using T50 sources.
- Preserve T50 hose/bubble purge as a model-supported conditional spray action.
- Do not add T100 LiDAR, T100 RTH, or T100 control-response wording.
- Use the exact T50 spread guide and material/feed requirements.

### T25P

- Apply the same consolidation patterns using T25P sources.
- Preserve model-supported Home Point/RTH.
- Preserve control-response authority, but place it in take-off confirmation rather than the walk-around.
- Use exact GS25P spread identity and its own material/feed evidence.
- Do not infer T100 LiDAR.

### T25

- Apply consolidation only where T50/T25 primary evidence supports it.
- Keep the model-specific layer deliberately minimal.
- Do not invent LiDAR, RTH-altitude, or control-response items for symmetry.
- Use exact T25 spread-guide material/feed requirements.

Across all four models, component life, maintenance due-state, and serviceability are Fleet projections; calibration appears only when prompted; resolved authority is evidence rather than manual confirmation; and physical preflight is not automatically reused for the day.

## K. Source gaps retained

1. T100 catalogue metadata discrepancy remains monitored separately.
2. T100 dual-battery configuration remains **UNRESOLVED — DO NOT PUBLISH**.
3. Relay/cellular checks remain absent until installed configuration and applicability are authoritative.
4. Jurisdiction chemical regulation remains a separate future source program.
5. Organisation cleaning, chemical handling, PPE, and local/customer procedure remain organisation-owned.

## L. Implementation-plan impact

**PLAN UPDATE REQUIRED — bounded task updates only; architecture and slice sequence remain unchanged.**

1. **Source-gate/content fixture task:** represent a consolidated operator item with an ordered array of every underlying source outcome/reference; prohibit loss of provenance.
2. **Composition/preview task:** add presentation classifications and mutually exclusive resolved/action/exception states; no second Mission-readiness engine.
3. **Conditional resolver task:** derive RTK/non-RTK, compass prompt, flow-calibration applicability, records applicability, and installed configuration before rendering.
4. **Fixture-only UX task:** separate resolved-evidence panel, walk-around actions, site decisions, take-off confirmation, and finding capture; automatic context capture for findings.
5. **Acceptance fixtures:** enforce T100 routine burden of 19 spray / 20 spread taps, no redundant `RTK disabled`, no unprompted compass/flow tap, no daily preflight reuse, no dual-battery publication, and full multi-source frozen provenance.

No content migration, PLATFORM_SYSTEM seed, runtime change, Product Maturity change, Production work, Fleet defect, or PR #23/#24 modification is authorised by this report.
