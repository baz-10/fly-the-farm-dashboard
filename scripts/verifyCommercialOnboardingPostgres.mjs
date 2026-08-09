import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The real PGlite lifecycle contract applies the repository migrations and
// proves these authoritative records and boundaries. Keep this explicit list
// here so the release verifier remains auditable rather than becoming a
// generic test-suite alias.
const REQUIRED_POSTGRES_EVIDENCE = [
  'commercial_onboarding_applications',
  'commercial_onboarding_application_events',
  'commercial_onboarding_invitations',
  'commercial_onboarding_invitation_events',
  'organisations',
  'internal_users',
  'memberships',
  'organisation_seat_allocations',
  'internal_user_seat_assignments',
  'operating_locations',
  'membership_operating_location_assignments',
  'platform_users',
  'personnel',
  'audit_events',
  'transactional_outbox',
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
    cwd: root,
    env: { ...process.env, COMMERCIAL_ONBOARDING_PGLITE_CHILD: '1' },
    encoding: 'utf8',
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
  if (!value?.trim()) throw new Error(`${name} is required for controlled onboarding cleanup.`);
  return value;
}

async function archiveControlledOnboarding(evidencePath) {
  const source = JSON.parse(await readFile(resolve(evidencePath), 'utf8'));
  for (const field of ['invitationId', 'organisationId', 'operatingLocationId']) {
    if (!UUID.test(String(source[field] || ''))) throw new Error(`Controlled onboarding evidence has invalid ${field}.`);
  }
  for (const field of ['aircraftId', 'equipmentId']) {
    if (source[field] && !UUID.test(String(source[field]))) throw new Error(`Controlled onboarding evidence has invalid ${field}.`);
  }
  if (!/^SC-APP-[A-Z0-9]+$/.test(String(source.applicationReference || ''))) {
    throw new Error('Controlled onboarding evidence has an invalid application reference.');
  }

  const supabaseUrl = new URL(requiredEnvironment('SUPABASE_URL')).origin;
  const serviceKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const rest = async (path, init = {}) => {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Controlled onboarding cleanup failed at ${path.split('?')[0]} (${response.status}).`);
    return body;
  };
  const one = async (path) => {
    const rows = await rest(path);
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Controlled onboarding evidence did not resolve uniquely.');
    return rows[0];
  };

  const application = await one(`commercial_onboarding_applications?application_reference=eq.${encodeURIComponent(source.applicationReference)}&select=id,business_name,status`);
  if (!String(application.business_name).startsWith(`${CONTROLLED_PREFIX} `) || application.status !== 'APPROVED') {
    throw new Error('Refusing to archive a non-controlled onboarding application.');
  }
  const invitation = await one(`commercial_onboarding_invitations?id=eq.${source.invitationId}&select=id,application_id,status,resulting_organisation_id,resulting_internal_user_id,resulting_membership_id,resulting_operating_location_id`);
  if (invitation.application_id !== application.id || invitation.status !== 'ACCEPTED'
    || invitation.resulting_organisation_id !== source.organisationId
    || invitation.resulting_operating_location_id !== source.operatingLocationId) {
    throw new Error('Refusing cleanup because onboarding provenance does not match the controlled organisation.');
  }
  const organisation = await one(`organisations?id=eq.${source.organisationId}&select=id,name,archived_at`);
  if (organisation.name !== application.business_name || organisation.archived_at) {
    throw new Error('Refusing cleanup because the controlled organisation identity is not active and exact.');
  }

  const activeOperational = [];
  for (const [table, labelColumn] of [['missions', 'title'], ['jobs', 'scope'], ['fields', 'name'], ['properties', 'name'], ['clients', 'name']]) {
    const rows = await rest(`${table}?organisation_id=eq.${source.organisationId}&archived_at=is.null&select=id,${labelColumn}`);
    if (!rows.every((row) => String(row[labelColumn] || '').startsWith(`${CONTROLLED_PREFIX} `))) {
      throw new Error(`Refusing cleanup because ${table} contains a non-controlled active record.`);
    }
    activeOperational.push([table, rows]);
  }
  const aircraft = await rest(`aircraft?organisation_id=eq.${source.organisationId}&archived_at=is.null&select=id,registration,serial_number,row_version`);
  const equipment = await rest(`equipment_kits?organisation_id=eq.${source.organisationId}&archived_at=is.null&select=id,name,row_version`);
  if (!aircraft.every((record) => String(record.serial_number || '').startsWith(`${CONTROLLED_PREFIX} `))
    || !equipment.every((record) => String(record.name || '').startsWith(`${CONTROLLED_PREFIX} `))) {
    throw new Error('Refusing cleanup because Fleet evidence is not controlled acceptance data.');
  }
  if (source.aircraftId && !aircraft.some((record) => record.id === source.aircraftId)) throw new Error('Controlled Aircraft evidence did not resolve exactly.');
  if (source.equipmentId && !equipment.some((record) => record.id === source.equipmentId)) throw new Error('Controlled Equipment evidence did not resolve exactly.');

  const now = new Date().toISOString();
  const actor = invitation.resulting_internal_user_id;
  const patchRows = async (table, query, body) => rest(`${table}?${query}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body),
  });
  const patchExactlyOne = async (table, query, body) => {
    const changed = await patchRows(table, query, body);
    if (!Array.isArray(changed) || changed.length !== 1) throw new Error(`Controlled onboarding cleanup did not update exactly one ${table} record.`);
  };
  for (const [table, rows] of activeOperational) {
    for (const row of rows) {
      const changed = await patchRows(table, `id=eq.${row.id}&organisation_id=eq.${source.organisationId}&archived_at=is.null`, { archived_at: now, archived_by_internal_user_id: actor });
      if (changed.length !== 1) throw new Error(`Controlled onboarding cleanup did not archive exactly one ${table} record.`);
    }
  }
  for (const record of aircraft) await patchExactlyOne('aircraft', `id=eq.${record.id}&organisation_id=eq.${source.organisationId}&archived_at=is.null`, { archived_at: now, archived_by_internal_user_id: actor });
  for (const record of equipment) await patchExactlyOne('equipment_kits', `id=eq.${record.id}&organisation_id=eq.${source.organisationId}&archived_at=is.null`, { archived_at: now, archived_by_internal_user_id: actor });
  await patchExactlyOne('membership_operating_location_assignments', `membership_id=eq.${invitation.resulting_membership_id}&operating_location_id=eq.${source.operatingLocationId}&archived_at=is.null`, { is_active: false, archived_at: now });
  await patchExactlyOne('internal_user_seat_assignments', `internal_user_id=eq.${actor}&archived_at=is.null`, { status: 'revoked', revoked_at: now, archived_at: now });
  await patchExactlyOne('memberships', `id=eq.${invitation.resulting_membership_id}&organisation_id=eq.${source.organisationId}&archived_at=is.null`, { is_active: false, archived_at: now, archived_by_internal_user_id: actor });
  await patchExactlyOne('operating_locations', `id=eq.${source.operatingLocationId}&organisation_id=eq.${source.organisationId}&archived_at=is.null`, { archived_at: now, archived_by_internal_user_id: actor });
  await patchExactlyOne('internal_users', `id=eq.${actor}&organisation_id=eq.${source.organisationId}&archived_at=is.null`, { is_active: false, archived_at: now, archived_by_internal_user_id: actor });
  await rest('audit_events', { method: 'POST', body: JSON.stringify({
    organisation_id: source.organisationId, actor_internal_user_id: actor,
    event_type: 'commercial_onboarding.acceptance_archived', entity_type: 'organisation', entity_id: source.organisationId,
    event_payload: { applicationReference: source.applicationReference, invitationId: source.invitationId, controlledAcceptance: true },
  }) });
  await rest('transactional_outbox', { method: 'POST', body: JSON.stringify({
    organisation_id: source.organisationId, topic: 'commercial_onboarding.acceptance_archived',
    aggregate_type: 'organisation', aggregate_id: source.organisationId,
    payload: { applicationReference: source.applicationReference, invitationId: source.invitationId, controlledAcceptance: true },
  }) });
  await patchExactlyOne('organisations', `id=eq.${source.organisationId}&archived_at=is.null`, { archived_at: now, archived_by_internal_user_id: actor });

  const archived = await one(`organisations?id=eq.${source.organisationId}&select=id,archived_at`);
  if (!archived.archived_at) throw new Error('Controlled onboarding organisation remains active after cleanup.');
  for (const [table] of activeOperational) {
    const remaining = await rest(`${table}?organisation_id=eq.${source.organisationId}&archived_at=is.null&select=id&limit=1`);
    if (remaining.length) throw new Error(`Controlled onboarding cleanup left an active ${table} record.`);
  }
  process.stdout.write('Controlled commercial onboarding organisation archived; genuine organisation records were excluded by provenance checks.\n');
}

const [mode, evidencePath] = process.argv.slice(2);
if (!mode) runLocalPostgresVerification();
else if (mode === '--archive-controlled' && evidencePath) await archiveControlledOnboarding(evidencePath);
else throw new Error('Usage: node scripts/verifyCommercialOnboardingPostgres.mjs [--archive-controlled <evidence.json>]');
