# Checklist Authority Reconciliation Design

## Status and boundary

This specification reconciles the existing Controlled Checklists subsystem in place. It is based on Fleet PR #23 commit `b8afc8f86873a38d2d509ba925dabe8fcba73fc7` and does not modify PR #23 or PR #24.

The slice creates the authority needed for a later Preprepared Checklist Library. It does not seed DJI or CASA content, create Fleet defects, implement rectification or return-to-service, change Product Maturity, or perform any Production action.

## Existing authority being reconciled

The existing subsystem has organisation-owned templates and immutable published versions, Mission-bound Draft/Submitted executions, evidence files, Checklist corrective actions, Mission-readiness integration, audit and transactional outbox events. Its defects are:

- all templates require an organisation owner, so no product-owned authority plane exists;
- submission rejects an execution when a newer version has been published;
- lifecycle-stage matching can make every PRE_FLIGHT template block every Mission;
- execution commands trust a caller-supplied Base;
- executions have no exact Aircraft or maintainable Fleet identity;
- `compliance.manage` combines authoring, execution and finding authority;
- completion trusts browser-composed responses and failure summaries;
- Checklist corrective actions are not Fleet maintenance defects.

## Chosen approach

Extend the current aggregate additively through one reconciliation migration. Existing tables retain their identities and historical rows. New relational scope, frozen evidence and finding records are added around them. Existing submitted executions and evidence are never rewritten.

This is preferred over either a parallel Checklist subsystem or repository-seeding a private copy of every system template into every organisation. The former would split authority; the latter would erase product provenance and make source updates ambiguous.

## Template authority planes

`checklist_templates.authority_scope` is exactly `PLATFORM_SYSTEM` or `ORGANISATION`.

- Historical templates are backfilled as `ORGANISATION` without claiming product provenance.
- A PLATFORM_SYSTEM template has no organisation owner, is globally stable product authority, and cannot be mutated by customer commands.
- An ORGANISATION template retains exact tenant ownership. It may reference one `source_system_template_version_id` and is independently versioned.
- Partial unique indexes enforce stable codes separately for the product plane and each tenant plane.

Published version content remains immutable. Every item has a stable item identity and explicit authority class: `DJI_MANUFACTURER`, `CASA_REGULATORY`, `SPRAY_COMMAND_WORKFLOW`, or `ORGANISATION_STANDARD`. System-derived organisation items retain source template/version/item identity and source evidence. Organisation additions must use `ORGANISATION_STANDARD`; parent-template authority never leaks onto them.

Platform publication is deliberately not exposed through the customer Checklist HTTP API. Future system content is installed through repository/product governance under a separately reviewed product command or seed migration.

## Applicability

`checklist_template_applicability` binds an immutable template version to checked applicability facts. The model supports:

- lifecycle stage and whether the template is a Mission-readiness requirement;
- organisation and Base for tenant rules;
- exact Aircraft and maintainable-asset identities;
- manufacturer/model;
- exact Fleet system or component position;
- configuration code such as SPRAY or SPREAD;
- bounded Mission-context predicates.

PLATFORM_SYSTEM versions are discoverable library authority but do not become Mission-readiness requirements by themselves. Only an applicable ORGANISATION version explicitly published with `readiness_required=true` can block a Mission. Exact relational identities take precedence over textual manufacturer/model/configuration facts.

The checked applicability projector resolves the Mission, Base, assigned Aircraft, maintainable registry row and active configuration under the same organisation. An unrelated lifecycle match is insufficient.

## Base, tenant and asset authority

Every customer read or command accepts trusted organisation and actor identities from request context and independently checks:

- active organisation seat and named permission;
- `ftf_operational_location_allowed` for the exact Base;
- Mission ownership and Base when a Mission is supplied;
- Aircraft ownership and Base;
- maintainable registry ownership and Base through `ftf_maintenance_asset_location_allowed`;
- system and component-position membership under that exact asset.

Cross-tenant and cross-Base records return a fail-closed not-found/forbidden result. Callers cannot enumerate product-private or other-tenant records through identifiers.

## Started-instance freeze

Starting an execution serializes against the selected version and writes an immutable `frozen_checklist_snapshot` containing:

- template and version identity, scope and version number;
- source system version where applicable;
- exact composed sections/items in presentation order;
- exact item wording, response contract, criticality and provenance;
- exact applicability and asset/configuration context;
- completing actor/personnel identity and start time.

Later publication never changes or invalidates that instance. SAVE_DRAFT and COMPLETE validate only against the frozen snapshot and optimistic row version. The prior “latest published version” submission gate is removed. New starts can select only currently effective applicable versions.

Existing submitted rows remain byte-unchanged and readable using their immutable template-version reference. Existing Drafts are not silently rewritten; they must be reconciled to a frozen snapshot by a bounded checked command before continuing.

## Completion and response authority

Completion is a checked PostgreSQL command, not a browser assertion. Under an execution row lock it validates:

- Draft status, expected row version, tenant, Base, Mission and asset scope;
- exact frozen item set with no duplicate or unknown response keys;
- every applicable required item has a response;
- `CHECK`: `CHECKED`;
- `PASS_DEFECT_NA`: `PASS`, `DEFECT`, or explicitly governed `N_A`;
- `YES_NO_NA`: `YES`, `NO`, or explicitly governed `N_A`;
- `NUMERIC`: canonical bounded decimal plus optional min/max/unit contract;
- `TEXT`: bounded nonblank text where required;
- `SELECTION`: one exact configured option;
- required evidence exists for the exact execution/item;
- explicit actor/sign-off authority.

Structurally inapplicable items are omitted when the snapshot is assembled. `N_A` is accepted only when the frozen item explicitly permits it.

Completion writes normalized responses and findings atomically, advances the execution to `SUBMITTED`, and emits audit/outbox events. Any failure rolls back the whole transaction.

## Checklist findings and defect boundary

`checklist_findings` is immutable Checklist evidence, not a maintenance ledger. A finding records execution, frozen item identity, exact asset/system/position, response, operator narrative, criticality, evidence identities, actor and timestamp.

Its maintenance handoff state is exactly `DEFECT_HANDOFF_PENDING`. No Checklist command may claim a Fleet defect ID, alter Aircraft serviceability, alter Fleet status, alter due-state, or independently decide Mission readiness. A future Fleet Defect slice may consume a finding through a separately governed idempotent handoff command.

Existing `checklist_corrective_actions` remain historical compliance actions. New Checklist failure completion does not represent them as maintenance defects.

## Permissions

The migration provisions:

- `checklist_templates.read`
- `checklist_templates.author`
- `checklist_templates.publish`
- `checklists.execute`
- `checklists.read_completed`
- `checklist_findings.manage`

Admin receives all six through existing provisioning conventions. Operational roles may receive execute/read-completed only through explicit role-permission assignment; the migration does not broaden them automatically. Customer commands never accept PLATFORM_SYSTEM mutation.

## Reads and RLS

Direct authenticated table access remains revoked. SECURITY DEFINER RPCs have fixed `search_path`, validate actor/tenant/Base/permission scope, and return bounded projections. The trusted server uses those RPCs rather than generic PostgREST table enumeration.

Service-role table privileges are limited to what the trusted repository requires; mutations occur through checked commands. Published/completed/finding immutability triggers remain authoritative.

## Mission readiness reconciliation

The existing Mission-readiness engine remains canonical. Its Checklist category delegates to the checked applicable-requirements projector. Only current applicable organisation requirements are evaluated. The immutable execution selected for evidence remains accepted even if its source template is later superseded.

Checklist completion supplies evidence; it does not by itself set Mission ready. Other Weather, JSA, Aircraft, Personnel and document gates remain unchanged.

## Offline and browser behavior

There is no approved offline authority. The browser may hold unsaved form state only in memory. A failed save/completion keeps the last confirmed server version, identifies connectivity failure clearly, and never reports completion. Refresh, re-login or session-scope changes reload authoritative state and synchronously suppress stale tenant/Base data.

## Historical reconciliation

The migration performs metadata-only backfill:

- existing templates and versions become ORGANISATION scope;
- no historical template/version identity changes;
- no submitted execution response, evidence, failure summary or sign-off value changes;
- no completed execution receives new applicability or product provenance;
- no historical corrective action is relabelled a Fleet defect.

Assertions in the migration and PGlite tests compare protected historical payloads before and after reconciliation.

## Schema/API deliverables

The slice uses one additive migration, `20260823100000_checklist_authority_reconciliation.sql`, to add authority metadata, applicability, frozen execution scope, findings, permissions and checked RPCs. The existing server/browser Checklist APIs are adapted to the checked read/command contracts. The Mission Checklist UI continues to support its existing flow but renders only applicable templates and completes against the frozen snapshot.

No DJI/CASA records are inserted.

## Verification and acceptance

Tests must prove all twelve Founder RED/GREEN boundaries, recursive contract decoding, tenant/Base/asset denial, no customer platform mutation, atomic audit/outbox, history preservation, stale-session suppression, connectivity fail-closed behavior and absence of Fleet/serviceability mutation. Browser behavior changes require Chromium and WebKit coverage on phone, tablet and desktop.

## Decision after reconciliation

If all authority, behavioral, deterministic, maturity, build, browser and independent-review gates pass, this slice returns `READY TO RESUME PREPREPARED LIBRARY DESIGN`. Otherwise it returns `FURTHER AUTHORITY CORRECTION REQUIRED` and does not start DJI/CASA research.
