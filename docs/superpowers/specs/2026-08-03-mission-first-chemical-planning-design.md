# Mission-first Chemical Planning and Intelligence Review Design

**Status:** Product Owner approved 2026-08-03  
**Requirements:** IMP-MIS-004, NEW-CHE-001, IMP-CHE-002

## Objective

Make chemical selection and calculation operational inside the existing Mission planner while automatically turning unmatched operational entries into platform Chemical Intelligence research work. Operators record reality first; catalogue maturity never blocks planning or calculation.

## Data domains

### Mission Chemical Evidence

Organisation-owned, immutable, versioned historical evidence. It stores exactly what the operator entered or selected, including the displayed product description, manufacturer, APVMA number if supplied, active ingredient if supplied, formulation if supplied, rate, unit, application volume, treatment area, totals, batch assumptions, match state and register/intelligence references as they existed at creation. Later matching, approval, renaming or label changes never rewrite a Mission revision.

### Organisation Chemical Register

Organisation-owned favourites, presets and preferred products. Entries may reference versioned Platform Chemical Intelligence but do not own regulatory truth. Register configuration is tenant isolated and may be operating-location scoped where required.

### Platform Chemical Intelligence

Platform-owned, versioned verified knowledge containing APVMA identity, labels, SDS, active ingredients, formulations, mode of action, weeds, plant species, rates, aerial-use guidance, jurisdictions, restrictions and provenance. Publishing requires platform Chemical Approver permission.

## Mission workflow

The existing Mission screen provides register/intelligence search plus unrestricted product entry. Each plan contains one or more chemical lines and server-authoritative calculations for total spray volume, product quantity, water requirement, hectares per batch, product per batch and batch count. Save creates an immutable plan revision, audit event and transactional outbox event. Refresh, re-login and authorised second sessions reopen the same evidence without local-storage fallback.

Verified selections store a snapshot plus stable intelligence/version references. Free entries remain exactly as typed. No match is silently selected or merged.

## Unmatched products

Every unmatched line automatically creates or links a Chemical Intelligence Review in the same transaction as the Mission chemical revision. Planning and calculations continue. The operator receives a clear non-blocking notice. Duplicate prevention uses normalised product name, manufacturer, APVMA number, active ingredient and formulation; likely spelling variants are suggestions only.

## Research and approval

Review lifecycle:

`NEW → INVESTIGATING → READY_FOR_APPROVAL → APPROVED | DUPLICATE | REJECTED`

`RETURNED_FOR_RESEARCH` returns work to researchers without losing history.

- Chemical Researchers, initially Clare and her team, may research, collect internal-file evidence, attach labels/SDS, verify APVMA/formulation/ingredients/aerial use/jurisdictions, prepare a recommendation and mark Ready for Approval.
- Researchers can never publish and cannot grant themselves approval rights.
- Chemical Approvers may approve, return, merge duplicates or reject. Ben is the sole Production Beta member assigned this permission; names are never hard-coded.
- Only approval publishes or links a versioned Platform Chemical Intelligence record.
- Every transition, evidence item, recommendation and decision is append-only history with audit and outbox events.

Clare’s queue contains active research work. Ben’s queue contains only Ready for Approval reviews.

## Mission authorisation boundary

Unmatched products never block planning or calculations. Mission Authorisation displays a prominent warning and requires the operator to acknowledge: “This Mission contains one or more chemicals that are not yet present in the verified Spray Command Chemical Intelligence library.” The acknowledgement is recorded and authorisation continues. It is an intelligence-quality warning, not a regulatory statement.

## API, permissions and isolation

Versioned `/api/v1` routes delegate to application/repository services for Mission chemical plans, search, organisation register and platform reviews. Server authorisation and PostgreSQL RLS enforce tenant/location boundaries. Platform intelligence and review permissions are separate from organisation operational permissions. Repository-controlled migrations own tables, constraints, RLS, functions, triggers and grants.

Production Beta permissions include:

- `mission.chemicals.read`
- `mission.chemicals.plan`
- `chemical.register.read`
- `chemical.register.manage`
- `chemical.review.research`
- `chemical.review.approve`

## Failure behaviour

Invalid rates, quantities, units, area, application volume, tank size or concurrency versions fail visibly and atomically. A failed save creates no revision, review, audit or outbox row. Search or matching failure never substitutes browser storage. Unavailable intelligence does not prevent explicit unmatched entry.

## Acceptance criteria

1. A real deployed Mission contains one verified and one unmatched chemical.
2. Both lines calculate server-authoritative totals and batches.
3. The plan persists through refresh, re-login and a second authorised session.
4. The unmatched line automatically creates exactly one review and displays a non-blocking notice.
5. Clare’s research queue and Ben’s approval queue reflect lifecycle state and permissions.
6. Ben can approve after research; Clare cannot approve.
7. Approval makes the verified product available for future searches without modifying the historical Mission evidence.
8. Suggested duplicates never merge without Ben’s decision.
9. Concurrency, tenant/location isolation, RLS, audit, outbox and no-local-fallback checks pass.

## Out of scope

Mission Authorisation implementation, full regulatory interpretation, automated APVMA ingestion, international packs and a standalone chemical application are not part of this package. The data and acknowledgement contract remain ready for the subsequent Authorisation package.
