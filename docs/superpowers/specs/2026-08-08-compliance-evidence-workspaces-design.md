# Compliance Evidence Workspaces Design

## Decision

ReOC certificate management and Operations Manual publishing become dedicated CASA Compliance workspaces. They no longer open inline at the bottom of the CASA Compliance Overview.

## Purpose

Each workspace answers one operational question:

- ReOC: “What evidence proves the organisation’s current operating authority?”
- Operations Manual: “Which approved Operations Manual version currently governs operations?”

These are material compliance records with evidence, dates, revision history and validation. A dedicated page makes the active task obvious and provides room for its authoritative history.

## Routes and Navigation

- `/compliance/reoc` — ReOC certificate workspace.
- `/compliance/operations-manual` — Operations Manual workspace.
- **Upload ReOC** and **Manage ReOC certificate** navigate to `/compliance/reoc`.
- **Publish Operations Manual** navigates to `/compliance/operations-manual`.
- Each workspace provides visible back navigation to `/compliance`.
- Existing navigation permissions and tenant boundaries remain unchanged.

## ReOC Workspace

The page presents, in order:

1. Page title and plain-language current status.
2. Current authoritative ReOC details and evidence, when present.
3. Missing, expired or incomplete evidence explanation, when applicable.
4. The create or replacement form with ReOC number, issue date, expiry date, legal certificate holder, organisation ARN, conditions and certificate file.
5. Existing immutable version history, when returned by the authoritative API.

The primary action is **Save ReOC certificate**. Required fields and file requirements remain enforced. A successful save refreshes the page from the authoritative API and shows the persisted record.

## Operations Manual Workspace

The page presents, in order:

1. Page title and plain-language publication status.
2. Current authoritative Operations Manual version and evidence, when present.
3. Missing or review-due explanation, when applicable.
4. The publication form with document title, effective date, review due date and approved PDF.
5. Existing immutable version history, when returned by the authoritative API.

The primary action is **Publish Operations Manual**. Publishing creates a protected version and never rewrites earlier versions or Mission evidence. A successful publication refreshes the page from the authoritative API and shows the persisted version.

## CASA Compliance Overview

The overview remains a daily compliance briefing. It shows status, why the issue matters and the next action, but does not contain either upload form.

Its primary buttons navigate immediately to the relevant dedicated workspace. Technical scoring and source provenance remain available through the existing secondary disclosures.

## Authoritative Behaviour

The change is presentation and routing only. It reuses the existing compliance API commands and read model.

It does not change:

- PostgreSQL persistence;
- immutable evidence and document versions;
- audit or transactional outbox behaviour;
- RLS, tenant or operating-location enforcement;
- permissions;
- file IDs, checksums or provenance;
- compliance scoring or calendar projections.

No browser or legacy persistence is introduced.

## Errors and Accessibility

- Loading, validation and server errors appear on the active workspace where the operator can resolve them.
- Entered metadata and the selected file remain available after a recoverable validation failure where browser security permits.
- Missing permissions fail closed with a clear page-level message.
- Page headings, labels, validation messages, keyboard order and focus behaviour remain accessible.
- Responsive layouts keep the form and primary action visible on desktop, tablet and mobile.

## Acceptance

1. All three overview actions navigate to the correct dedicated route.
2. Neither evidence form remains hidden at the bottom of the overview.
3. ReOC details and a certificate file can be saved through `/compliance/reoc` using the existing authoritative command.
4. An Operations Manual PDF can be published through `/compliance/operations-manual` using the existing authoritative command.
5. Successful writes refresh authoritative status and evidence.
6. Validation and server errors remain visible without discarding entered work.
7. Back navigation returns to CASA Compliance.
8. Direct-route refresh and re-login work.
9. Permission, tenant and operating-location enforcement remain unchanged.
10. Audit, outbox, version history, file provenance and immutable evidence remain unchanged.
11. Desktop, tablet, mobile, keyboard and accessibility regression coverage passes.
12. The complete regression suite and production build pass before deployment.

## Out of Scope

- New compliance data models or migrations.
- Changes to compliance scoring or calendar logic.
- New document-approval policies.
- Redesign of Personnel, Aircraft or Checklist compliance workflows.
