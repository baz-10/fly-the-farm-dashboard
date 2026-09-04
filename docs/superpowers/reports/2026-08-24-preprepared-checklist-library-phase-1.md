# Preprepared Checklist Library — Phase 1 research and design package

**Status:** Proposed system content only

**Retrieved/reviewed:** 24 August 2026

**Authority baseline:** checklist authority reconciliation commit `09488b9d8cb888cd1b1e3f322927357535c5394e`

**Publication status:** not published; no runtime template, content migration, Fleet defect, or Production change is authorised by this document

## Executive decision

The approved Checklist authority is sound for immutable modules, applicability, organisation cloning, findings and frozen single-template execution. Phase 1 should add a small, checked composition aggregate so one operator execution can freeze several exact published module versions. It must not concatenate modules in the browser or silently copy their items into a new authority.

The proposed content is ready for Founder content review with one explicit source gate: DJI's T100 download catalogue lists a newer manual date than the English manual revision inspected in this research. The inspected T100 content is safe to review, but publication must re-download and compare the catalogue-current English manual before T100 v1 is approved.

## A–B. Primary research sources and source/version matrix

Only primary sources can confer `DJI_MANUFACTURER` or `CASA_REGULATORY` authority. URLs are document identities, not permission to silently ingest future revisions.

| Source ID | Organisation | Document | Model/scope | Version/date | Exact references used | Authority |
|---|---|---|---|---|---|---|
| DJI-T100-UM-1 | DJI | AGRAS T100 User Manual | T100 | v1.0, inspected English PDF dated 6 Nov 2025 | pp 34–36 compass/basic flight/pre-flight; pp 43–44 storage, maintenance and LiDAR; pp 63–64 battery storage/maintenance; pp 70–74 maintenance cycle | DJI_MANUFACTURER |
| DJI-T100-CATALOG | DJI Agriculture | T100 Downloads | T100 | catalogue retrieved 24 Aug 2026; catalogue exposes a 2 Jul 2026 manual entry | document/version discovery | DJI_MANUFACTURER source register |
| DJI-T50T25-UM-1 | DJI | AGRAS T50/T25 Unmanned Aircraft Flight Manual | T50, T25 | v1.0, 9 Jan 2025 | pp 43–44 pre-flight/start; p61 post-flight; pp 66–72 handling/maintenance; pp 94–95 battery; pp 98–100 spreading system | DJI_MANUFACTURER |
| DJI-T50-CATALOG | DJI Agriculture | T50 Downloads | T50 | retrieved 24 Aug 2026 | manual, safety, quick start, battery, spread and relay document identities | DJI_MANUFACTURER source register |
| DJI-T25-CATALOG | DJI Agriculture | T25 Downloads | T25 | retrieved 24 Aug 2026 | manual, safety, quick start, battery, spread and relay document identities | DJI_MANUFACTURER source register |
| DJI-T25P-UM-1 | DJI | AGRAS T25P User Manual | T25P | v1.0, 13 Mar 2026 | pp 32–35 compass/basic flight/pre-flight; pp 41–42 storage/maintenance; pp 61–62 battery; pp 67 onward maintenance cycle | DJI_MANUFACTURER |
| DJI-T25P-CATALOG | DJI Agriculture | T25P Downloads | T25P | manual v1.0 13 Mar 2026; release notes 1 Jul 2026; safety/quick start 15 Jul 2025 | document/version discovery | DJI_MANUFACTURER source register |
| CASR-101 | Australian Government | Civil Aviation Safety Regulations 1998, Part 101 | Australian RPA | current compilation checked 24 Aug 2026 | regs 101.237–101.285, especially 101.237, 101.238, 101.245, 101.250, 101.252, 101.270, 101.280, 101.285 | CASA_REGULATORY |
| MOS-101 | Australian Government | Part 101 (Unmanned Aircraft and Rockets) Manual of Standards 2019 | Australian RPA | latest compilation shown as F2024C00404, 30 Apr 2024 | Ch 10 records; operational release/log and technical log requirements | CASA_REGULATORY |
| CASA-WEIGHT | CASA | Drone weight categories and requirements | medium/excluded RPA | updated 11 Oct 2024 | medium RPA/private-landholder excluded category conditions | CASA_REGULATORY guidance |
| CASA-REOC | CASA | Get your ReOC | ReOC operations | retrieved 24 Aug 2026 | ReOC/RePL, operating manuals, training, registration, records | CASA_REGULATORY guidance |
| CASA-RECORDS | CASA | Record keeping | ReOC and excluded operations | updated 11 Oct 2024 | operational release/log, remote pilot and technical-log fields and retention | CASA_REGULATORY guidance |
| CASA-AIRSPACE | CASA | Flight authorisations; flying near airports | contextual | retrieved 24 Aug 2026 | controlled/restricted airspace and authorisation context | CASA_REGULATORY guidance |
| CASA-AC101 | CASA | AC 101-01 v6.1 — RPAS licensing and operations | ReOC/RPA | v6.1, 2026 | ReOC/authorisation operating context | CASA_REGULATORY guidance |

Primary discovery pages:

- DJI: `https://ag.dji.com/t100/downloads`, `https://ag.dji.com/t50/downloads`, `https://ag.dji.com/t25p/downloads`, `https://ag.dji.com/t25/downloads`
- reviewed PDFs: `https://dl.djicdn.com/downloads/t70_t100/20251106/T100_User_Manual_v1.0_en.pdf`, `https://dl.djicdn.com/downloads/t50_t25/20250109/T50_T25_User_Manual_v1.0_EN.pdf`, `https://dl.djicdn.com/downloads/t60_t25p/20260313/T25P_User_Manual_v1.0_en.pdf`
- legislation: `https://www.legislation.gov.au/F1998B00220/latest`, `https://www.legislation.gov.au/F2019L00593/latest`
- CASA: `https://www.casa.gov.au/drones/operator-accreditation-certificate/drone-weight-categories-and-requirements`, `https://www.casa.gov.au/drones/remotely-piloted-aircraft-operators-certificate/get-your-reoc`, `https://www.casa.gov.au/drones/remotely-piloted-aircraft-operators-certificate/record-keeping`, `https://www.casa.gov.au/drones/flight-authorisations`, `https://www.casa.gov.au/drones/drone-rules/flying-near-airports`, `https://www.casa.gov.au/remotely-piloted-aircraft-systems-licensing-and-operations`

### Source conflict

`DJI-T100-CATALOG` showed a T100 manual entry dated 2 July 2026, while the directly inspected English v1.0 PDF is dated 6 November 2025. No content is silently reconciled. Before publishing T100 module v1, the current English document must be acquired, hashed and compared. If its pre-flight or maintenance wording differs, Founder/human technical review is required.

## C–F. Manufacturer analysis by model

### C. T100

The T100 manual supports a concise pre-flight set covering charge state; genuine, undamaged and unobstructed components; secure installation/cabling; remote controller, compass, propulsion, radar and payload serviceability; spray blockage/leaks/sprinkler operation; prompted compass calibration; personnel/vehicle/obstacle clearance; loose task-area debris; app/flight recording; status-list warnings before each flight; and app-recommended payload limit. Its take-off procedure adds correct RTK-source selection, strong GNSS/RTK-ready state when used, linked controller, desired mode and normal control response.

T100-specific operational content is narrow:

- LiDAR optical-window condition is a T100 sensing check where fitted; end-of-day cleaning is explicitly supported.
- the app-derived payload limit is configuration/load dependent and must not be replaced with a static platform number;
- tank/sprinkler checks apply only in spray configuration;
- spread checks require the exact installed T100 spreading-system source, not inference from the aircraft manual;
- calendar/hour maintenance-cycle inspections belong to Fleet due-state, not pre-flight checklist calculations.

The manual does not support turning every named component into a separate operator checkbox. Arms, locks, landing structure, fasteners and payload mounting are represented only to the extent captured by secure mounting, damage/obstruction and maintenance-due evidence.

### D. T50

The combined T50/T25 flight manual supports the same safety outcomes but uses more explicit physical wording: tank/battery secure, cables connected, propellers secure, arms/blades unfolded, arm locks tight, vision clean, spray system unblocked and hoses free of bubbles. Start checks cover app, link, correct RTK source, adequate satellite/GNSS state and dual-antenna heading. T50 uses its own aircraft, battery, spray/spread and relay applicability; no T100 LiDAR item applies.

### E. T25P

The T25P v1.0 pre-flight checklist materially matches T100's common set. It remains a distinct model applicability because payload, sensing, battery and optional-system documents are versioned separately. No T100-only LiDAR wording is inherited without an exact T25P source. Release notes dated 1 July 2026 must be checked at publication for safety-affecting changes.

### F. T25

T25 shares the combined T50/T25 flight-manual checklist and post-flight procedure. It uses T25-specific payload limits and component/configuration identities. The common text is reusable as a shared module only when the source provenance lists the T50/T25 manual and the model applicability explicitly includes T25.

## G. Common versus model/configuration matrix

| Candidate | T100 | T50 | T25P | T25 | Classification |
|---|---:|---:|---:|---:|---|
| charge/readiness of required devices | yes | yes | yes | yes | COMMON_AGRAS |
| genuine, undamaged, unobstructed components | yes | yes | yes | yes | COMMON_AGRAS |
| secure arms/locks/payload/battery/cables | yes | yes | yes | yes | COMMON_AGRAS, wording varies |
| propulsion unobstructed/serviceable | yes | yes | yes | yes | COMMON_AGRAS |
| controller/app/link/status warnings | yes | yes | yes | yes | COMMON_AGRAS |
| GNSS/RTK source and state | yes | yes | yes | yes | COMMON_AGRAS when RTK applicable |
| spray tank, lines, leaks, blockage, atomisers | yes | yes | yes | yes | CONFIGURATION_SPECIFIC: SPRAY |
| spread installation/mechanism/settings | separate source gate | supported by model spread docs | separate source gate | supported by model spread docs | CONFIGURATION_SPECIFIC: SPREAD |
| T100 LiDAR optical window | yes | no evidence | no evidence | no evidence | T100_SPECIFIC |
| app-recommended payload limit | yes | model payload rules | yes | model payload rules | COMMON behavior, MODEL/CONFIG value |
| Site/Mission/authority/airspace checks | yes | yes | yes | yes | REGULATORY_CANDIDATE or SPRAY_COMMAND_WORKFLOW |
| organisation chemical/load/cleaning procedure | only if organisation publishes | same | same | same | ORGANISATION_STANDARD_CANDIDATE |

## H. CASA/Australian regulatory applicability

There is no truthful universal “CASA agricultural drone checklist”. Applicability must first resolve operation category, aircraft weight, owner/occupier relationship, remuneration, ReOC scope, remote-pilot authority, airspace, time of operation and any specific approval.

| Check/authority fact | Applicability class | Design outcome |
|---|---|---|
| RPA registered and exact aircraft identified | universal commercial/excluded requirement | checked identity/reference; do not ask operator to type it repeatedly |
| remote pilot has the authority required for the aircraft/operation | category dependent; medium excluded requires model-specific RePL; ReOC ops require appropriate RePL | resolve from Personnel authority; operator confirms only if authoritative integration unavailable |
| operation falls within ReOC scope or exact excluded-category conditions | ReOC/authorisation dependent | required context decision, never a universal yes/no assertion |
| VLOS, daytime, at/below 400 ft AGL | standard RPA operating conditions | required only when operating under standard conditions; a documented approval may govern otherwise |
| separation from uninvolved people; not over populous area | standard conditions/general Part 101 context | site/mission check with approval branch where legally available; no vague universal wording |
| controlled/restricted/prohibited airspace and aerodrome proximity | airspace dependent | resolve via authoritative airspace/approval evidence; fail closed if required context is missing |
| emergency/public-safety operation conflict | site/time dependent | site/mission check |
| current approval/permission and conditions | authorisation dependent | exact approval identity/effective window, not free text alone |
| operational release and serviceability record | ReOC dependent, with sole-pilot exception described by MOS | composition/applicability rule based on organisation operating category |
| operational, remote-pilot and technical logs | ReOC or medium-excluded category dependent | record integration/readiness evidence, not duplicated checklist calculations |
| chemical-use, environmental and state/territory requirements | jurisdiction/product/site dependent and outside this CASA-only evidence set | `UNRESOLVED`; separate primary-source jurisdiction work required before platform authority |

CASR 101.238 standard conditions include Australian territory, VLOS, day, at/below 400 ft AGL, people separation, airspace/aerodrome exclusions, no populous-area operation and emergency-area restrictions. A medium RPA over 25 kg and no more than 150 kg can be excluded for specified operations over owner/occupied land only under the exact conditions in reg 101.237(7), including a suitable RePL and no remuneration. ReOC operations instead depend on the certificate, manuals and any operation-specific approval. Consequently, the composer must never infer “ReOC” from aircraft model or “excluded” from agricultural purpose alone.

## I. Proposed module architecture

Initial proposed PLATFORM_SYSTEM module identities (all remain draft content):

1. `DJI_AGRAS_GENERAL_AIRCRAFT` v1
2. `DJI_AGRAS_BATTERY_POWER` v1
3. `DJI_AGRAS_RC_COMMUNICATIONS` v1
4. `DJI_AGRAS_POSITIONING_STATUS` v1
5. `DJI_AGRAS_SPRAY_SYSTEM` v1
6. `DJI_AGRAS_SPREAD_SYSTEM` v1
7. `DJI_AGRAS_T100_SPECIFIC` v1
8. `DJI_AGRAS_T50_SPECIFIC` v1
9. `DJI_AGRAS_T25P_SPECIFIC` v1
10. `DJI_AGRAS_T25_SPECIFIC` v1
11. `AU_RPA_SITE_OPERATIONAL` v1
12. `SPRAY_COMMAND_MISSION_READINESS` v1
13. `DJI_AGRAS_POST_FLIGHT` v1
14. `DJI_AGRAS_END_OF_DAY` v1

One immutable composition profile version selects ordered exact module versions. Applicability selects the profile from aircraft model, installed configuration, Mission, Base, operating category and authorisation context. Start is one server transaction that freezes the profile, every module/version/item/source reference and all resolved scope into one execution.

## J–W. Complete proposed item matrix

The matrix below is canonical. Per-model matrices are the exact filtered sets stated after it; this avoids four copies drifting. `P/D` means `PASS / DEFECT`; `P/D/N` is allowed only for genuinely optional installed capability. `CHECK` is a positive completion acknowledgement. Criticality recommends checklist handling, never automatic grounding.

| ID | Module / section | Concise field wording | Intent / acceptance | Models | Config/context | Response | N/A | Criticality | Authority | Source/ref | Confidence / finding |
|---|---|---|---|---|---|---|---:|---|---|---|---|
| GA-01 | General / structure | Airframe, arms and landing structure serviceable | No visible damage/foreign objects; required arms unfolded | all | all | P/D | no | CRITICAL | DJI_MANUFACTURER | relevant UM pre-flight | high; defect with asset note/photo |
| GA-02 | General / securing | Arm locks, battery and payload secured; cables firm | Required parts mounted and electrical connections firm | all | all | P/D | no | CRITICAL | DJI_MANUFACTURER | T100 p36; T50/T25 p43; T25P p34 | high; component/system finding |
| GA-03 | Propulsion | Motors and propellers serviceable and unobstructed | No damage, wear or foreign object; propellers secure | all | all | P/D | no | CRITICAL | DJI_MANUFACTURER | relevant UM pre-flight | high; propulsion finding |
| GA-04 | Sensing | Required vision/radar sensors clean and serviceable | Sensor surfaces unobstructed; no status error | all | installed sensors | P/D/N | yes | CRITICAL | DJI_MANUFACTURER | relevant UM pre-flight | high; N/A only when capability absent by configuration |
| GA-05 | Payload | Installed payload system recognised and serviceable | Exact spray/spread payload mounted and operating | all | installed payload | P/D | no | CRITICAL | DJI_MANUFACTURER | relevant UM pre-flight | high |
| BP-01 | Battery / charge | Aircraft and controller have adequate charge | Required devices charged for planned operation | all | all | P/D | no | CRITICAL | DJI_MANUFACTURER | relevant UM pre-flight | high |
| BP-02 | Battery / condition | Flight battery and connectors clean, dry and undamaged | No damaged battery/device; connectors acceptable | all | all | P/D | no | CRITICAL | DJI_MANUFACTURER | T100 pp63–64; T50/T25 pp94–95 | high |
| BP-03 | Battery / install | Correct battery installed and locked | Installation secure and accepted by aircraft | all | all | P/D | no | CRITICAL | DJI_MANUFACTURER | relevant UM pre-flight | high |
| RC-01 | RC / app | DJI Agras app is functioning and recording flight data | App operational; data recording available | all | all | P/D | no | CRITICAL | DJI_MANUFACTURER | T100 p36; T25P p34; T50/T25 p44 | high |
| RC-02 | RC / link | Remote controller is linked; antennas/link unobstructed | Connected with no weak-link warning before take-off | all | all | P/D | no | CRITICAL | DJI_MANUFACTURER | T100 pp36–37 and take-off; peers equivalent | high |
| RC-03 | RC / control | Stick control and aircraft response normal | Verify normal response before operation | T100,T25P | all | P/D | no | CRITICAL | DJI_MANUFACTURER | T100 take-off p36; T25P p36 | high |
| POS-01 | Status | Aircraft status list has no unresolved errors | Inspect every warning before each flight | all | all | P/D | no | CRITICAL | DJI_MANUFACTURER | T100 p37; T25P p35; T50/T25 start | high; capture safe error code |
| POS-02 | Positioning | Positioning signal is adequate for selected mode | Strong GNSS where mode requires it | all | all | P/D | no | CRITICAL | DJI_MANUFACTURER | take-off/operation-mode sections | high |
| POS-03 | RTK | RTK source and readiness match this operation | Correct source; disable if unused; ready if used | all | RTK used | P/D/N | yes | CRITICAL | DJI_MANUFACTURER | relevant UM take-off | high; N/A only when configuration says no RTK |
| POS-04 | Compass | Complete compass calibration only if prompted | App prompt satisfied; do not invent routine calibration | all | prompted only | P/D/N | yes | ATTENTION | DJI_MANUFACTURER | T100 pp34–36; T25P pp32–34 | high |
| POS-05 | RTH | Home point/failsafe settings fit the operation | Correct recorded home point and appropriate failsafe altitude | T100,T25P | mission flight | P/D | no | CRITICAL | DJI_MANUFACTURER | T100 pp40–41; T25P corresponding RTH section | medium-high |
| SP-01 | Spray / tank | Spray tank installed, secured and within app payload limit | Correct tank; cap/installation secure; never exceed recommended load | all | SPRAY | P/D | no | CRITICAL | DJI_MANUFACTURER | relevant pre-flight/take-off | high |
| SP-02 | Spray / integrity | Spray system has no leaks or blockage | Tank, pumps, lines and flow path acceptable | all | SPRAY | P/D | no | CRITICAL | DJI_MANUFACTURER | T100 p36; T25P p34; T50/T25 p43 | high; leak/blockage finding |
| SP-03 | Spray / output | Atomisers/sprinklers operate correctly | Proper output/atomisation; no poor output | all | SPRAY | P/D | no | CRITICAL | DJI_MANUFACTURER | T100 p36 and p44 maintenance; peers relevant manuals | high |
| SP-04 | Spray / hoses | Hoses/lines are connected and purged as required | For T50/T25, no bubbles before operation | T50,T25 | SPRAY | P/D | no | ATTENTION | DJI_MANUFACTURER | T50/T25 p43 | high |
| SP-05 | Spray / calibration | Flow calibration condition reviewed | Calibrate only on manual-defined trigger, not every flight | all | SPRAY and trigger exists | YES/NO/N/A | yes | ATTENTION | DJI_MANUFACTURER | model flow-meter section | high; `NO` requires reason/finding |
| SD-01 | Spread / install | Correct spreading system installed and cable secured | Exact compatible system seated; cable firm | T50,T25 | SPREAD | P/D | no | CRITICAL | DJI_MANUFACTURER | T50/T25 pp98–100 | high |
| SD-02 | Spread / mechanism | Hopper/feed/spinner unobstructed and serviceable | No foreign object/damage; moving path available | T50,T25 | SPREAD | P/D | no | CRITICAL | DJI_MANUFACTURER | spread-system manual section | medium-high |
| SD-03 | Spread / setup | Material and spreading settings match the operation | Correct material/settings/calibration evidence | T50,T25 | SPREAD | P/D | no | ATTENTION | DJI_MANUFACTURER | spread-system operation section | medium-high |
| SD-X | Spread / source gate | T100/T25P spread checks | Do not publish until exact current spread product documentation is reviewed | T100,T25P | SPREAD | — | — | — | UNRESOLVED | download catalogue only | publication blocker for those configurations |
| M100-01 | T100 / LiDAR | LiDAR optical window clean and undamaged | No contamination/damage that impairs sensing | T100 | LiDAR fitted | P/D | no | CRITICAL | DJI_MANUFACTURER | T100 p44 | high |
| M50-01 | T50 / model | T50 payload/configuration identity confirmed | Prevent use of another model's limits/config | T50 | all | CHECK | no | ATTENTION | SPRAY_COMMAND_WORKFLOW | authoritative Fleet configuration | high |
| M25P-01 | T25P / model | T25P payload/configuration identity confirmed | Prevent use of another model's limits/config | T25P | all | CHECK | no | ATTENTION | SPRAY_COMMAND_WORKFLOW | authoritative Fleet configuration | high |
| M25-01 | T25 / model | T25 payload/configuration identity confirmed | Prevent use of another model's limits/config | T25 | all | CHECK | no | ATTENTION | SPRAY_COMMAND_WORKFLOW | authoritative Fleet configuration | high |
| SO-01 | Site / category | Operating category and authority resolved | Exact ReOC/excluded/approval context present | all | Australia | P/D | no | CRITICAL | CASA_REGULATORY | CASR 101.237; CASA ReOC/weight guidance | high; no generic fallback |
| SO-02 | Site / pilot | Remote pilot authority covers aircraft and operation | Exact licence/model/category evidence current | all | category dependent | P/D | no | CRITICAL | CASA_REGULATORY | CASR 101.252; CASA guidance | high |
| SO-03 | Site / airspace | Airspace and aerodrome constraints resolved | Exact current airspace result and approval where required | all | site dependent | P/D | no | CRITICAL | CASA_REGULATORY | CASR 101.238/250; CASA airspace guidance | high |
| SO-04 | Site / people | People, property and populous-area conditions are satisfied | Required separation/exclusion or exact approval | all | site/category dependent | P/D | no | CRITICAL | CASA_REGULATORY | CASR 101.238/245/280 | high |
| SO-05 | Site / emergency | No conflicting emergency/public-safety operation | Approval recorded if an operation is present | all | site/time dependent | P/D | no | CRITICAL | CASA_REGULATORY | CASR 101.238(e) | high |
| SO-06 | Site / flight envelope | VLOS/day/height conditions or exact authorisation resolved | Standard conditions apply unless exact approval says otherwise | all | category/approval dependent | P/D | no | CRITICAL | CASA_REGULATORY | CASR 101.238 | high |
| SO-07 | Site / hazards | Task area is clear of loose debris, people, vehicles and obstacles | Establish safe launch/task area and DJI distance/helmet controls | all | all | P/D | no | CRITICAL | DJI_MANUFACTURER | relevant UM pre-flight | high |
| SO-08 | Site / chemical law | Jurisdictional chemical-use authority resolved | Placeholder only; cannot publish until state/product primary sources exist | all | jurisdiction/product dependent | — | — | — | UNRESOLVED | none in this phase | publication blocker if claimed regulatory |
| MR-01 | Mission / identity | Correct Mission, Aircraft and Base selected | Exact relational scope, no free-text identity | all | mission | CHECK | no | CRITICAL | SPRAY_COMMAND_WORKFLOW | checked repository authority | high |
| MR-02 | Mission / configuration | Installed payload and Mission application configuration agree | Spray/spread and relevant kit match Mission | all | mission | P/D | no | CRITICAL | SPRAY_COMMAND_WORKFLOW | Mission/Fleet checked reads | high |
| MR-03 | Mission / maintenance | Authoritative Fleet due/serviceability state reviewed | Display Fleet result; Checklist does not calculate it | all | mission | P/D | no | CRITICAL | SPRAY_COMMAND_WORKFLOW | Fleet due-state authority | high; link exact source |
| MR-04 | Mission / operational records | Required operational release/records are present | Applicability follows ReOC/excluded context | all | context dependent | P/D/N | yes | CRITICAL | CASA_REGULATORY | MOS Ch10/CASA record keeping | high |
| PF-01 | Post-flight / safe state | Aircraft powered off and battery removed/stored | Establish safe post-flight state | all | after operation | P/D | no | CRITICAL | DJI_MANUFACTURER | T50/T25 p61; common supported in product manuals | high |
| PF-02 | Post-flight / inspection | Aircraft structure and propulsion inspected for new damage | Dirt removed enough to inspect; loose/damaged parts become findings | all | after operation | P/D | no | ATTENTION | DJI_MANUFACTURER | T50/T25 p61; T100 maintenance | high |
| PF-03 | Post-flight / payload | Payload system has no unsafe residue/leak/damage | Spray/spread path condition reviewed; cleaning follows approved procedure | all | installed payload | P/D | no | ATTENTION | DJI_MANUFACTURER | T50/T25 p61/ground handling; T100 p43 | high |
| PF-04 | Post-flight / connector | Aircraft battery connector clean and dry | No contamination/moisture/damage | T50,T25 | all | P/D | no | ATTENTION | DJI_MANUFACTURER | T50/T25 p61 | high |
| PF-05 | Post-flight / faults | New warnings/faults/findings recorded | Preserve code/note/photo and exact asset context | all | after operation | P/D | no | ATTENTION | SPRAY_COMMAND_WORKFLOW | checklist finding authority | high |
| ED-01 | End-of-day / LiDAR | T100 LiDAR window cleaned using approved method | At normal temperature; clean without chemical/tank liquid | T100 | spraying day | P/D | no | ATTENTION | DJI_MANUFACTURER | T100 p44 | high |
| ED-02 | End-of-day / clean/dry | Aircraft and payload system clean, dry and empty as required | No residual liquid in tank/flow meter/pumps/hoses for storage | T100 | storage/end of day | P/D | no | ATTENTION | DJI_MANUFACTURER | T100 p43 | high |
| ED-03 | End-of-day / records | Required operational and technical records reconciled | Confirm authoritative records; do not duplicate their data | all | category dependent | P/D/N | yes | ATTENTION | CASA_REGULATORY | MOS Ch10/CASA record keeping | high |
| ED-04 | End-of-day / findings | Open checklist findings handed off or explicitly pending | Remains `DEFECT_HANDOFF_PENDING`; no Fleet defect fabricated | all | findings exist | P/D/N | yes | ATTENTION | SPRAY_COMMAND_WORKFLOW | checklist finding authority | high |

### J. T100 exact composition

Pre-flight: GA-01–05, BP-01–03, RC-01–03, POS-01–05, M100-01, SO-01–07, MR-01–04, plus SP-01–03/05 for spray. Spread is blocked by SD-X until its exact source is approved. Post-flight: PF-01–03, PF-05. End-of-day: ED-01–04 as applicable.

### K. T50 exact composition

Pre-flight: GA-01–05, BP-01–03, RC-01–02, POS-01–04, M50-01, SO-01–07, MR-01–04; add SP-01–05 for spray or SD-01–03 for spread. Post-flight: PF-01–05. End-of-day: ED-03–04 plus organisation-published cleaning procedures; no T100 LiDAR item.

### L. T25P exact composition

Pre-flight: GA-01–05, BP-01–03, RC-01–03, POS-01–05, M25P-01, SO-01–07, MR-01–04, plus SP-01–03/05 for spray. Spread is blocked by SD-X. Post-flight: PF-01–03 and PF-05. End-of-day: ED-03–04 plus source-approved model cleaning; no T100 LiDAR item.

### M. T25 exact composition

Pre-flight: GA-01–05, BP-01–03, RC-01–02, POS-01–04, M25-01, SO-01–07, MR-01–04; add SP-01–05 for spray or SD-01–03 for spread. Post-flight: PF-01–05. End-of-day: ED-03–04 plus organisation-published cleaning procedures.

### N–V. Reusable module decisions

- **Spray:** SP-01–05; configuration mandatory, no N/A escape.
- **Spread:** SD-01–03 only for T50/T25 v1. T100/T25P publication waits for exact source review.
- **Battery & Power:** BP-01–03; no maintenance-life calculation.
- **RC/Communications:** RC-01–03; RC-03 limited by source applicability.
- **RTK/Positioning:** POS-01–05; RTK item N/A only when authoritative configuration says RTK unused.
- **Site & Operational:** SO-01–07; composed from explicit operation context, not universally applied text.
- **Mission Readiness:** MR-01–04; exact relational evidence and read-only Fleet due-state.
- **Post-Flight:** PF-01–05; immediate inspection/safe-state/finding capture.
- **End-of-Day:** ED-01–04; one-per-operational-day closeout. Organisation chemical cleaning remains organisation authority.

Every row's authority is explicit in the matrix. No workflow or organisation item is relabelled as DJI/CASA.

## X. Unresolved evidence and questions

1. Acquire and diff the T100 catalogue-current English manual against `DJI-T100-UM-1`.
2. Review exact current T100 and T25P spreading-system manuals before those spread configurations can publish.
3. Confirm whether T50/T25 manuals provide a source-supported RC control-response check equivalent to T100/T25P; v1 omits it rather than inferring.
4. Complete state/territory agricultural-chemical, label, environmental and recordkeeping research as a separate jurisdiction matrix; CASA evidence is insufficient for chemical-use authority.
5. Founder must choose which actual Fly The Farm operating categories/procedures become organisation templates. Platform content must not assume ReOC or excluded category.
6. Human technical review is required for concise wording that combines multiple manual bullets and for any proposed pre-flight evidence reuse.

## Y–Z. Daily versus Mission validity and invalidating events

### Recommended v1 validity

- **Manufacturer physical pre-flight:** one exact Aircraft + exact installed configuration + one flight attempt. DJI explicitly requires status warnings before each flight and does not authorize a blanket daily substitution. No automatic reuse in v1.
- **Site/Mission:** exact Mission, site, time window, operation category and approval set. Must run for each Mission or material Mission revision.
- **Post-flight:** exact flight/operation completion; never reusable.
- **End-of-day:** exact Aircraft, Base and Australian operational date; once after the final operation, not a readiness substitute.
- **Authoritative reference evidence:** Fleet serviceability, registration, licence or approval may be projected into several executions while its own source remains current, but the checklist records the exact evidence identity/version/time it relied on.

### Invalidating events

Even if a later approved version permits bounded reuse, invalidate on Aircraft change, Mission/site change, organisation/Base/session change, payload/configuration change, battery swap where the battery check is scoped to an exact battery, maintenance/repair, impact/abnormal landing, warning/fault/significant finding, weather/airspace/approval change, loss/recovery of link or positioning that changes readiness, source evidence expiry, or validity-window expiry. The server evaluates these facts; the browser cannot assert “still valid”.

## AA. Illustrative field UX

`T100-002 — PREFLIGHT` is one execution, not seven launches.

| Collapsed section | Progress | Operator affordance |
|---|---:|---|
| Aircraft & propulsion | 5/5 complete | tap to review; finding badge if present |
| Spray system | 4/4 complete | visible only for spray configuration |
| Battery & power | 3/3 complete | exact aircraft context shown |
| Controller & positioning | 7/8 | first incomplete item opens |
| Site & Mission | 5/7 | approval/evidence links, not long repeated text |

Sticky footer: `2 required remaining`; Complete remains disabled. Fast-path taps record PASS/CHECK; DEFECT opens a compact note/photo/evidence sheet and exact asset/system/position context. Source and detailed guidance are one disclosure level deeper. Phone uses one section at a time; tablet/desktop may show section rail plus item pane.

## AB–AC. System versions, applicability and composition

### Version structure

- immutable `checklist_template_versions` remain module authority;
- each proposed module starts at v1 only after content approval;
- each item has a stable item key, response schema, N/A rule, criticality, authority class and exact source locator;
- a source revision produces a reviewed module v2; no in-place edits;
- an immutable composition-profile version lists ordered exact module-version IDs and inclusion predicates;
- an execution snapshot records profile/version, every module/version/item/source hash, resolved predicates and context.

### Composition command

`ftf_compose_and_start_checklist` should, under one transaction:

1. resolve organisation, Base, actor and exact Aircraft;
2. resolve authoritative manufacturer/model/configuration and Mission relation;
3. resolve operation-category and approval facts supplied through checked identities;
4. select one effective profile version and exact compatible module versions;
5. reject missing, ambiguous, duplicate or contradictory modules/items;
6. materialise an ordered frozen snapshot and one execution;
7. return decoded execution data without generic table access.

Server predicates cover exact model, configuration, Base, Mission/lifecycle and contextual regulatory branch. PLATFORM_SYSTEM applicability never silently becomes Mission-blocking; the organisation must publish/clone an exact requirement under the accepted readiness rules.

## AD. Organisation inheritance and updates

Organisations discover published system modules/profile versions read-only. A clone cites the exact system module version and exact source item identities. Organisation additions are separately classified; an inherited DJI/CASA item can retain that authority only while its governed content and source identity match exactly. A newer system version displays `update available`; it never rewrites an organisation version or any started/completed execution. Adoption creates a new organisation version/profile following normal approval.

## AE–AF. Mission readiness and findings

Mission readiness uses the existing exact organisation/Base/Mission/Aircraft applicability projector. It may require the organisation's composed pre-flight execution only when an approved organisation version is marked readiness-required and all relational deployment facts exist. Fleet due-state is referenced, never recomputed.

A DEFECT response creates an immutable Checklist finding with execution, item, Aircraft and optional system/position context, safe note/evidence and status `DEFECT_HANDOFF_PENDING`. Checklist criticality can block its own completion when configured, but cannot ground an aircraft or create a maintenance defect. No unrelated Mission is blocked.

## AG. Separately governed future Fleet slice

Minimum future capability: a checked command that accepts one unresolved Checklist finding, locks it, validates the same organisation and exact asset/system/position, creates one Fleet defect with provenance, links both identities, emits audit/outbox, and advances the finding from `DEFECT_HANDOFF_PENDING` exactly once. Fleet alone governs defect assessment, rectification, availability/grounding and return to service. This slice is not implemented or authorised here.

## AH–AJ. Schema, commands and permissions

### Minimal additive schema later required

The current single-version execution snapshot cannot truthfully represent multi-module composition. A future migration should add only:

- `checklist_composition_profiles` (authority plane and stable identity);
- `checklist_composition_profile_versions` (immutable status/effective/version/provenance);
- `checklist_composition_profile_modules` (ordered exact module-version links plus bounded inclusion predicate);
- nullable composition-profile/version identity on execution, with a check that composed snapshots enumerate exact modules/items.

No generic content catalogue, duplicate execution table or Fleet defect table is needed. Source documents can initially be governed inside the immutable module-version provenance if strict validation covers organisation, title, version/date, URL/document identity, retrieval date, locator and authority class. A dedicated source table is optional only if review proves cross-module source lifecycle cannot be governed without it.

### Trusted API/commands

- list applicable library profiles/modules (checked read);
- preview effective composition (non-mutating, exact resolved facts and exclusions);
- create/publish/retire PLATFORM_SYSTEM profile version (platform actor only);
- clone/adopt profile/module into organisation authority;
- compose-and-start one execution;
- read update availability;
- existing complete/finding reads remain authoritative.

### Permissions

Add bounded permissions such as `checklist.library.read`, `checklist.composition.preview`, `checklist.composition.execute`, and platform-only `checklist.system.publish`. Customer roles receive no system mutation. Organisation publication uses existing explicit authority. Browser roles and `service_role` receive no direct generic table access; checked RPCs enforce organisation/Base/personnel scope. Composition does not broaden Fleet, Mission, audit or outbox authority.

## AK. Product Maturity requirements

Financial/Product Maturity promotion is out of scope. When implementation is approved, governance must register the new tables/RPC/routes, ownership, permission matrix, audit/outbox events, decoding boundary and responsive/accessibility tests. The capability remains non-effective until system content is Founder-approved and separately published.

## AL–AM. Bounded test-first implementation plan

### Slice 1 — composition authority (future migration)

RED tests first: immutable profile versions; ordered exact modules; no DRAFT/retired module; model/config predicate validation; platform/customer mutation separation; direct-role denial; duplicate item rejection; atomic one-execution snapshot. Implement the four narrow schema additions and checked platform/organisation commands.

### Slice 2 — preview/start server contracts

RED tests: T100/T50/T25P/T25; spray versus spread; exact Aircraft/Base/Mission; missing/ambiguous context; ReOC versus excluded branch; no generic regulatory checklist; started-instance freeze; source provenance; update available. Implement preview and transactional compose/start with strict recursive server/browser decoding.

### Slice 3 — operator UX without content publication

Use non-authoritative fixtures. Test section progress, smallest truthful responses, N/A gating, single execution, one finding, phone/tablet/desktop, Chromium/WebKit, keyboard/touch/accessibility, refresh and concurrent version publication. No seed migration.

### Slice 4 — reviewed system content publication (separate Founder approval)

Only after the matrix/source gates are approved: create exact seed data, hash fixtures, publication/review evidence and regression. Prove model/config composition, source version identities, organisation clone/update, completed/started freeze, no fabricated Fleet defect, no automatic grounding and no unrelated Mission blocking. Publishing PLATFORM_SYSTEM templates requires its own approval.

### Complete verification set

Focused SQL/security/command tests; composition/property tests; all response/N/A validation; source tamper tests; system immutability; organisation inheritance; Mission-readiness exactness; audit/outbox; deterministic regression; Product Maturity zero violations; production build; Chromium/WebKit at phone/tablet/desktop; independent authority/security and human technical content review.

## AN. Recommendation

**READY FOR FOUNDER CONTENT REVIEW**

This recommendation approves review of the proposed matrix and narrow implementation design only. T100 current-manual reconciliation, T100/T25P spread sources and Australian chemical-jurisdiction content remain explicit publication gates. No authoritative checklist content has been implemented or published.
