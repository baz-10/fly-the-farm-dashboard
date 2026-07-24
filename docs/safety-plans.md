# Job Safety Plans

Job Safety Plans are optional, controlled job records for consolidating the
people, assets, hazards, controls, emergency arrangements and evidence used
across one or more linked missions. A missing plan, a “Not required” decision,
or an outstanding crew acknowledgement never blocks mission authorisation.
The mission JSA and risk controls remain the operational safety gate.

## Roles and privacy

- Company administrators maintain and publish the company master, approve
  plans, recover deleted drafts, export client copies and nominate an
  operational authority.
- A nominated operational authority can submit, approve and revise plans for
  their own company.
- Contractors can prepare plans and submit them, but cannot approve unless
  explicitly nominated. Assigned PICs and crew can read and acknowledge the
  current version.
- Clients cannot open a plan unless a future, explicit sharing workflow grants
  access. Creating a client PDF copy does not grant application access.
- Every template, plan, attachment and audit event is tenant scoped. Platform
  support must not browse customer Safety Plan content.

## Standard, company master and job plan

The Australian platform standard is a CASA/ReOC-aligned starting point. It is
not CASA approval and does not replace an operator’s approved manuals,
authorisations, legal obligations or judgement.

An administrator adapts that standard in **Compliance → Safety Plans → Company
master**. Saving retains a draft; publishing creates a new immutable company
master. Existing job plans retain their captured template snapshot and do not
change when a later master is published.

A job plan is created from the latest published company master. The five-step
editor covers job details, people/assets, hazards/controls, emergency planning,
and review/submission. Required responses determine readiness for submission,
not mission readiness.

## Source refresh

Creation imports linked mission context, JSA hazards and risk controls. The
plan records stable source IDs and captured timestamps. When the source later
changes, the editor displays a comparison and requires an explicit decision
for each addition, change or removal. Operators can accept the latest source
value or retain a documented company value. A refresh is audited; source data
never silently overwrites a controlled plan.

## Lifecycle, retention and recovery

1. **Draft** — editable and autosaved with optimistic concurrency.
2. **Submitted** — awaiting an administrator or nominated authority.
3. **Approved** — content and evidence are immutable, digitally digested and
   retained for at least seven years.
4. **Revision** — creates a new draft version; the approved historical version
   remains intact and addressable.

Assigned crew acknowledgement is version specific. Revising a plan requires a
fresh acknowledgement, but a missing acknowledgement is attention only.
Draft deletion is soft and administrators can restore it. Approved versions
cannot be deleted or edited.

If autosave fails, entered text remains on screen and **Retry save** retries the
same draft. If another session changed the plan, choose the remote version or
create a controlled revision. Never resolve a conflict by editing database rows
or deleting audit records.

## Attachments and PDF

Evidence uploads accept the configured PDF/image types and are stored in the
private `ftf-safety-attachments` bucket under a tenant/plan/version path.
Attachment metadata is part of the controlled version. Failed or losing
uploads are cleaned up; approved evidence cannot be replaced.

Approved plans can be downloaded or printed from the job. The PDF includes the
company/job identity, version, approval, retained content digest, supporting
evidence list and the CASA/ReOC-aligned disclaimer. Client-copy export is
administrator-only and creates an audit event; it does not share the live plan.

## Operational support

For a reported problem, record the tenant, plan ID, version, user role and UTC
time without requesting plan contents. Confirm the relevant deployment,
migration and private bucket policy first. Use draft restore for an accidental
draft deletion. For a failed release, roll back the application deployment;
do not remove historical plans, audit rows or attachments.
