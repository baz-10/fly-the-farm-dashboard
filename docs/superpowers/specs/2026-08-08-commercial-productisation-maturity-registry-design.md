# Spray Command Commercial Productisation and Product Maturity Registry Design

**Status:** Product Owner approved with refinements on 8 August 2026  
**Programme:** Gate 1 — Private Commercial Beta, followed by Gate 2 — Paid General Commercial Release  
**Canonical product:** Spray Command

## 1. Purpose

Spray Command is moving from an internally proven operational platform into a standalone commercial product. This programme productises the current application without rebuilding working systems, changing its established operational hierarchy, or inventing unapproved branding, pricing, legal language or manufacturer integrations.

The Product Maturity Registry is the repository-controlled source of truth for engineering and commercial confidence. It classifies every reachable module and material workflow while preserving one stable product structure.

The registry is separate from:

- permissions;
- subscriptions;
- entitlements;
- tenancy;
- feature flags; and
- customer configuration.

Maturity communicates readiness. It never grants access.

## 2. Maturity model

### 2.1 `COMMERCIALLY_READY`

The capability is operationally proven, customer validated, supportable and ready for broad commercial release. It has no maturity badge in the primary user interface.

Promotion requires:

- operational use by external customers;
- complete end-to-end acceptance;
- demonstrated production reliability;
- no unresolved P0 issue;
- complete productisation;
- support readiness; and
- Founder approval.

### 2.2 `OPERATIONALLY_READY`

The capability is technically complete, authoritative, supported and safe for production use. It is suitable for Gate 1 but does not yet claim broad commercial validation.

Operational readiness may appear in detailed maturity information and internal release reporting. It does not add a persistent badge to primary navigation. This keeps the product calm while accurately distinguishing operational proof from commercial proof.

### 2.3 `BETA`

The capability is safe, supported, operationally usable and actively improving through Private Commercial Beta feedback. Beta never means experimental, unfinished or unsafe.

The UI displays a small, unobtrusive `Beta` badge in the relevant navigation item and module header. Its tooltip is:

> This feature is available during Private Commercial Beta and is still being refined.

Promotion to Operationally Ready requires implementation completion, authoritative persistence where the workflow creates business evidence, automated tests, deployment and Product Owner acceptance.

### 2.4 `COMING_SOON`

The capability remains represented in the stable product structure but is not yet safe or reliable for external use. The product disables or constrains it only where exposure would cause unsafe operation, incorrect commercial expectations, unreliable persistence, regulatory risk or significant data-loss risk.

Customers see `Coming Soon` or `Available in a future release`. Customer-facing copy never uses `Legacy`. Internal engineering evidence may retain legacy terminology where it accurately identifies source code or migration boundaries.

## 3. Registry architecture

The registry is a typed, repository-controlled manifest. It has no database table and no tenant-configurable state. A central selector exposes module and workflow maturity to navigation, route surfaces, module headers, automated tests and release reporting.

Each entry contains:

- stable module code;
- stable workflow code;
- customer-facing module and workflow names;
- current maturity;
- accountable owner;
- programme priority (`P0`, `P1`, `P2` or `P3`);
- promotion blockers;
- evidence supporting the current state;
- required automated tests;
- required manual acceptance;
- required operational evidence;
- target promotion milestone;
- review date; and
- changelog reference.

Module status is the default. Workflow entries provide more precise exceptions. For example, Quotes can have a module-level state while PDF export, margin analysis and invoice export have independent workflow states.

The application must fail closed when a referenced registry code is missing or invalid. A route must never silently appear Production Ready because metadata is absent.

## 4. Stable navigation and presentation

The existing information architecture remains stable. Major navigation destinations are not removed merely because productisation work remains.

- Commercially Ready: no badge.
- Operationally Ready: no primary-navigation badge; available in maturity details and release evidence.
- Beta: subtle Beta badge in navigation and module header.
- Coming Soon: destination remains discoverable and opens a polished, plain-language availability workspace when the underlying workflow would be unsafe or misleading.

The maturity layer must preserve SC-012 Premium Simplicity. It reassures rather than advertises engineering debt. Technical blocker descriptions belong in internal governance views and repository reports, not customer-facing explanations.

Permissions are evaluated independently. A user who lacks permission does not gain route visibility because a feature is mature. A user who has permission does not bypass a Coming Soon safety constraint.

## 5. Current classification baseline

The following baseline is derived from the current `codex/production-beta` repository and replaces the older pre-authoritative product inventory where the two conflict.

### 5.1 Operationally Ready

- Authentication: login, logout, session handling, recovery and reset.
- Platform Identity and Organisation Assisted Support.
- Clients.
- Properties and confirmed locations.
- Fields and authoritative boundaries.
- Jobs and Job history.
- Mission Register and resumable Mission setup drafts.
- Mission Workspace from Planning through Customer Outcome.
- Mission mapping and operational KML evidence.
- Planning and observed Mission Weather evidence.
- Mission chemical planning.
- Mission JSA, triggered controls, readiness and authorisation.
- Operational Closeout and Mission Completion.
- Mission Outcomes and Customer Outcome.
- Mission Pack, Mission Summary and Mission Record.
- Aircraft.
- Equipment Kits and compatibility.
- Personnel and identity linking.
- CASA Compliance Overview, Health and Calendar.
- Organisation branding.
- Organisation Assisted Support requests and sessions.
- Platform chemical review permissions and separation of duties.

These capabilities are safe for Gate 1. They remain Operationally Ready rather than Commercially Ready until external beta evidence and Founder approval satisfy the commercial promotion gate.

### 5.2 Beta

| Module or workflow | Promotion blockers |
|---|---|
| Self-service organisation onboarding | Complete non-Founder organisation provisioning, invitation lifecycle, initial-admin flow, first-use setup and E2E recovery acceptance. |
| Home / Operations Brief | Add provider-failure observability, explicit degraded weather behaviour and remove browser-local quote/financial inputs. |
| Customer portal access | Add dedicated hostile-access E2E coverage, confirm the supported customer workflow and complete privacy acceptance. |
| Spray Recommendation import | Publish the supported-format contract, preserve import provenance, add hostile-file tests and complete broader genuine-file acceptance. |
| Personnel CASA credentials | Complete genuine multi-operator use, renewal notification reliability and credential lifecycle acceptance. |
| Fleet deployment assets and Work Packs | Strengthen version and concurrency behaviour, relational integrity and E2E coverage beyond the generic JSON aggregate. |
| Weather Centre | Establish provider timeout, retry and degradation contracts, monitoring and field-device reliability evidence. |
| Chemical Database and search | Add chemical-authority wording, provider contract tests, durable saved-product persistence and governed knowledge provenance. |
| Spray Calculator | Add repository-controlled calculation versions, durable handoff provenance and chemical-authority disclaimers. |
| ReOC and Operating Authority Register | Complete genuine multi-file upload acceptance, recovery verification and external operational-use evidence. |
| Operations Manual workspace | Complete genuine controlled-document publication, supersession and external lifecycle acceptance. |
| Controlled Checklist Builder and execution | Complete genuine template use, Mission execution evidence and corrective-action acceptance. |
| Vegetation / PMAV checks | Add provider resilience, authoritative source/version retention and genuine multi-property acceptance. |

### 5.3 Coming Soon

| Internal engineering module | Customer-facing destination | Promotion blockers |
|---|---|---|
| Legacy Flight Compliance | Flight Records | Browser-local authority, unreliable actor attribution and duplication of authoritative flight evidence. |
| Legacy Chemical Compliance | Application Records | Browser-local authority, regulatory wording governance and duplication of Mission chemical evidence. |
| Legacy Transport Compliance | Transport and Storage | Browser-local authority, regulatory versioning and authoritative retention. |
| Legacy Licensing | Licences and Credentials | Browser-local authority and duplication of authoritative Personnel credentials. |
| Legacy Environmental Compliance | Environmental Records | Browser-local authority, evidence provenance and regulatory wording governance. |
| Legacy Safety/PPE | Safety and PPE | Browser-local authority and duplication of authoritative JSA and checklist controls. |
| Legacy Documentation/Audit | Documentation and Audit | Browser-local authority and misleading audit/compliance implications. |
| Quotes | Quotes | Quotes, pricing configuration and quote equipment models remain browser-local authoritative records. |
| Financial Actuals and Margin Analysis | Financials | Financial records remain browser-local with no server-side tenancy, concurrency or audit. |
| Legacy Ask FTF | Operational Intelligence | Browser-local reports plus unresolved AI authority, privacy and observability boundaries. |
| Legacy Organisation Network/source tools | Organisation Administration | Browser-local stores, Fly The Farm presentation and mixed organisation/platform responsibilities. |
| Chemical source, extraction and document ingestion tools | Chemical Intelligence | Browser-local research stores and an incomplete governed publication lifecycle. |

## 6. Gate 1 priority order

The approved P0/P1 sequence is:

1. Commercial onboarding.
2. Browser-local Quotes and Financials.
3. Browser-local compliance workflows.
4. Chemical authority and provenance.
5. Provider resilience and field reliability.
6. Operational evidence gathered from beta customers.

This sequence takes precedence over P3 feature work. It does not authorise speculative billing, branding, legal wording or manufacturer integration decisions.

## 7. Promotion governance

Every promotion is an explicit repository change with evidence. Coding completion alone cannot establish commercial readiness.

Promotion changes must include:

1. registry entry update;
2. linked changelog reference;
3. automated acceptance evidence;
4. deployment evidence;
5. required Product Owner acceptance;
6. required operational evidence; and
7. Founder approval for Commercially Ready.

Pull-request and CI checks must verify:

- every reachable top-level module has a registry entry;
- every maturity value is valid;
- every non-commercial entry has promotion blockers;
- every Coming Soon route has customer-safe constrained behaviour;
- every Beta surface uses the standard badge and tooltip;
- no customer-facing string contains `Legacy`; and
- maturity metadata never changes permission, entitlement or tenant enforcement.

## 8. Gate 1 programme boundaries

The registry implementation is the first bounded productisation slice. It provides truthful product communication and the evidence ledger used to govern later promotion work. It does not itself make browser-local workflows authoritative.

Subsequent slices follow the approved priority order and receive separate specifications and test-first implementation plans:

1. Commercial onboarding.
2. Quotes and Financials productisation.
3. Compliance workflow consolidation and productisation.
4. Chemical authority and provenance.
5. Provider resilience, observability and field reliability.
6. Beta evidence, metrics and the Gate 1 readiness report.

Each slice improves the current architecture in place. Working authoritative systems remain intact.

## 9. Error and safety behaviour

- Missing registry metadata fails closed and is reported in development and CI.
- Coming Soon routes never write browser-local business evidence for external Gate 1 users.
- Registry failures never weaken route guards, RLS, tenant filtering or support-session scope.
- Customer-facing messages explain availability and the supported alternative without exposing engineering internals.
- Internal reports retain exact blocker evidence and source references.

## 10. Testing and acceptance

The registry slice requires:

- schema/type tests for every registry field;
- completeness tests covering all reachable modules and declared workflow exceptions;
- navigation tests for Commercially Ready, Operationally Ready, Beta and Coming Soon presentation;
- route tests proving Coming Soon constraints fail safely;
- permission tests proving maturity does not grant access;
- tenant tests proving maturity does not affect isolation;
- accessibility tests for badges, tooltips and disabled/constrained destinations;
- responsive tests for desktop, tablet and mobile navigation;
- production build;
- unattended Production Beta operational acceptance; and
- Product Owner visual acceptance.

No synthetic operational or compliance records are created to improve maturity evidence.

## 11. Gate 1 readiness reporting

The future Gate 1 Readiness Report consumes registry evidence but remains a separate release artefact. Every Gate 1 requirement is reported as `PASS`, `CONDITIONAL_PASS`, `FAIL` or `NOT_APPLICABLE`. Any unresolved P0 security, tenancy, authentication or data-integrity failure forces `NO_GO`.

The registry must never claim legal certification, market validation, manufacturer integration, willingness to pay or broad commercial readiness without evidence and the required authority.
