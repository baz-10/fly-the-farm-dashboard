# Preprepared Checklist Library — Founder/operator content review pack

**Phase:** 1.5 — review material only

**Status:** proposed PLATFORM_SYSTEM content; not implemented or published

**Prepared:** 24 August 2026

## How to review this pack

This pack shows the effective checklist an operator would see after composition. It deliberately uses field wording rather than schema terminology.

Labels:

- **DJI** — directly supported by the named DJI primary document.
- **CASA** — directly supported by Australian aviation legislation or CASA guidance; appearance is context-dependent.
- **SPRAY COMMAND** — product workflow/readiness control, not a manufacturer or legal requirement.
- **ORGANISATION CANDIDATE** — useful only if an organisation adopts and owns it.
- **UNRESOLVED — DO NOT PUBLISH** — evidence or scope is insufficient.

Responses use `PASS / DEFECT` unless stated otherwise. A critical item blocks completion of this checklist; it does not itself ground an aircraft or create a Fleet defect.

### Compact source keys

| Key | Primary document | Version/date | Reference | Confidence |
|---|---|---|---|---|
| T100-UM | DJI AGRAS T100 User Manual | v1.0, 6 Nov 2025 | Pre-Flight Checklist pp36–37; take-off pp35–36; RTH pp40–41; storage/maintenance pp43–44; battery pp63–64 | high |
| T100-SPREAD | DJI AGRAS T100 / T70 Series Spreading System Product Information | v1.0, 15 Jul 2025 | Warnings and Installation, pp2–3 | high |
| T50T25-UM | DJI AGRAS T50/T25 Unmanned Aircraft Flight Manual | v1.0, 9 Jan 2025 | Pre-Flight Checklist pp43–44; Post-Flight p61; handling pp66–72; battery pp94–95 | high |
| T50T25-SPREAD | DJI AGRAS T50/T25 Spreading System User Guide | v1.0, 25 Apr 2024 | installation/warnings and operation | high |
| T25P-UM | DJI AGRAS T25P User Manual | v1.0, 13 Mar 2026 | Pre-Flight Checklist pp34–35; take-off pp33–36; storage/maintenance pp41–42; battery pp61–62 | high |
| T25P-SPREAD | DJI AGRAS T25P Spreading System Product Information | v1.0, 15 Jul 2025 | Warnings and Installation, p3 | high |
| CASR-101 | Civil Aviation Safety Regulations 1998, Part 101 | current checked 24 Aug 2026 | 101.237–101.285, especially 101.237–101.238 | high |
| MOS-101 | Part 101 Manual of Standards 2019 | F2024C00404, 30 Apr 2024 | Chapter 10 operational/technical records | high |

## A. DJI AGRAS T100 — complete operator preflight

Header shown to operator: `T100-002 — PREFLIGHT` with exact Aircraft, Base, Mission and `SPRAY` or `SPREAD` configuration.

### Aircraft / airframe

| # | Operator wording | Label | Source | Response | Criticality |
|---|---|---|---|---|---|
| 1 | Airframe and landing structure — inspect for visible damage or foreign objects | DJI | T100-UM pp36–37 | PASS / DEFECT | CRITICAL |
| 2 | Arms and locks — fully opened, locked and secure | DJI | T100-UM p36 | PASS / DEFECT | CRITICAL |
| 3 | Battery, payload and cables — correctly fitted and firmly connected | DJI | T100-UM p36 | PASS / DEFECT | CRITICAL |
| 4 | Required parts — genuine, serviceable and not aged or broken | DJI | T100-UM p36 | PASS / DEFECT | CRITICAL |
| 5 | Radar and vision sensors — clean, unobstructed and free of errors | DJI | T100-UM pp36–37 | PASS / DEFECT | CRITICAL |
| 6 | LiDAR window — clean, undamaged and unobstructed | DJI | T100-UM p44, LiDAR Maintenance | PASS / DEFECT | CRITICAL |

### Propulsion

| # | Operator wording | Label | Source | Response | Criticality |
|---|---|---|---|---|---|
| 7 | Propellers — inspect for cracks, deformation, excessive wear or damage | DJI | T100-UM pp36, 44 | PASS / DEFECT | CRITICAL |
| 8 | Propellers — correctly mounted, secure and unobstructed | DJI | T100-UM pp36, 44 | PASS / DEFECT | CRITICAL |
| 9 | Motors — clean, unobstructed and free of visible damage or abnormal condition | DJI | T100-UM pp36–37 | PASS / DEFECT | CRITICAL |

### Battery & power

| # | Operator wording | Label | Source | Response | Criticality |
|---|---|---|---|---|---|
| 10 | Flight battery and controller — adequately charged for this operation | DJI | T100-UM p36 | PASS / DEFECT | CRITICAL |
| 11 | Flight battery — no damage or abnormal condition | DJI | T100-UM pp36, 64 | PASS / DEFECT | CRITICAL |
| 12 | Battery and aircraft connectors — clean, dry and free of corrosion or damage | DJI | T100-UM pp63–64 and maintenance table p74 | PASS / DEFECT | CRITICAL |
| 13 | Flight battery — correctly installed and locked | DJI | T100-UM p36 | PASS / DEFECT | CRITICAL |

### RC / communications

| # | Operator wording | Label | Source | Response | Criticality |
|---|---|---|---|---|---|
| 14 | DJI Agras app — operating normally and able to record flight data | DJI | T100-UM p36 | PASS / DEFECT | CRITICAL |
| 15 | Remote controller link — aircraft connected with adequate signal | DJI | T100-UM take-off pp35–36 | PASS / DEFECT | CRITICAL |
| 16 | Controller antennas — correctly positioned and unobstructed | DJI | T100-UM p36 and RC operating guidance | PASS / DEFECT | ATTENTION |
| 17 | Flight controls — stick input and aircraft response are normal | DJI | T100-UM p36, take-off notice | PASS / DEFECT | CRITICAL |

### RTK / positioning and status

| # | Operator wording | Label | Source | Response | Criticality |
|---|---|---|---|---|---|
| 18 | Aircraft status — review all warnings; no unresolved error remains | DJI | T100-UM p37 | PASS / DEFECT | CRITICAL |
| 19 | GNSS — signal is strong enough for the selected operation mode | DJI | T100-UM pp39–40 and take-off | PASS / DEFECT | CRITICAL |
| 20 | RTK — correct source selected and RTK ready | DJI | T100-UM take-off pp35–36 | PASS / DEFECT / N/A | CRITICAL |
| 21 | RTK not used — RTK positioning is disabled | DJI | T100-UM take-off pp35–36 | YES / NO / N/A | CRITICAL |
| 22 | Compass — complete calibration only when prompted by the app | DJI | T100-UM pp34–36 | PASS / DEFECT / N/A | ATTENTION |
| 23 | Home point and RTH altitude — suitable for this site and obstacle environment | DJI | T100-UM pp40–41 | PASS / DEFECT | CRITICAL |

### Spray configuration — show only for `SPRAY`

| # | Operator wording | Label | Source | Response | Criticality |
|---|---|---|---|---|---|
| 24S | Spray tank — fitted securely, cap closed and load within the app recommendation | DJI | T100-UM pp36–37 and take-off | PASS / DEFECT | CRITICAL |
| 25S | Spray system — inspect tank, pumps, hoses and lines for leaks or blockage | DJI | T100-UM p36 | PASS / DEFECT | CRITICAL |
| 26S | Sprinklers / atomisers — operating correctly with acceptable output | DJI | T100-UM pp36, 44 | PASS / DEFECT | CRITICAL |
| 27S | Flow calibration — required only if the manual trigger is present | DJI | T100-UM Flow Meter Calibration section | YES / NO / N/A | ATTENTION |

### Spread configuration — show only for `SPREAD`

| # | Operator wording | Label | Source | Response | Criticality |
|---|---|---|---|---|---|
| 24D | Spreading system — compatible system and supported aircraft firmware confirmed | DJI | T100-SPREAD p2, warning 1 | PASS / DEFECT | CRITICAL |
| 25D | Spreader installation — tank seated firmly; cable and connector covers secure | DJI | T100-SPREAD pp2–3, Installation | PASS / DEFECT | CRITICAL |
| 26D | Spinner clearance — disc cannot contact cables or aircraft structure | DJI | T100-SPREAD p3, Installation | PASS / DEFECT | CRITICAL |
| 27D | Material — dry, compatible size and free of clumps, bags, straw, gravel or debris | DJI | T100-SPREAD p2, warnings 2–3 | PASS / DEFECT | CRITICAL |
| 28D | Spread load — does not exceed the current DJI Agras app recommendation | DJI | T100-SPREAD p2, warning 4/specification note | PASS / DEFECT | CRITICAL |
| 29D | Screw feeder and spinner disc — functioning normally before use | DJI | T100-SPREAD p2, warning 6 | PASS / DEFECT | CRITICAL |

### Site & Mission — show separately as operation readiness

| # | Operator wording | Label | Source | Response | Criticality |
|---|---|---|---|---|---|
| 28S / 30D | Mission, Aircraft and Base — exact selections confirmed | SPRAY COMMAND | authoritative Mission/Fleet identities | CHECK | CRITICAL |
| 29S / 31D | Mission configuration — spray/spread payload matches the planned operation | SPRAY COMMAND | authoritative Mission/Fleet configuration | PASS / DEFECT | CRITICAL |
| 30S / 32D | Fleet readiness — authoritative serviceability and due-state reviewed | SPRAY COMMAND | Fleet authority; Checklist does not calculate it | PASS / DEFECT | CRITICAL |
| 31S / 33D | Remote pilot authority — valid for this aircraft and operation | CASA | CASR 101.252; category/ReOC context | PASS / DEFECT | CRITICAL |
| 32S / 34D | Operating authority — exact ReOC, excluded-category or approval basis resolved | CASA | CASR 101.237; CASA ReOC guidance | PASS / DEFECT | CRITICAL |
| 33S / 35D | Airspace and aerodrome restrictions — checked; required approval is current | CASA | CASR 101.238, 101.250; CASA airspace guidance | PASS / DEFECT | CRITICAL |
| 34S / 36D | People and populous-area controls — required separation and exclusions established | CASA | CASR 101.238, 101.245, 101.280 | PASS / DEFECT | CRITICAL |
| 35S / 37D | Flight conditions — VLOS, daylight and height limit satisfied, or exact approval recorded | CASA | CASR 101.238 | PASS / DEFECT | CRITICAL |
| 36S / 38D | Emergency activity — no conflicting public-safety operation, or approval recorded | CASA | CASR 101.238(e) | PASS / DEFECT | CRITICAL |
| 37S / 39D | Launch and task area — helmet worn; people, vehicles, obstacles and loose debris clear | DJI | T100-UM p36 | PASS / DEFECT | CRITICAL |
| 38S / 40D | Required operational release and records — present for this operating category | CASA | MOS-101 Ch10 | PASS / DEFECT / N/A | CRITICAL |

## B. T100 source reconciliation

| Area | Phase 1 source | Current primary-source result | Difference | Decision |
|---|---|---|---|---|
| English aircraft manual | T100 User Manual v1.0, 6 Nov 2025, SHA-256 `8e5d2f…a8920` | current DJI Download Center still identifies English v1.0 dated 6 Nov 2025 and links the same document identity | no confirmed newer English manual; the Agriculture catalogue search metadata also shows 2 Jul 2026, creating a catalogue-date inconsistency | **NO MATERIAL CHANGE** to checklist; retain metadata discrepancy in source register |
| aircraft release notes | not used as pre-flight authority | current release notes dated 26 Jun 2026 | firmware changes may affect supported capabilities, but no contradictory pre-flight text was established | **NO MATERIAL CHANGE**; check firmware compatibility context |
| spreading system | previously source-gated | current T100 Downloads publishes T70 Series Spreading System Product Information v1.0; warnings expressly cover T70-series compatibility and per-use feeder/spinner checks | adds supported T100 spread items 24D–29D | **CHECKLIST UPDATE REQUIRED** |
| dual-battery spray system | not in Phase 1 matrix | Product Information dated 22 Jun 2026 exists | configuration-specific requirements not yet reviewed into operator items | **UNRESOLVED — DO NOT PUBLISH** for dual-battery configuration |

The 2 July 2026 date is not treated as a new manual revision because the current official DJI Download Center identifies the English manual as 6 November 2025. If DJI later provides a different English file, its hash and relevant sections must be compared before publication.

## C. T100 unresolved — do not publish

| Candidate | Missing evidence | Decision |
|---|---|---|
| dual-battery spraying-system checks | exact Product Information safety/installation content has not been incorporated | do not enable for that configuration |
| chemical mixing, label, buffer, drift and environmental controls | jurisdiction/product-specific primary-source work is outside CASA aviation evidence | future jurisdiction module |
| daily reuse of aircraft preflight | DJI requires status review before each flight and does not establish a blanket daily reuse period | no reuse in v1 |
| organisation cleaning/load procedure | must be written and approved by the organisation | organisation candidate only |

## D. DJI AGRAS T50 — complete effective preflight

The operator sees the following full composed common set; “COMMON AGRAS” is provenance, not a link to another checklist.

| Section | Complete field wording shown | Classification / source |
|---|---|---|
| Aircraft | Airframe and landing structure — no visible damage or foreign objects | COMMON AGRAS — T50T25-UM p43 |
| Aircraft | Arms and locks — fully opened, locked and secure | COMMON AGRAS — T50T25-UM p43, item 5 |
| Aircraft | Battery, tank/payload and cables — correctly fitted and firmly connected | COMMON AGRAS — T50T25-UM p43, items 2–4 |
| Aircraft | Required parts — serviceable, clean and unobstructed | COMMON AGRAS — T50T25-UM p43 |
| Sensors | FPV camera and binocular vision — clean, unobstructed and serviceable | T50 SPECIFIC wording — T50T25-UM p43, item 6 |
| Propulsion | Propellers — secure, unfolded and free of cracks, deformation or damage | COMMON AGRAS — T50T25-UM p43, item 5 |
| Propulsion | Motors and propellers — no foreign objects or abnormal condition | COMMON AGRAS — T50T25-UM p43, item 5 |
| Power | Aircraft battery and controller — adequately charged | COMMON AGRAS — T50T25-UM p43, item 1 |
| Power | Flight battery — undamaged and locked; connectors clean and dry | COMMON AGRAS — T50T25-UM pp43, 61, 94–95 |
| RC | DJI Agras app — operating normally | COMMON AGRAS — T50T25-UM p44 |
| RC | Remote controller — linked to the aircraft with adequate signal | COMMON AGRAS — T50T25-UM p44 |
| Positioning | Status and warnings — no unresolved error | COMMON AGRAS — T50T25-UM p44 |
| Positioning | GNSS and dual-antenna heading — adequate and ready | COMMON AGRAS — T50T25-UM p44 |
| Positioning | RTK source — correct and ready, or set to None when unused | COMMON AGRAS — T50T25-UM p44 |
| Positioning | Compass calibration — complete only when the app prompts | COMMON AGRAS — model manual calibration guidance |

T100 LiDAR, T100-only control-response wording and the T100 RTH item are not inherited without equivalent T50 evidence.

**T50 spray additions:**

| # | Operator wording | Classification | Source | Response | Criticality |
|---|---|---|---|---|---|
| T50-S1 | Spray tank and battery — firmly installed; cables connected | COMMON AGRAS | T50T25-UM p43, items 2–4 | PASS / DEFECT | CRITICAL |
| T50-S2 | Spray system — no blockage or leak | CONFIGURATION SPECIFIC | T50T25-UM p43, item 7 | PASS / DEFECT | CRITICAL |
| T50-S3 | Spray hoses — free of bubbles; purge before flight if required | T50 SPECIFIC | T50T25-UM p43, item 8 | PASS / DEFECT | ATTENTION |
| T50-S4 | Sprinklers — operating normally with acceptable output | CONFIGURATION SPECIFIC | T50T25-UM pre-flight/spray-system sections | PASS / DEFECT | CRITICAL |
| T50-S5 | Flow calibration — required only when the manual trigger is present | CONFIGURATION SPECIFIC | T50T25-UM flow-meter section | YES / NO / N/A | ATTENTION |

**T50 spread additions:** compatible T50 system/firmware; installation and cable security; compatible debris-free material; app-recommended load; normal feeder/spinner operation, all using `T50T25-SPREAD`.

**Site & Mission shown in full:** correct Mission/Aircraft/Base; correct payload configuration; Fleet readiness reviewed; pilot authority; operating authority; airspace/aerodrome result; people/populous-area controls; flight conditions/approval; emergency-activity check; safe launch/task area; required operational records. Sources and responses match the T100 Site & Mission rows. No LiDAR item appears.

## E. DJI AGRAS T25P — complete effective preflight

| Section | Complete field wording shown | Classification / source |
|---|---|---|
| Aircraft | Airframe and landing structure — no visible damage or foreign objects | COMMON AGRAS — T25P-UM pp34–35 |
| Aircraft | Arms and locks — fully opened, locked and secure | COMMON AGRAS — T25P-UM p34 |
| Aircraft | Battery, payload and cables — correctly fitted and firmly connected | COMMON AGRAS — T25P-UM p34 |
| Aircraft | Required parts — genuine, serviceable and not aged or broken | COMMON AGRAS — T25P-UM p34 |
| Sensors | Vision and radar systems — clean, unobstructed and free of errors | COMMON AGRAS — T25P-UM pp34–35 |
| Propulsion | Propellers — secure and free of cracks, deformation, wear or damage | COMMON AGRAS — T25P-UM pp34–35 |
| Propulsion | Motors — clean, unobstructed and free of abnormal condition | COMMON AGRAS — T25P-UM pp34–35 |
| Power | Aircraft battery and controller — adequately charged | COMMON AGRAS — T25P-UM p34 |
| Power | Flight battery — undamaged, connectors clean/dry, correctly installed and locked | COMMON AGRAS — T25P-UM pp34, 61–62 |
| RC | DJI Agras app — operating normally and recording flight data | COMMON AGRAS — T25P-UM p34 |
| RC | Remote controller — linked; antennas positioned; adequate signal | COMMON AGRAS — T25P-UM pre-flight/take-off |
| RC | Flight controls — stick input and aircraft response are normal | T25P SPECIFIC source — T25P-UM take-off |
| Positioning | Aircraft status — no unresolved warning or error | COMMON AGRAS — T25P-UM p35 |
| Positioning | GNSS — adequate for selected mode | COMMON AGRAS — T25P-UM take-off/mode guidance |
| Positioning | RTK source/state — correct and ready, or disabled when unused | COMMON AGRAS — T25P-UM take-off |
| Positioning | Compass calibration — complete only when prompted | COMMON AGRAS — T25P-UM pp32–34 |
| Positioning | Home point and RTH altitude — suitable for the site | T25P SPECIFIC source — T25P-UM RTH section |

No T100 LiDAR item appears because the reviewed T25P source does not establish it.

**T25P spray:** T100 spray items 24S–27S using T25P-UM pre-flight and flow-meter sections.

**T25P spread:** all six T100 spread outcomes 24D–29D appear, but the first item reads `T25P spreading system — exact T25P system and supported firmware confirmed`; source `T25P-SPREAD p3`. The document explicitly supports compatible dry material, no foreign objects, no overload, secure cabling/installation and normal screw-feeder/spinner operation.

**Site & Mission shown in full:** correct Mission/Aircraft/Base; correct payload configuration; Fleet readiness; pilot authority; operating authority; airspace/aerodrome result; people/populous-area controls; flight conditions/approval; emergency activity; safe launch/task area; required operational records.

**UNRESOLVED — DO NOT PUBLISH:** no inferred LiDAR item; chemical-use requirements remain jurisdiction-specific.

## F. DJI AGRAS T25 — complete effective preflight

| Section | Complete field wording shown | Classification / source |
|---|---|---|
| Aircraft | Airframe and landing structure — no visible damage or foreign objects | COMMON AGRAS — T50T25-UM p43 |
| Aircraft | Arms and locks — fully opened, locked and secure | COMMON AGRAS — T50T25-UM p43, item 5 |
| Aircraft | Battery, tank/payload and cables — correctly fitted and firmly connected | COMMON AGRAS — T50T25-UM p43, items 2–4 |
| Aircraft | Required parts — serviceable, clean and unobstructed | COMMON AGRAS — T50T25-UM p43 |
| Sensors | FPV camera and binocular vision — clean, unobstructed and serviceable | T25 SPECIFIC wording — T50T25-UM p43, item 6 |
| Propulsion | Propellers — secure, unfolded and free of cracks, deformation or damage | COMMON AGRAS — T50T25-UM p43, item 5 |
| Propulsion | Motors and propellers — no foreign objects or abnormal condition | COMMON AGRAS — T50T25-UM p43, item 5 |
| Power | Aircraft battery and controller — adequately charged | COMMON AGRAS — T50T25-UM p43, item 1 |
| Power | Flight battery — undamaged and locked; connectors clean and dry | COMMON AGRAS — T50T25-UM pp43, 61, 94–95 |
| RC | DJI Agras app — operating normally | COMMON AGRAS — T50T25-UM p44 |
| RC | Remote controller — linked to the aircraft with adequate signal | COMMON AGRAS — T50T25-UM p44 |
| Positioning | Status and warnings — no unresolved error | COMMON AGRAS — T50T25-UM p44 |
| Positioning | GNSS and dual-antenna heading — adequate and ready | COMMON AGRAS — T50T25-UM p44 |
| Positioning | RTK source — correct and ready, or set to None when unused | COMMON AGRAS — T50T25-UM p44 |
| Positioning | Compass calibration — complete only when the app prompts | COMMON AGRAS — model manual calibration guidance |

**T25 spray:** T50-S1–S5, with exact T25 configuration and payload limits.

**T25 spread:** apply the five operational outcomes in the Spread module below using `T50T25-SPREAD` and the exact T25 system identity.

**Site & Mission shown in full:** correct Mission/Aircraft/Base; correct payload configuration; Fleet readiness; pilot authority; operating authority; airspace/aerodrome result; people/populous-area controls; flight conditions/approval; emergency activity; safe launch/task area; required operational records. No T100 LiDAR, RTH-altitude or unsupported control-response item is inferred.

## G–K. Reusable configuration and technical modules

### G. Spray configuration

Lives once: secure/load tank; no leaks/blockage; output normal; model-supported hose purge; conditional flow calibration. It appears only when authoritative configuration is `SPRAY`. N/A cannot be used to bypass a required installed spray-system check.

### H. Spread configuration

For T100, T50, T25P and T25 where the exact supported spread system is installed:

1. exact compatible system and supported firmware;
2. secure installation/cables/covers and safe spinner clearance;
3. compatible dry material free from clumps and foreign objects;
4. load within app recommendation;
5. screw feeder and spinner function normally before use.

T100 additionally preserves its T70-series document identity; T25P uses its exact GS25P identity. Material/feed configuration is not copied between models.

### I. Battery & Power

Lives once: adequate charge, battery condition, connector condition and secure installation. Charging-cycle, storage and maintenance scheduling stay in Fleet/maintenance authority, not every preflight.

### J. RC / Communications

Lives once: functioning/recording app, aircraft link, antenna state and model-supported control-response check. Relay/cellular checks appear only where an installed, authoritative configuration and source require them; none is universally proposed in v1.

### K. RTK / Positioning

Lives once: status warnings, adequate GNSS, mutually exclusive RTK-used/RTK-disabled outcome, prompted compass calibration and model-supported Home Point/RTH check. The UI asks one conditional RTK question, not both items 20 and 21 as two taps.

## L. Site & Mission — operation readiness, not aircraft inspection

The module must visually begin: `Aircraft checks establish physical readiness. These checks establish whether this operation may proceed.`

It contains the eleven Site & Mission rows in the T100 table. Exact Mission/Aircraft/Base, Fleet readiness, pilot authority, operating category, airspace, people, flight conditions, emergency activity and records should be pre-resolved from authoritative data where possible. The operator acts only on missing/changed/exception evidence.

Chemical application regulation is separate:

- `AUSTRALIA — AVIATION` selects CASA/Part 101 items;
- `QUEENSLAND — CHEMICAL APPLICATION`, `NEW SOUTH WALES — CHEMICAL APPLICATION`, etc. are future jurisdiction-aware modules;
- no universal Australian chemical checkbox is proposed.

## M. Founder-facing CASA applicability matrix

| Item / obligation | Applicability | Authority/source | When it appears |
|---|---|---|---|
| exact RPA registered/identified | commercial or excluded-category operation | CASA guidance / CASR Part 101 | resolved for every operational Aircraft |
| pilot authority covers aircraft/operation | operation-category dependent; medium excluded and ReOC paths differ | CASR 101.252; CASA guidance | when personnel is assigned |
| ReOC scope or excluded-category conditions satisfied | category dependent | CASR 101.237; CASA ReOC/weight guidance | after operating context is selected |
| VLOS, daylight, at/below 400 ft AGL | standard RPA operating conditions | CASR 101.238 | standard-condition operation; exact approval branch otherwise |
| people separation / no populous-area operation | site and approval dependent | CASR 101.238, 101.245, 101.280 | each Mission/site |
| controlled/restricted/prohibited airspace and aerodrome constraints | airspace dependent | CASR 101.238, 101.250; CASA airspace guidance | each Mission/site using current airspace result |
| emergency/public-safety activity | site/time dependent | CASR 101.238(e) | each Mission/site |
| exact flight approval and conditions | approval dependent | Part 101/CASA flight authorisations | only where operation relies on approval |
| operational release/log and serviceability evidence | ReOC/role-context dependent | MOS Ch10; CASA record keeping | when applicable to organisation/operation |
| excluded-category operating/technical records | medium excluded category | MOS Ch10; CASA record keeping | only for that category |

## N. Proposed Post-Flight checklist

| # | Operator wording | Label | Source | Response | Criticality |
|---|---|---|---|---|---|
| PF1 | Aircraft safe — motors stopped, powered off and flight battery removed | DJI | T50T25-UM p61; model operating manuals | PASS / DEFECT | CRITICAL |
| PF2 | Aircraft and propulsion — inspect for new damage, looseness or abnormal condition | DJI | T50T25-UM p61 | PASS / DEFECT | ATTENTION |
| PF3 | Payload system — inspect for leaks, damage, blockage or unsafe residue | DJI | T50T25-UM p61; T100-UM p43 | PASS / DEFECT | ATTENTION |
| PF4 | Battery connector — clean and dry | DJI | T50T25-UM p61 | PASS / DEFECT / N/A | ATTENTION |
| PF5 | New warnings or faults — captured as Checklist findings | SPRAY COMMAND | Checklist finding authority | PASS / DEFECT | ATTENTION |

No repair, maintenance completion or return-to-service action is claimed.

## O. Proposed End-of-Day checklist

| # | Operator wording | Label | Source | Response | Criticality |
|---|---|---|---|---|---|
| ED1 | T100 LiDAR window — clean using the approved method after the aircraft cools | DJI | T100-UM p44 | PASS / DEFECT / N/A | ATTENTION |
| ED2 | Aircraft and payload — clean, dry and empty for storage as required | DJI | T100-UM p43; T50T25-UM handling | PASS / DEFECT | ATTENTION |
| ED3 | Required operational and technical records — reconciled | CASA | MOS-101 Ch10 | PASS / DEFECT / N/A | ATTENTION |
| ED4 | Open Checklist findings — handed off or explicitly left `DEFECT_HANDOFF_PENDING` | SPRAY COMMAND | Checklist finding authority | PASS / DEFECT / N/A | ATTENTION |

Organisation-specific chemical cleaning, PPE disposal and product procedures are not platform DJI/CASA content.

## P. Source label completeness

Every proposed operator item above has a visible authority label and compact source. Composition must preserve the full source organisation, title, version/date, URL/document identity, retrieval date, page/section and evidence confidence in the item detail panel and frozen execution. `SPRAY COMMAND` and `ORGANISATION CANDIDATE` items cannot inherit DJI or CASA labels.

## Q. Operator burden metrics

Counts below assume a spray Mission, RTK used, no exceptional approval and authoritative identities pre-resolved. Conditional items appear only when applicable.

| Effective checklist | Sections | Total possible items | Expected visible | Routine operator taps after trusted prefill | Conditional/N/A | Duplicates avoided |
|---|---:|---:|---:|---:|---:|---:|
| T100 spray preflight | 7 | 38 | 35–38 | about 25–28 | RTK/compass/calibration/records | 10–13 context facts not retyped |
| T100 spread preflight | 7 | 40 | 37–40 | about 27–30 | RTK/compass/records | 10–13 |
| T50 spray preflight | 7 | 34 | 31–34 | about 22–25 | RTK/compass/calibration/records | 10–13 |
| T50 spread preflight | 7 | 34 | 31–34 | about 22–25 | RTK/compass/records | 10–13 |
| T25P spray preflight | 7 | 37 | 34–37 | about 24–27 | RTK/compass/calibration/records | 10–13 |
| T25P spread preflight | 7 | 39 | 36–39 | about 26–29 | RTK/compass/records | 10–13 |
| T25 spray preflight | 7 | 34 | 31–34 | about 22–25 | RTK/compass/calibration/records | 10–13 |
| T25 spread preflight | 7 | 34 | 31–34 | about 22–25 | RTK/compass/records | 10–13 |
| Post-Flight | 1 compact flow | 5 | 4–5 | 4–5 | connector model scope | — |
| End-of-Day | 1 compact flow | 4 | 2–4 | 2–4 | LiDAR/records/findings | avoids repeating post-flight inspection |

**Burden assessment:** the complete preflight is substantial but not excessive for 25–150 kg agricultural RPA if trusted context rows are displayed as resolved evidence rather than confirmation taps. It becomes excessive if all CASA/reference facts require manual re-confirmation every time. The UI should require taps for physical inspection and exceptions, not re-entry of known registration, Base, licence, model or approval facts.

## R. Redundancy review

| Repeated concept | One authoritative home | Other views |
|---|---|---|
| physical damage/secure installation | Aircraft preflight | Post-Flight asks only for **new** damage/abnormal condition |
| payload configuration | Mission configuration row | spray/spread module performs only physical/function checks |
| charge/battery installation | Battery & Power | not repeated in Aircraft section |
| status warnings | RTK/Positioning & Status | Post-Flight captures only new faults |
| people/obstacles/debris | Site & Mission | not repeated in Aircraft physical section |
| Fleet due/serviceability | Fleet authority projected into Mission readiness | Checklist never recalculates it |
| cleaning | immediate unsafe residue in Post-Flight; storage/end-of-day clean in End-of-Day | organisation chemical procedure remains separate |
| operational records | End-of-Day reconciliation; Mission module checks required release exists | no duplicate record-entry form |

## S. Remaining source gaps

1. T100 catalogue metadata conflict: English manual identity resolves to 6 Nov 2025, but one Agriculture catalogue result displays 2 Jul 2026. Monitor and hash any genuinely different English file before publication.
2. T100 dual-battery spray configuration has not received item-level content review.
3. Relay/cellular configuration checks are not proposed until exact operational applicability is reviewed.
4. State/territory chemical application law, product-label controls and environmental obligations require separate jurisdiction research.
5. Organisation cleaning, chemical handling and local field procedures require organisation ownership.
6. No manufacturer basis supports automatic daily reuse of the full physical preflight.

## T. Founder decision table

| Proposed module | Decision classification | Exact reason |
|---|---|---|
| DJI Agras General Aircraft v1 | READY TO APPROVE | common source-backed physical outcomes; wording needs operator confirmation only |
| DJI Agras Propulsion v1 | READY TO APPROVE | direct pre-flight/maintenance evidence across reviewed models |
| Battery & Power v1 | READY TO APPROVE | concise pre-use condition/install checks; maintenance scheduling excluded |
| RC / Communications v1 | NEEDS FOUNDER OPERATIONAL EDIT | decide whether control-response check is a separate tap and whether relay use belongs in v1 |
| RTK / Positioning v1 | READY TO APPROVE | conditional RTK/compass design prevents false N/A use |
| Spray System v1 | NEEDS FOUNDER OPERATIONAL EDIT | confirm practical grouping of leaks, blockage, atomisation and calibration trigger |
| Spread System — T100 v1 | READY TO APPROVE | model-family primary product information now supports exact pre-use checks |
| Spread System — T50 v1 | READY TO APPROVE | existing exact T50 product guide |
| Spread System — T25P v1 | READY TO APPROVE | exact T25P product information now reviewed |
| Spread System — T25 v1 | READY TO APPROVE | existing exact T25 product guide |
| T100 Model Specific v1 | NEEDS FOUNDER OPERATIONAL EDIT | confirm LiDAR preflight wording; dual-battery configuration stays excluded |
| T50 Model Specific v1 | READY TO APPROVE | deliberately minimal; no invented model checks |
| T25P Model Specific v1 | READY TO APPROVE | deliberately minimal; no inferred LiDAR |
| T25 Model Specific v1 | READY TO APPROVE | deliberately minimal; no invented model checks |
| AU RPA Site & Operational v1 | NEEDS FOUNDER OPERATIONAL EDIT | Founder must confirm actual operating categories and how resolved evidence is presented |
| Spray Command Mission Readiness v1 | READY TO APPROVE | clear separation between Aircraft condition and operation readiness |
| Post-Flight v1 | READY TO APPROVE | five-item inspection/finding flow, not maintenance |
| End-of-Day v1 | NEEDS FOUNDER OPERATIONAL EDIT | confirm organisation workflow for record reconciliation and cleaning boundaries |
| Australian jurisdiction chemical modules | DEFER | separate state/territory primary-source program required |
| daily preflight evidence reuse | DEFER | manufacturer validity evidence absent |
| T100 dual-battery spray module | SOURCE GAP | exact configuration document not yet converted into reviewed items |

## Implementation effect after Founder approval

Content approval would authorise refinement of the existing plan's source-gate task and fixture-based UX design. It would not by itself authorise the composition migration, PLATFORM_SYSTEM seeds or publication. The planned slices remain valid:

1. composition authority;
2. checked preview/start;
3. fixture-only operator UX;
4. separately approved content publication;
5. separately approved Mission-readiness adoption.

## U. Recommendation

**READY FOR FOUNDER APPROVAL**

Founder approval should be item/module specific using the decision table. T100 dual-battery spray, jurisdictional chemical application, relay/cellular checks and daily evidence reuse remain outside the approvable v1 content. No content has been implemented, seeded or published.

## Source URL appendix

- T100 downloads: `https://ag.dji.com/t100/downloads`
- current DJI T100 Download Center: `https://www.dji.com/downloads/products/t100`
- T100 manual reviewed: `https://dl.djicdn.com/downloads/t70_t100/20251106/T100_User_Manual_v1.0_en.pdf`
- T100/T70 spread product information: `https://dl.djicdn.com/downloads/t70_t100/20250427/T70_Series_Spreading_System_Product_Info_multi.pdf`
- T50 downloads: `https://ag.dji.com/t50/downloads`
- T25 downloads: `https://ag.dji.com/t25/downloads`
- T50/T25 manual: `https://dl.djicdn.com/downloads/t50_t25/20250109/T50_T25_User_Manual_v1.0_EN.pdf`
- T25P downloads: `https://ag.dji.com/t25p/downloads`
- T25P manual: `https://dl.djicdn.com/downloads/t60_t25p/20260313/T25P_User_Manual_v1.0_en.pdf`
- T25P spread product information: `https://dl.djicdn.com/downloads/t60_t25p/20250715/T25P_Spreading_System_Product_Info_multi.pdf`
- CASR Part 101: `https://www.legislation.gov.au/F1998B00220/latest`
- Part 101 MOS: `https://www.legislation.gov.au/F2019L00593/latest`
- CASA weight/category guidance: `https://www.casa.gov.au/drones/operator-accreditation-certificate/drone-weight-categories-and-requirements`
- CASA ReOC guidance: `https://www.casa.gov.au/drones/remotely-piloted-aircraft-operators-certificate/get-your-reoc`
- CASA record keeping: `https://www.casa.gov.au/drones/remotely-piloted-aircraft-operators-certificate/record-keeping`
- CASA flight authorisations: `https://www.casa.gov.au/drones/flight-authorisations`
