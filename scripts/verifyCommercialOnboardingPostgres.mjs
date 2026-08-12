import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_POSTGRES_EVIDENCE = [
  'commercial_onboarding_applications', 'commercial_onboarding_application_events',
  'commercial_onboarding_invitations', 'commercial_onboarding_invitation_events',
  'organisations', 'internal_users', 'memberships', 'organisation_seat_allocations',
  'internal_user_seat_assignments', 'operating_locations', 'membership_operating_location_assignments',
  'platform_users', 'personnel', 'audit_events', 'transactional_outbox',
];
const EXPECTED_PROOFS = [
  'PASS keeps submission, approval, invitation preparation, and provider delivery as separate transitions',
  'PASS rejects expired, revoked, wrong-email, Platform, and conflicting identities',
  'PASS provisions one complete organisation identity atomically and is idempotent for the same user',
  'PASS preflights invitation state and identity without mutating expected denials',
  'PASS keeps application events, invitation events, and consumed invitations immutable',
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROLLED_PREFIX = 'SC ACCEPTANCE —';

function runLocalPostgresVerification() {
  const child = spawnSync(process.execPath, [resolve(root, 'src/__tests__/commercialOnboardingMigration.test.js')], {
    cwd: root, env: { ...process.env, COMMERCIAL_ONBOARDING_PGLITE_CHILD: '1' }, encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (child.status !== 0) throw new Error(child.stderr || child.stdout || 'Commercial onboarding PostgreSQL verification failed.');
  for (const proof of EXPECTED_PROOFS) {
    if (!child.stdout.includes(proof)) throw new Error(`Commercial onboarding PostgreSQL proof is missing: ${proof}`);
  }
  process.stdout.write(`Commercial onboarding PostgreSQL verification passed (${REQUIRED_POSTGRES_EVIDENCE.length} authoritative record types).\n`);
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required for controlled onboarding verification.`);
  return value;
}

function validateSource(source) {
  for (const field of ['applicationId', 'invitationId', 'organisationId', 'operatingLocationId']) {
    if (!UUID.test(String(source[field] || ''))) throw new Error(`Controlled onboarding evidence has invalid ${field}.`);
  }
  for (const field of ['aircraftId', 'equipmentId', 'clientId', 'propertyId', 'fieldId', 'jobId', 'missionId']) {
    if (source[field] && !UUID.test(String(source[field]))) throw new Error(`Controlled onboarding evidence has invalid ${field}.`);
  }
  if (!/^SC-APP-[A-Z0-9]+$/.test(String(source.applicationReference || ''))) {
    throw new Error('Controlled onboarding evidence has an invalid application reference.');
  }
}

function createTrustedClient() {
  const supabaseUrl = new URL(requiredEnvironment('SUPABASE_URL')).origin;
  const serviceKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const rest = async (path, init = {}) => {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Controlled onboarding verification failed at ${path.split('?')[0]} (${response.status}).`);
    return body;
  };
  const authUser = async (id) => {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, { headers });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Controlled onboarding authentication verification failed (${response.status}).`);
    return body;
  };
  return { rest, authUser };
}

function exactSet(actual, expected, label) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(`Controlled onboarding ${label} did not resolve to the exact evidence set.`);
}

async function buildControlledSnapshot(source, client = createTrustedClient(), requireCompleteOperationalEvidence = false) {
  validateSource(source);
  const { rest, authUser } = client;
  const one = async (path, label) => {
    const rows = await rest(path);
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`Controlled onboarding ${label} did not resolve uniquely.`);
    return rows[0];
  };
  const none = async (path, label) => {
    const rows = await rest(path);
    if (!Array.isArray(rows) || rows.length !== 0) throw new Error(`Controlled onboarding ${label} must be absent.`);
  };

  const application = await one(`commercial_onboarding_applications?id=eq.${source.applicationId}&application_reference=eq.${encodeURIComponent(source.applicationReference)}&select=id,application_reference,business_name,intended_administrator_email,status,row_version`, 'application');
  if (!application.business_name.startsWith(`${CONTROLLED_PREFIX} `) || application.status !== 'APPROVED') {
    throw new Error('Refusing controlled verification for a non-controlled approved application.');
  }
  const invitation = await one(`commercial_onboarding_invitations?id=eq.${source.invitationId}&application_id=eq.${source.applicationId}&select=id,application_id,intended_administrator_email,status,accepted_by_auth_user_id,resulting_organisation_id,resulting_internal_user_id,resulting_membership_id,resulting_operating_location_id,row_version`, 'invitation');
  if (invitation.status !== 'ACCEPTED' || invitation.resulting_organisation_id !== source.organisationId
    || invitation.resulting_operating_location_id !== source.operatingLocationId
    || invitation.intended_administrator_email !== application.intended_administrator_email) {
    throw new Error('Controlled onboarding invitation provenance is inconsistent.');
  }
  const acceptedInvitations = await rest(`commercial_onboarding_invitations?application_id=eq.${source.applicationId}&status=eq.ACCEPTED&select=id`);
  exactSet(acceptedInvitations.map((row) => row.id), [source.invitationId], 'accepted invitation');

  const auth = await authUser(invitation.accepted_by_auth_user_id);
  if (auth.id !== invitation.accepted_by_auth_user_id || auth.email?.toLowerCase() !== application.intended_administrator_email
    || !auth.email_confirmed_at) throw new Error('Controlled onboarding authentication identity is not active and exact.');

  const organisation = await one(`organisations?id=eq.${source.organisationId}&archived_at=is.null&select=id,name,row_version`, 'organisation');
  if (organisation.name !== application.business_name) throw new Error('Controlled onboarding organisation name does not match approved evidence.');
  const internalUser = await one(`internal_users?id=eq.${invitation.resulting_internal_user_id}&organisation_id=eq.${source.organisationId}&auth_user_id=eq.${invitation.accepted_by_auth_user_id}&is_active=eq.true&archived_at=is.null&select=id,auth_user_id,row_version`, 'internal user');
  const membership = await one(`memberships?id=eq.${invitation.resulting_membership_id}&organisation_id=eq.${source.organisationId}&internal_user_id=eq.${internalUser.id}&is_active=eq.true&archived_at=is.null&select=id,role_id,row_version`, 'membership');
  const role = await one(`roles?id=eq.${membership.role_id}&organisation_id=eq.${source.organisationId}&code=eq.admin&archived_at=is.null&select=id,code`, 'administrator role');
  if (role.code !== 'admin') throw new Error('Controlled onboarding membership is not the Organisation Administrator role.');
  const memberships = await rest(`memberships?organisation_id=eq.${source.organisationId}&internal_user_id=eq.${internalUser.id}&is_active=eq.true&archived_at=is.null&select=id`);
  exactSet(memberships.map((row) => row.id), [membership.id], 'active membership');

  const seatAllocation = await one(`organisation_seat_allocations?organisation_id=eq.${source.organisationId}&archived_at=is.null&select=id,allocated_seats,row_version`, 'seat allocation');
  if (Number(seatAllocation.allocated_seats) !== 1) throw new Error('Controlled onboarding seat allocation must contain exactly one seat.');
  const seatAssignment = await one(`internal_user_seat_assignments?organisation_id=eq.${source.organisationId}&internal_user_id=eq.${internalUser.id}&membership_id=eq.${membership.id}&status=eq.active&archived_at=is.null&select=id,organisation_seat_allocation_id,row_version`, 'seat assignment');
  if (seatAssignment.organisation_seat_allocation_id !== seatAllocation.id) throw new Error('Controlled onboarding seat assignment does not belong to its allocation.');
  const location = await one(`operating_locations?id=eq.${source.operatingLocationId}&organisation_id=eq.${source.organisationId}&archived_at=is.null&select=id,row_version`, 'Base');
  const baseAssignment = await one(`membership_operating_location_assignments?organisation_id=eq.${source.organisationId}&membership_id=eq.${membership.id}&operating_location_id=eq.${location.id}&is_active=eq.true&archived_at=is.null&select=id,row_version`, 'Base assignment');

  await none(`platform_users?auth_user_id=eq.${invitation.accepted_by_auth_user_id}&archived_at=is.null&select=id`, 'Platform identity');
  await none(`personnel?organisation_id=eq.${source.organisationId}&archived_at=is.null&select=id`, 'Personnel');

  const applicationEvents = await rest(`commercial_onboarding_application_events?application_id=eq.${source.applicationId}&select=event_type,to_status&order=created_at.asc`);
  for (const state of ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED']) {
    if (!applicationEvents.some((event) => event.to_status === state)) throw new Error(`Controlled onboarding application history is missing ${state}.`);
  }
  const invitationEvents = await rest(`commercial_onboarding_invitation_events?invitation_id=eq.${source.invitationId}&application_id=eq.${source.applicationId}&select=event_type,to_status&order=created_at.asc`);
  for (const state of ['SENT', 'ACCEPTED']) {
    if (!invitationEvents.some((event) => event.to_status === state)) throw new Error(`Controlled onboarding invitation history is missing ${state}.`);
  }
  const audits = await rest(`audit_events?organisation_id=eq.${source.organisationId}&event_type=eq.commercial_onboarding.accepted&entity_id=eq.${source.invitationId}&select=id`);
  if (audits.length !== 1) throw new Error('Controlled onboarding completion audit evidence must exist exactly once.');

  const primary = [
    ['missions', 'missionId', 'title'], ['jobs', 'jobId', 'scope'], ['fields', 'fieldId', 'name'],
    ['properties', 'propertyId', 'name'], ['clients', 'clientId', 'name'],
    ['equipment_kits', 'equipmentId', 'name'], ['aircraft', 'aircraftId', 'serial_number'],
  ];
  const records = {};
  const resolvedPrimaryIds = {};
  for (const [table, evidenceKey, labelColumn] of primary) {
    const rows = await rest(`${table}?organisation_id=eq.${source.organisationId}&archived_at=is.null&select=id,row_version,${labelColumn}`);
    if (!rows.every((row) => String(row[labelColumn] || '').startsWith(`${CONTROLLED_PREFIX} `))) {
      throw new Error(`Refusing controlled verification because ${table} contains non-controlled active records.`);
    }
    if (rows.length > 1) throw new Error(`Controlled onboarding ${table} did not resolve uniquely.`);
    if (source[evidenceKey]) exactSet(rows.map((row) => row.id), [source[evidenceKey]], table);
    else if (requireCompleteOperationalEvidence) throw new Error(`Controlled onboarding evidence is missing ${evidenceKey}.`);
    resolvedPrimaryIds[evidenceKey] = source[evidenceKey] || rows[0]?.id || null;
    records[table] = rows.map(({ id, row_version: rowVersion }) => ({ id, rowVersion }));
  }
  const childDefinitions = [
    ['mission_versions', 'mission_id', resolvedPrimaryIds.missionId],
    ['job_fields', 'job_id', resolvedPrimaryIds.jobId],
    ['field_boundary_versions', 'property_id', resolvedPrimaryIds.propertyId],
    ['aircraft_equipment_kit_assignments', 'aircraft_id', resolvedPrimaryIds.aircraftId],
  ];
  for (const [table, relationColumn, relationId] of childDefinitions) {
    const rows = relationId
      ? await rest(`${table}?organisation_id=eq.${source.organisationId}&${relationColumn}=eq.${relationId}&archived_at=is.null&select=id,row_version`)
      : [];
    records[table] = rows.map(({ id, row_version: rowVersion }) => ({ id, rowVersion }));
  }
  const compatibility = await rest(`equipment_kit_aircraft_compatibility?organisation_id=eq.${source.organisationId}&select=id`);
  records.equipment_kit_aircraft_compatibility = compatibility.map(({ id }) => ({ id }));
  for (const table of ['role_permissions', 'permissions', 'roles']) {
    const rows = await rest(`${table}?organisation_id=eq.${source.organisationId}&archived_at=is.null&select=id,row_version`);
    if (!rows.length) throw new Error(`Controlled onboarding ${table} evidence is unexpectedly absent.`);
    records[table] = rows.map(({ id, row_version: rowVersion }) => ({ id, rowVersion }));
  }

  if (requireCompleteOperationalEvidence) {
    const outboxEvidence = await rest('rpc/ftf_verify_controlled_commercial_onboarding_evidence', {
      method: 'POST', body: JSON.stringify({ p_evidence: { ...source, records } }),
    });
    if (outboxEvidence?.acceptance?.present !== true) {
      throw new Error('Controlled onboarding acceptance outbox evidence is incomplete.');
    }
    for (const resource of ['clients', 'properties', 'fields', 'jobs', 'missions']) {
      if (outboxEvidence?.resources?.[resource]?.present !== true) {
        throw new Error(`Controlled onboarding ${resource} outbox evidence is incomplete.`);
      }
    }
  }

  return {
    applicationId: application.id, applicationReference: application.application_reference,
    invitationId: invitation.id, organisationId: organisation.id,
    authUserId: invitation.accepted_by_auth_user_id, internalUserId: internalUser.id,
    membershipId: membership.id, operatingLocationId: location.id,
    seatAllocationId: seatAllocation.id, seatAssignmentId: seatAssignment.id, baseAssignmentId: baseAssignment.id,
    expectedVersions: {
      application: application.row_version, invitation: invitation.row_version,
      organisation: organisation.row_version, internalUser: internalUser.row_version,
      membership: membership.row_version, operatingLocation: location.row_version,
      seatAllocation: seatAllocation.row_version, seatAssignment: seatAssignment.row_version,
      baseAssignment: baseAssignment.row_version,
    },
    records,
  };
}

async function verifyControlledOnboarding(evidencePath) {
  const source = JSON.parse(await readFile(resolve(evidencePath), 'utf8'));
  await buildControlledSnapshot(source, createTrustedClient(), true);
  process.stdout.write('Controlled commercial onboarding live evidence verified: one organisation identity, administrator membership, seat and Base; no Platform identity or Personnel; immutable history and atomic acceptance evidence retained.\n');
}

async function archiveControlledOnboarding(evidencePath) {
  const source = JSON.parse(await readFile(resolve(evidencePath), 'utf8'));
  const client = createTrustedClient();
  const snapshot = await buildControlledSnapshot(source, client);
  const result = await client.rest('rpc/ftf_archive_controlled_commercial_onboarding', {
    method: 'POST', body: JSON.stringify({ p_evidence: snapshot }),
  });
  if (!result?.archived) throw new Error(`Transactional controlled onboarding cleanup failed: ${result?.code || 'UNKNOWN'}.`);

  const archivedOrganisation = await client.rest(`organisations?id=eq.${source.organisationId}&select=id,archived_at`);
  if (archivedOrganisation.length !== 1 || !archivedOrganisation[0].archived_at) {
    throw new Error('Controlled onboarding organisation remains active after transactional cleanup.');
  }
  for (const table of [
    'missions', 'jobs', 'fields', 'properties', 'clients', 'equipment_kits', 'aircraft',
    'role_permissions', 'permissions', 'roles', 'memberships', 'internal_users', 'operating_locations',
    'organisation_seat_allocations', 'internal_user_seat_assignments', 'membership_operating_location_assignments',
  ]) {
    const rows = await client.rest(`${table}?organisation_id=eq.${source.organisationId}&archived_at=is.null&select=id&limit=1`);
    if (rows.length) throw new Error(`Transactional cleanup left an active ${table} record.`);
  }
  for (const table of ['equipment_kit_aircraft_compatibility', 'ftf_profiles']) {
    const scope = table === 'ftf_profiles' ? `tenant_id=eq.${source.organisationId}` : `organisation_id=eq.${source.organisationId}`;
    const rows = await client.rest(`${table}?${scope}&select=*&limit=1`);
    if (rows.length) throw new Error(`Transactional cleanup left a controlled ${table} record.`);
  }
  const retainedBoundaries = await client.rest(`field_boundary_versions?organisation_id=eq.${source.organisationId}&select=id,archived_at`);
  if (retainedBoundaries.length !== snapshot.records.field_boundary_versions.length
    || retainedBoundaries.some((row) => row.archived_at)) {
    throw new Error('Transactional cleanup altered immutable field boundary evidence.');
  }
  const invitation = await client.rest(`commercial_onboarding_invitations?id=eq.${source.invitationId}&status=eq.ACCEPTED&select=id`);
  const application = await client.rest(`commercial_onboarding_applications?id=eq.${source.applicationId}&status=eq.APPROVED&select=id`);
  if (invitation.length !== 1 || application.length !== 1) throw new Error('Transactional cleanup altered immutable onboarding history.');
  const audit = await client.rest(`audit_events?organisation_id=eq.${source.organisationId}&event_type=eq.commercial_onboarding.acceptance_archived&select=id`);
  const outboxEvidence = await client.rest('rpc/ftf_verify_controlled_commercial_onboarding_evidence', {
    method: 'POST', body: JSON.stringify({ p_evidence: snapshot }),
  });
  if (audit.length !== 1 || outboxEvidence?.archive?.present !== true) {
    throw new Error('Transactional cleanup audit/outbox evidence is incomplete.');
  }
  process.stdout.write('Controlled commercial onboarding organisation archived transactionally; exact provenance protected genuine organisation records.\n');
}

const [mode, evidencePath] = process.argv.slice(2);
if (!mode) runLocalPostgresVerification();
else if (mode === '--verify-controlled' && evidencePath) await verifyControlledOnboarding(evidencePath);
else if (mode === '--archive-controlled' && evidencePath) await archiveControlledOnboarding(evidencePath);
else throw new Error('Usage: node scripts/verifyCommercialOnboardingPostgres.mjs [--verify-controlled|--archive-controlled <evidence.json>]');
