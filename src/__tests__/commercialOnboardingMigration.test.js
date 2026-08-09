const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { PGlite } = require('@electric-sql/pglite');

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/20260809100000_commercial_onboarding_lifecycle.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const forwardMigrationName = '20260809110000_commercial_onboarding_delivery_and_abuse.sql';
const resendMigrationName = '20260809120000_commercial_onboarding_immediate_resend.sql';
const identityAcceptanceMigrationName = '20260809130000_commercial_onboarding_identity_acceptance.sql';
const forwardMigrationPath = path.resolve(__dirname, `../../supabase/migrations/${forwardMigrationName}`);
const forwardSql = fs.existsSync(forwardMigrationPath) ? fs.readFileSync(forwardMigrationPath, 'utf8') : '';
const identityAcceptanceMigrationPath = path.resolve(__dirname, `../../supabase/migrations/${identityAcceptanceMigrationName}`);
const identityAcceptanceSql = fs.existsSync(identityAcceptanceMigrationPath) ? fs.readFileSync(identityAcceptanceMigrationPath, 'utf8') : '';

const runPgliteInThisProcess = process.env.COMMERCIAL_ONBOARDING_PGLITE_CHILD === '1';
const pureNodeTests = [];
const pureNodeBeforeAll = [];
const pureNodeAfterAll = [];

if (runPgliteInThisProcess) {
  global.jest = { setTimeout: () => {} };
  global.expect = require('expect');
  global.test = (name, run) => pureNodeTests.push({ name, run });
  global.beforeAll = (run) => pureNodeBeforeAll.push(run);
  global.afterAll = (run) => pureNodeAfterAll.push(run);
}

jest.setTimeout(120000);

const platformAuthUserId = '90000000-0000-4000-8000-000000000001';
const platformUserId = '90000000-0000-4000-8000-000000000002';
const legacyPendingInvitationId = '90000000-0000-4000-8000-000000000011';
const legacySentInvitationId = '90000000-0000-4000-8000-000000000012';
let db;

const validApplication = (email, suffix) => ({
  businessName: `Onboarding Air ${suffix}`,
  administratorName: `Administrator ${suffix}`,
  administratorEmail: email,
  administratorPhone: '+61 400 000 000',
  base: {
    name: `Primary Base ${suffix}`,
    address: '1 Test Road, Emerald QLD 4720',
    latitude: -23.526,
    longitude: 148.162,
    timezone: 'Australia/Brisbane',
    addressSource: 'ADDRESS_SEARCH',
    locationConfirmedAt: '2026-08-09T00:00:00.000Z',
  },
  consentVersion: '2026-08-09',
  notes: 'Commercial aerial application business.',
});

async function submitApplication(email, suffix) {
  const result = await db.query(
    'select public.ftf_submit_commercial_application($1::jsonb) as result',
    [JSON.stringify(validApplication(email, suffix))],
  );
  return result.rows[0].result;
}

async function submitGuardedApplication(email, suffix, fingerprintSeed = suffix) {
  const fingerprint = crypto.createHash('sha256').update(fingerprintSeed).digest('hex');
  const result = await db.query(
    'select public.ftf_submit_commercial_application_guarded($1::jsonb,$2::text) as result',
    [JSON.stringify(validApplication(email, suffix)), fingerprint],
  );
  return result.rows[0].result;
}

async function reviewApplication(applicationId, rowVersion, decision, notes = 'Reviewed by Platform.') {
  const result = await db.query(
    `select public.ftf_review_commercial_application(
      $1::uuid, $2::uuid, $3::integer, $4::text, $5::text
    ) as result`,
    [applicationId, platformUserId, rowVersion, decision, notes],
  );
  return result.rows[0].result;
}

async function approveApplication(applicationId, rowVersion) {
  return reviewApplication(applicationId, rowVersion, 'APPROVE', 'Approved for invitation.');
}

async function issueInvitation(applicationId, rowVersion, rawToken, expiresAt = '2099-01-01T00:00:00Z', replaceActive = false) {
  const result = await db.query(
    `select public.ftf_issue_commercial_invitation(
      $1::uuid, $2::uuid, $3::integer, $4::text, 'Initial invitation', $5::timestamptz, $6::boolean
    ) as result`,
    [applicationId, platformUserId, rowVersion, rawToken, expiresAt, replaceActive],
  );
  return result.rows[0].result;
}

async function markInvitationDelivery(invitationId, rowVersion, outcome = 'SENT', notes = 'Provider response recorded.') {
  const result = await db.query(
    `select public.ftf_mark_commercial_invitation_delivery(
      $1::uuid, $2::uuid, $3::integer, $4::text, $5::text, $6::text
    ) as result`,
    [invitationId, platformUserId, rowVersion, outcome, `provider-${invitationId}`, notes],
  );
  return result.rows[0].result;
}

async function createIssuedInvitation(email, suffix, rawToken) {
  const application = await submitApplication(email, suffix);
  const review = await reviewApplication(
    application.application_id,
    application.row_version,
    'UNDER_REVIEW',
  );
  const approval = await approveApplication(application.application_id, review.row_version);
  const prepared = await issueInvitation(application.application_id, approval.row_version, rawToken);
  const invitation = await markInvitationDelivery(prepared.invitation_id, prepared.row_version);
  invitation.raw_token = rawToken;
  invitation.token_hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { application, review, approval, invitation };
}

test('separates application approval from invitation creation', () => {
  expect(sql).toContain('commercial_onboarding_applications');
  expect(sql).toContain('commercial_onboarding_application_events');
  expect(sql).toContain('commercial_onboarding_invitations');
  expect(sql).toContain('commercial_onboarding_invitation_events');
  expect(sql).toContain("status = 'APPROVED'");
  expect(sql).toContain('approved_application_required');
});

test('defines email-bound invitation identifier preflight and acceptance boundaries', () => {
  expect(identityAcceptanceSql).toContain('ftf_preflight_commercial_invitation');
  expect(identityAcceptanceSql).toContain('ftf_accept_commercial_invitation_by_id');
  expect(identityAcceptanceSql).not.toContain('p_token text');
});

if (runPgliteInThisProcess) test('atomically replaces an unexpired delivered invitation when resend is requested', async () => {
  const application = await submitApplication('resend-now@example.com', 'ResendNow');
  const review = await reviewApplication(application.application_id, application.row_version, 'UNDER_REVIEW');
  const approval = await approveApplication(application.application_id, review.row_version);
  const first = await issueInvitation(application.application_id, approval.row_version, 'first-resend-token-with-enough-entropy-0001');
  await markInvitationDelivery(first.invitation_id, first.row_version);

  const replacement = await issueInvitation(
    application.application_id, approval.row_version,
    'replacement-token-with-enough-entropy-0002', '2099-01-01T00:00:00Z', true,
  );
  expect(replacement).toMatchObject({ issued: true, status: 'PENDING' });
  const evidence = await db.query(`
    select id,status,revocation_reason from public.commercial_onboarding_invitations
    where application_id=$1 order by created_at,id
  `, [application.application_id]);
  expect(evidence.rows).toEqual([
    expect.objectContaining({ id: first.invitation_id, status: 'REVOKED', revocation_reason: 'REPLACED_BY_RESEND' }),
    expect.objectContaining({ id: replacement.invitation_id, status: 'PENDING' }),
  ]);
});

test('acceptance provisions the existing organisation identity chain without Personnel', () => {
  for (const table of [
    'organisations',
    'operating_locations',
    'internal_users',
    'memberships',
    'organisation_seat_allocations',
    'internal_user_seat_assignments',
    'membership_operating_location_assignments',
    'ftf_profiles',
  ]) {
    expect(sql).toContain(table);
  }
  expect(sql).not.toMatch(/insert\s+into\s+public\.personnel/i);
});

test('defines forward-only durable intake and provider delivery transitions', () => {
  expect(forwardSql).toContain('commercial_onboarding_application_requests');
  expect(forwardSql).toContain('ftf_submit_commercial_application_guarded');
  expect(forwardSql).toContain('ftf_mark_commercial_invitation_delivery');
  expect(forwardSql).toContain('INVITATION_DELIVERY_FAILED');
  expect(forwardSql).toContain('LEGACY_UNVERIFIED_DELIVERY');
  expect(forwardSql).toContain('location_confirmed_at');
  expect(forwardSql).not.toMatch(/ip_address|raw_ip/i);
});

if (runPgliteInThisProcess) {

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users(id uuid primary key, email text unique);
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
    create role anon;
    create role authenticated;
    create role service_role;
  `);

  const migrationDirectory = path.resolve(__dirname, '../../supabase/migrations');
  const migrationNames = [
    '20260801000000_production_beta_foundation.sql',
    '20260801006000_live_chain_access_prerequisites.sql',
    '20260801012000_legacy_runtime_dependencies.sql',
    '20260801013000_production_beta_identity_bootstrap.sql',
    '20260802024000_authoritative_personnel.sql',
    '20260802025000_authoritative_mission_weather.sql',
    '20260803010000_authoritative_mission_jsa.sql',
    '20260804060000_organisation_reference_sequences.sql',
    '20260804160000_platform_identity_assisted_support.sql',
    '20260809100000_commercial_onboarding_lifecycle.sql',
    forwardMigrationName,
    resendMigrationName,
    identityAcceptanceMigrationName,
  ];
  for (const migrationName of migrationNames) {
    if (migrationName === forwardMigrationName) {
      await db.exec(`
        insert into auth.users(id,email)
        values('${platformAuthUserId}','platform-reviewer@example.com');
        insert into public.platform_users(id,auth_user_id,email,display_name)
        values('${platformUserId}','${platformAuthUserId}','platform-reviewer@example.com','Platform Reviewer');
        insert into public.platform_user_roles(platform_user_id,role_id)
        select '${platformUserId}',id from public.platform_roles where code='PLATFORM_SUPER_ADMIN';

        insert into public.commercial_onboarding_applications(
          id,application_reference,business_name,intended_administrator_name,
          intended_administrator_email,intended_administrator_phone,submitted_payload,
          consent_version,status,approved_organisation_snapshot,approved_base_snapshot,
          reviewed_by_platform_user_id,reviewed_at
        ) values
        ('90000000-0000-4000-8000-000000000021','SC-APP-LEGACY01','Legacy Pending Air','Legacy Admin',
          'legacy-pending@example.com','0700000000','{}','legacy','APPROVED','{"name":"Legacy Pending Air"}',
          '{"name":"Legacy Base"}','${platformUserId}',now()),
        ('90000000-0000-4000-8000-000000000022','SC-APP-LEGACY02','Legacy Sent Air','Legacy Admin',
          'legacy-sent@example.com','0700000001','{}','legacy','APPROVED','{"name":"Legacy Sent Air"}',
          '{"name":"Legacy Base"}','${platformUserId}',now());

        insert into public.commercial_onboarding_invitations(
          id,application_id,token_hash,intended_administrator_email,
          approved_organisation_snapshot,approved_base_snapshot,status,
          issued_by_platform_user_id,expires_at,sent_at
        ) values
        ('${legacyPendingInvitationId}','90000000-0000-4000-8000-000000000021',repeat('a',64),
          'legacy-pending@example.com','{"name":"Legacy Pending Air"}','{"name":"Legacy Base"}',
          'PENDING','${platformUserId}','2099-01-01',null),
        ('${legacySentInvitationId}','90000000-0000-4000-8000-000000000022',repeat('b',64),
          'legacy-sent@example.com','{"name":"Legacy Sent Air"}','{"name":"Legacy Base"}',
          'SENT','${platformUserId}','2099-01-01',now());
      `);
    }
    await db.exec(fs.readFileSync(path.join(migrationDirectory, migrationName), 'utf8'));
  }
});

afterAll(async () => {
  if (db) await db.close();
});

test('creates forced-RLS lifecycle tables with service-role-only read access', async () => {
  const result = await db.query(`
    select c.relname, c.relrowsecurity, c.relforcerowsecurity,
      has_table_privilege('service_role', c.oid, 'select') as service_can_read,
      has_table_privilege('service_role', c.oid, 'insert') as service_can_insert,
      has_table_privilege('authenticated', c.oid, 'select') as authenticated_can_read
    from pg_class c
    where c.relnamespace='public'::regnamespace
      and c.relname in (
        'commercial_onboarding_applications',
        'commercial_onboarding_application_events',
        'commercial_onboarding_invitations',
        'commercial_onboarding_invitation_events',
        'commercial_onboarding_application_location_evidence',
        'commercial_onboarding_application_requests'
      )
    order by c.relname
  `);

  expect(result.rows).toHaveLength(6);
  for (const row of result.rows) {
    expect(row).toMatchObject({
      relrowsecurity: true,
      relforcerowsecurity: true,
      service_can_read: true,
      service_can_insert: false,
      authenticated_can_read: false,
    });
  }
});

test('adds only the four repository-controlled onboarding permissions', async () => {
  const result = await db.query(`
    select code from public.platform_permissions
    where code like 'platform.onboarding.%'
    order by code
  `);
  expect(result.rows.map(({ code }) => code)).toEqual([
    'platform.onboarding.application.read',
    'platform.onboarding.application.review',
    'platform.onboarding.invitation.issue',
    'platform.onboarding.invitation.revoke',
  ]);
});

test('quarantines every legacy active invitation before provider delivery is authoritative', async () => {
  const result = await db.query(`
    select i.id,i.status,i.delivery_protocol_version,i.delivery_status,i.delivery_provider,i.revocation_reason,
      (select count(*)::integer from public.commercial_onboarding_invitation_events e
        where e.invitation_id=i.id and e.event_type='LEGACY_UNVERIFIED_DELIVERY') as events,
      (select count(*)::integer from public.platform_audit_events a
        where a.entity_id=i.id and a.event_type='commercial_onboarding.legacy_unverified_delivery') as audits,
      (select count(*)::integer from public.platform_transactional_outbox o
        where o.aggregate_id=i.id and o.topic='commercial_onboarding.invitation.legacy_unverified_delivery') as outbox
    from public.commercial_onboarding_invitations i
    where i.id in ($1,$2)
    order by i.id
  `, [legacyPendingInvitationId, legacySentInvitationId]);
  expect(result.rows).toHaveLength(2);
  for (const row of result.rows) {
    expect(row).toMatchObject({
      status: 'REVOKED', delivery_protocol_version: 1,
      delivery_status: 'FAILED', delivery_provider: 'LEGACY_UNVERIFIED',
      revocation_reason: 'LEGACY_UNVERIFIED_DELIVERY', events: 1, audits: 1, outbox: 1,
    });
  }
});

test('keeps submission, approval, invitation preparation, and provider delivery as separate transitions', async () => {
  const before = await db.query('select count(*)::integer as count from public.organisations');
  const application = await submitApplication('first-admin@example.com', 'First');
  expect(application).toMatchObject({ status: 'SUBMITTED', row_version: 1 });

  const premature = await issueInvitation(
    application.application_id,
    application.row_version,
    'premature-token-with-enough-entropy-0001',
  );
  expect(premature).toMatchObject({ issued: false, code: 'approved_application_required' });

  const directApproval = await approveApplication(application.application_id, application.row_version);
  expect(directApproval).toMatchObject({
    reviewed: false,
    code: 'APPLICATION_REVIEW_REQUIRED',
  });

  const review = await reviewApplication(
    application.application_id,
    application.row_version,
    'UNDER_REVIEW',
  );
  expect(review).toMatchObject({ status: 'UNDER_REVIEW', row_version: 2 });
  const afterApproval = await db.query(`
    select
      (select count(*)::integer from public.organisations) as organisations,
      (select count(*)::integer from public.commercial_onboarding_invitations
        where application_id=$1) as invitations
  `, [application.application_id]);
  expect(afterApproval.rows[0]).toEqual({
    organisations: before.rows[0].count,
    invitations: 0,
  });

  const approval = await approveApplication(application.application_id, review.row_version);
  expect(approval).toMatchObject({ status: 'APPROVED', row_version: 3 });

  const rawToken = 'first-invitation-token-with-enough-entropy-0001';
  const invitation = await issueInvitation(
    application.application_id,
    approval.row_version,
    rawToken,
  );
  expect(invitation).toMatchObject({ status: 'PENDING', row_version: 1 });

  const pendingAcceptance = await db.query(
    'select public.ftf_accept_commercial_invitation($1,$2::uuid) as result',
    [rawToken, platformAuthUserId],
  );
  expect(pendingAcceptance.rows[0].result).toMatchObject({ accepted: false, code: 'INVITATION_DELIVERY_PENDING' });

  const delivered = await markInvitationDelivery(invitation.invitation_id, invitation.row_version);
  expect(delivered).toMatchObject({ delivered: true, status: 'SENT', row_version: 2 });

  const stored = await db.query(`
    select token_hash, intended_administrator_email,delivery_protocol_version,delivery_status,delivery_provider,
      approved_organisation_snapshot, approved_base_snapshot
    from public.commercial_onboarding_invitations where id=$1
  `, [invitation.invitation_id]);
  expect(stored.rows[0]).toMatchObject({
    token_hash: crypto.createHash('sha256').update(rawToken).digest('hex'),
    intended_administrator_email: 'first-admin@example.com',
    delivery_protocol_version: 2,
    delivery_status: 'SENT',
    delivery_provider: 'SUPABASE_AUTH',
  });
  expect(stored.rows[0].token_hash).not.toContain(rawToken);
  expect(stored.rows[0].approved_organisation_snapshot.name).toBe('Onboarding Air First');
  expect(stored.rows[0].approved_base_snapshot.name).toBe('Primary Base First');
});

test('persists confirmed Base evidence and durable, non-identifying request boundaries', async () => {
  const first = await submitGuardedApplication('guarded@example.com', 'Guarded', 'same-client');
  const retry = await submitGuardedApplication('guarded@example.com', 'Guarded', 'same-client');
  expect(retry).toMatchObject({ submitted: true, deduplicated: true, application_id: first.application_id });

  const evidence = await db.query(`
    select l.location_confirmed_at,l.address_source,l.latitude,l.longitude,
      r.request_fingerprint_hash,r.normalized_email_hash,r.payload_hash
    from public.commercial_onboarding_application_location_evidence l
    join public.commercial_onboarding_application_requests r on r.application_id=l.application_id
    where l.application_id=$1
  `, [first.application_id]);
  expect(evidence.rows).toHaveLength(1);
  expect(evidence.rows[0]).toMatchObject({
    address_source: 'ADDRESS_SEARCH', latitude: '-23.526', longitude: '148.162',
    request_fingerprint_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    normalized_email_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
  });
  expect(evidence.rows[0].location_confirmed_at).toBeTruthy();

  for (let index = 0; index < 5; index += 1) {
    const accepted = await submitGuardedApplication(`fingerprint-${index}@example.com`, `Fp${index}`, 'bounded-client');
    expect(accepted.submitted).toBe(true);
  }
  const fingerprintLimited = await submitGuardedApplication('fingerprint-six@example.com', 'FpSix', 'bounded-client');
  expect(fingerprintLimited).toMatchObject({ submitted: false, code: 'APPLICATION_RATE_LIMITED' });

  for (let index = 0; index < 3; index += 1) {
    const accepted = await submitGuardedApplication('email-limit@example.com', `Email${index}`, `email-client-${index}`);
    expect(accepted.submitted).toBe(true);
  }
  const emailLimited = await submitGuardedApplication('EMAIL-LIMIT@example.com', 'EmailThree', 'email-client-3');
  expect(emailLimited).toMatchObject({ submitted: false, code: 'APPLICATION_RATE_LIMITED' });
});

test('revokes prepared invitations when provider delivery fails and records authoritative evidence', async () => {
  const application = await submitApplication('delivery-failed@example.com', 'DeliveryFailed');
  const review = await reviewApplication(application.application_id, application.row_version, 'UNDER_REVIEW');
  const approval = await approveApplication(application.application_id, review.row_version);
  const prepared = await issueInvitation(application.application_id, approval.row_version, 'delivery-failed-token-with-enough-entropy-0001');
  const failed = await markInvitationDelivery(prepared.invitation_id, prepared.row_version, 'FAILED', 'Supabase Auth rejected delivery.');
  expect(failed).toMatchObject({ failed: true, status: 'REVOKED', row_version: 2 });

  const evidence = await db.query(`
    select i.status,i.delivery_status,i.revocation_reason,e.event_type
    from public.commercial_onboarding_invitations i
    join public.commercial_onboarding_invitation_events e on e.invitation_id=i.id
    where i.id=$1 and e.event_type='INVITATION_DELIVERY_FAILED'
  `, [prepared.invitation_id]);
  expect(evidence.rows[0]).toMatchObject({ status: 'REVOKED', delivery_status: 'FAILED', event_type: 'INVITATION_DELIVERY_FAILED' });
});

test('enforces optimistic review and revocation transitions', async () => {
  const application = await submitApplication('versions@example.com', 'Versions');
  const reviewConflict = await reviewApplication(application.application_id, 99, 'UNDER_REVIEW');
  expect(reviewConflict).toMatchObject({ conflict: true, current_version: 1 });

  const review = await reviewApplication(application.application_id, 1, 'UNDER_REVIEW');
  const approval = await approveApplication(application.application_id, review.row_version);
  const invitation = await issueInvitation(
    application.application_id,
    approval.row_version,
    'versioned-invitation-token-with-enough-entropy-0001',
  );
  const revokeConflict = await db.query(
    `select public.ftf_revoke_commercial_invitation(
      $1::uuid,$2::uuid,99,'No longer approved'
    ) as result`,
    [invitation.invitation_id, platformUserId],
  );
  expect(revokeConflict.rows[0].result).toMatchObject({ conflict: true, current_version: 1 });
});

test('rejects expired, revoked, wrong-email, Platform, and conflicting identities', async () => {
  const expired = await createIssuedInvitation(
    'expired@example.com', 'Expired', 'expired-invitation-token-with-enough-entropy-0001',
  );
  await db.exec(`
    insert into auth.users(id,email)
    values('91000000-0000-4000-8000-000000000001','expired@example.com');
  `);
  await db.query(`
    update public.commercial_onboarding_invitations
    set expires_at=now()-interval '1 minute' where id=$1
  `, [expired.invitation.invitation_id]);
  const expiredResult = await db.query(
    'select public.ftf_accept_commercial_invitation($1,$2::uuid) as result',
    [expired.invitation.raw_token, '91000000-0000-4000-8000-000000000001'],
  );
  expect(expiredResult.rows[0].result).toMatchObject({ accepted: false, code: 'INVITATION_EXPIRED' });

  const revoked = await createIssuedInvitation(
    'revoked@example.com', 'Revoked', 'revoked-invitation-token-with-enough-entropy-0001',
  );
  await db.exec(`
    insert into auth.users(id,email)
    values('91000000-0000-4000-8000-000000000002','revoked@example.com');
  `);
  const revokeResult = await db.query(
    `select public.ftf_revoke_commercial_invitation(
      $1::uuid,$2::uuid,$3::integer,'Application withdrawn'
    ) as result`,
    [revoked.invitation.invitation_id, platformUserId, revoked.invitation.row_version],
  );
  expect(revokeResult.rows[0].result).toMatchObject({
    status: 'REVOKED', row_version: revoked.invitation.row_version + 1,
  });
  const revokedAcceptance = await db.query(
    'select public.ftf_accept_commercial_invitation($1,$2::uuid) as result',
    [revoked.invitation.raw_token, '91000000-0000-4000-8000-000000000002'],
  );
  expect(revokedAcceptance.rows[0].result).toMatchObject({ accepted: false, code: 'INVITATION_REVOKED' });

  const wrongEmail = await createIssuedInvitation(
    'intended@example.com', 'WrongEmail', 'wrong-email-invitation-token-with-enough-entropy-0001',
  );
  await db.exec(`
    insert into auth.users(id,email)
    values('91000000-0000-4000-8000-000000000003','other@example.com');
  `);
  const wrongEmailAcceptance = await db.query(
    'select public.ftf_accept_commercial_invitation($1,$2::uuid) as result',
    [wrongEmail.invitation.raw_token, '91000000-0000-4000-8000-000000000003'],
  );
  expect(wrongEmailAcceptance.rows[0].result).toMatchObject({ accepted: false, code: 'INVITATION_EMAIL_MISMATCH' });

  const platformInvitation = await createIssuedInvitation(
    'customer-platform@example.com', 'Platform', 'platform-invitation-token-with-enough-entropy-0001',
  );
  await db.exec(`
    insert into auth.users(id,email)
    values('91000000-0000-4000-8000-000000000004','customer-platform@example.com');
    insert into public.platform_users(auth_user_id,email,display_name,is_active,archived_at)
    values('91000000-0000-4000-8000-000000000004','customer-platform@example.com',
      'Archived Platform Customer',false,now());
  `);
  const platformAcceptance = await db.query(
    'select public.ftf_accept_commercial_invitation($1,$2::uuid) as result',
    [platformInvitation.invitation.raw_token, '91000000-0000-4000-8000-000000000004'],
  );
  expect(platformAcceptance.rows[0].result).toMatchObject({ accepted: false, code: 'PLATFORM_IDENTITY_FORBIDDEN' });

  const conflictingInvitation = await createIssuedInvitation(
    'conflict@example.com', 'Conflict', 'conflict-invitation-token-with-enough-entropy-0001',
  );
  await db.exec(`
    insert into auth.users(id,email)
    values('91000000-0000-4000-8000-000000000005','conflict@example.com');
  `);
  await db.query(`select public.ftf_bootstrap_production_beta_organisation(
    '91000000-0000-4000-8000-000000000005',
    'Existing Organisation','Existing User','Existing Base',null,'Australia/Brisbane'
  )`);
  const beforeConflict = await db.query('select count(*)::integer as count from public.organisations');
  const conflictingAcceptance = await db.query(
    'select public.ftf_accept_commercial_invitation($1,$2::uuid) as result',
    [conflictingInvitation.invitation.raw_token, '91000000-0000-4000-8000-000000000005'],
  );
  expect(conflictingAcceptance.rows[0].result).toMatchObject({ accepted: false, code: 'ORGANISATION_IDENTITY_CONFLICT' });
  const afterConflict = await db.query('select count(*)::integer as count from public.organisations');
  expect(afterConflict.rows[0].count).toBe(beforeConflict.rows[0].count);
});

test('normalizes expired pending and sent invitations before issuing replacements', async () => {
  for (const [suffix, expiredStatus] of [['PendingReplacement', 'PENDING'], ['SentReplacement', 'SENT']]) {
    const issued = await createIssuedInvitation(
      `${suffix.toLowerCase()}@example.com`,
      suffix,
      `${suffix.toLowerCase()}-original-token-with-enough-entropy-0001`,
    );
    await db.query(`
      update public.commercial_onboarding_invitations
      set status=$2,expires_at=now()-interval '1 minute'
      where id=$1
    `, [issued.invitation.invitation_id, expiredStatus]);

    const replacement = await issueInvitation(
      issued.application.application_id,
      issued.approval.row_version,
      `${suffix.toLowerCase()}-replacement-token-with-enough-entropy-0002`,
    );
    expect(replacement).toMatchObject({ issued: true, status: 'PENDING' });

    const evidence = await db.query(`
      select
        (select status from public.commercial_onboarding_invitations where id=$1) as old_status,
        (select count(*)::integer from public.commercial_onboarding_invitations
          where application_id=$2 and status in ('PENDING','SENT')) as active_invitations,
        (select from_status from public.commercial_onboarding_invitation_events
          where invitation_id=$1 and event_type='INVITATION_EXPIRED') as expired_from_status
    `, [issued.invitation.invitation_id, issued.application.application_id]);
    expect(evidence.rows[0]).toEqual({
      old_status: 'EXPIRED',
      active_invitations: 1,
      expired_from_status: expiredStatus,
    });
  }
});

test('provisions one complete organisation identity atomically and is idempotent for the same user', async () => {
  const authUserId = '92000000-0000-4000-8000-000000000001';
  const issued = await createIssuedInvitation(
    'accepted@example.com', 'Accepted', 'accepted-invitation-token-with-enough-entropy-0001',
  );
  await db.exec(`insert into auth.users(id,email) values('${authUserId}','accepted@example.com')`);

  const storedHashReplay = await db.query(
    'select public.ftf_accept_commercial_invitation($1,$2::uuid) as result',
    [issued.invitation.token_hash, authUserId],
  );
  expect(storedHashReplay.rows[0].result).toMatchObject({
    accepted: false,
    code: 'INVITATION_INVALID',
  });

  const accepted = await db.query(
    'select public.ftf_accept_commercial_invitation($1,$2::uuid) as result',
    [issued.invitation.raw_token, authUserId],
  );
  expect(accepted.rows[0].result).toMatchObject({ accepted: true, already_provisioned: false });
  const organisationId = accepted.rows[0].result.organisation_id;
  expect(organisationId).toBeTruthy();

  const replay = await db.query(
    'select public.ftf_accept_commercial_invitation($1,$2::uuid) as result',
    [issued.invitation.raw_token, authUserId],
  );
  expect(replay.rows[0].result).toMatchObject({
    accepted: true,
    already_provisioned: true,
    organisation_id: organisationId,
  });

  const counts = await db.query(`
    select
      (select count(*)::integer from public.organisations where id=$1) as organisations,
      (select count(*)::integer from public.operating_locations where organisation_id=$1) as bases,
      (select count(*)::integer from public.internal_users where organisation_id=$1 and auth_user_id=$2) as internal_users,
      (select count(*)::integer from public.memberships where organisation_id=$1) as memberships,
      (select count(*)::integer from public.roles where organisation_id=$1 and code='admin' and name='Organisation Administrator') as administrator_roles,
      (select count(*)::integer from public.organisation_seat_allocations where organisation_id=$1 and allocated_seats=1) as allocations,
      (select count(*)::integer from public.internal_user_seat_assignments where organisation_id=$1 and status='active') as seat_assignments,
      (select count(*)::integer from public.membership_operating_location_assignments where organisation_id=$1 and is_active) as base_assignments,
      (select count(*)::integer from public.ftf_profiles where tenant_id=$1 and user_id=$2 and role='admin') as profiles,
      (select count(*)::integer from public.personnel where organisation_id=$1) as personnel,
      (select count(*)::integer from public.audit_events where organisation_id=$1 and event_type='commercial_onboarding.accepted') as audits,
      (select count(*)::integer from public.transactional_outbox where organisation_id=$1 and topic='commercial_onboarding.accepted') as outbox,
      (select count(*)::integer from public.organisation_support_policy_versions where organisation_id=$1) as support_policies,
      (select count(*)::integer from public.organisation_jsa_policies where organisation_id=$1) as jsa_policies,
      (select count(*)::integer from public.organisation_weather_policies where organisation_id=$1) as weather_policies,
      (select reference_prefix from public.organisations where id=$1) as reference_prefix
  `, [organisationId, authUserId]);
  expect(counts.rows[0]).toMatchObject({
    organisations: 1,
    bases: 1,
    internal_users: 1,
    memberships: 1,
    administrator_roles: 1,
    allocations: 1,
    seat_assignments: 1,
    base_assignments: 1,
    profiles: 1,
    personnel: 0,
    audits: 1,
    outbox: 1,
    support_policies: 1,
    jsa_policies: 1,
    weather_policies: 1,
  });
  expect(counts.rows[0].reference_prefix).toMatch(/^[A-Z0-9]{2,8}$/);

  const acceptedEvent = await db.query(`
    select from_status,to_status
    from public.commercial_onboarding_invitation_events
    where invitation_id=$1 and event_type='INVITATION_ACCEPTED'
  `, [issued.invitation.invitation_id]);
  expect(acceptedEvent.rows[0]).toEqual({ from_status: 'SENT', to_status: 'ACCEPTED' });

  const forbiddenReissue = await issueInvitation(
    issued.application.application_id,
    issued.approval.row_version,
    'accepted-application-reissue-token-with-enough-entropy-0001',
  );
  expect(forbiddenReissue).toMatchObject({
    issued: false,
    code: 'APPLICATION_ALREADY_ACCEPTED',
  });

  const differentUser = '92000000-0000-4000-8000-000000000002';
  await db.exec(`insert into auth.users(id,email) values('${differentUser}','replay@example.com')`);
  const replayByDifferentUser = await db.query(
    'select public.ftf_accept_commercial_invitation($1,$2::uuid) as result',
    [issued.invitation.raw_token, differentUser],
  );
  expect(replayByDifferentUser.rows[0].result).toMatchObject({ accepted: false, code: 'INVITATION_ALREADY_ACCEPTED' });
});

test('preflights invitation state and identity without mutating expected denials', async () => {
  const eligibleAuthUserId = '93000000-0000-4000-8000-000000000001';
  const wrongAuthUserId = '93000000-0000-4000-8000-000000000002';
  const eligible = await createIssuedInvitation(
    'preflight-eligible@example.com', 'PreflightEligible', 'preflight-eligible-token-with-enough-entropy-0001',
  );
  await db.exec(`
    insert into auth.users(id,email) values
      ('${eligibleAuthUserId}','preflight-eligible@example.com'),
      ('${wrongAuthUserId}','different@example.com');
  `);

  const allowed = await db.query(
    'select public.ftf_preflight_commercial_invitation($1::uuid,$2::uuid) as result',
    [eligible.invitation.invitation_id, eligibleAuthUserId],
  );
  expect(allowed.rows[0].result).toMatchObject({ eligible: true, invitation_id: eligible.invitation.invitation_id });

  const wrongEmail = await db.query(
    'select public.ftf_preflight_commercial_invitation($1::uuid,$2::uuid) as result',
    [eligible.invitation.invitation_id, wrongAuthUserId],
  );
  expect(wrongEmail.rows[0].result).toMatchObject({ eligible: false, code: 'INVITATION_EMAIL_MISMATCH' });

  const platformInvitation = await createIssuedInvitation(
    'platform-reviewer@example.com', 'PreflightPlatform', 'preflight-platform-token-with-enough-entropy-0001',
  );
  const platform = await db.query(
    'select public.ftf_preflight_commercial_invitation($1::uuid,$2::uuid) as result',
    [platformInvitation.invitation.invitation_id, platformAuthUserId],
  );
  expect(platform.rows[0].result).toMatchObject({ eligible: false, code: 'PLATFORM_IDENTITY_FORBIDDEN' });

  const conflictAuthUserId = '93000000-0000-4000-8000-000000000003';
  const conflict = await createIssuedInvitation(
    'preflight-conflict@example.com', 'PreflightConflict', 'preflight-conflict-token-with-enough-entropy-0001',
  );
  await db.exec(`insert into auth.users(id,email) values('${conflictAuthUserId}','preflight-conflict@example.com')`);
  await db.query(
    `select public.ftf_bootstrap_production_beta_organisation(
      $1::uuid,'Existing Organisation','Existing User','Existing Base',null,'Australia/Brisbane'
    )`,
    [conflictAuthUserId],
  );
  const conflictingMembership = await db.query(
    'select public.ftf_preflight_commercial_invitation($1::uuid,$2::uuid) as result',
    [conflict.invitation.invitation_id, conflictAuthUserId],
  );
  expect(conflictingMembership.rows[0].result).toMatchObject({ eligible: false, code: 'ORGANISATION_IDENTITY_CONFLICT' });

  const revoked = await createIssuedInvitation(
    'preflight-revoked@example.com', 'PreflightRevoked', 'preflight-revoked-token-with-enough-entropy-0001',
  );
  const revokedResult = await db.query(
    `select public.ftf_revoke_commercial_invitation(
      $1::uuid,$2::uuid,$3::integer,'Reviewer revoked invitation.'
    ) as result`,
    [revoked.invitation.invitation_id, platformUserId, revoked.invitation.row_version],
  );
  expect(revokedResult.rows[0].result).toMatchObject({ revoked: true });
  const revokedAuthUserId = '93000000-0000-4000-8000-000000000004';
  await db.exec(`insert into auth.users(id,email) values('${revokedAuthUserId}','preflight-revoked@example.com')`);
  const revokedPreflight = await db.query(
    'select public.ftf_preflight_commercial_invitation($1::uuid,$2::uuid) as result',
    [revoked.invitation.invitation_id, revokedAuthUserId],
  );
  expect(revokedPreflight.rows[0].result).toMatchObject({ eligible: false, code: 'INVITATION_REVOKED' });

  const expired = await createIssuedInvitation(
    'preflight-expired@example.com', 'PreflightExpired', 'preflight-expired-token-with-enough-entropy-0001',
  );
  const expiredAuthUserId = '93000000-0000-4000-8000-000000000005';
  await db.exec(`insert into auth.users(id,email) values('${expiredAuthUserId}','preflight-expired@example.com')`);
  await db.query('update public.commercial_onboarding_invitations set expires_at=now()-interval \'1 minute\' where id=$1', [expired.invitation.invitation_id]);
  const before = await db.query(
    `select status,row_version,(select count(*)::integer from public.commercial_onboarding_invitation_events where invitation_id=$1) as events
     from public.commercial_onboarding_invitations where id=$1`,
    [expired.invitation.invitation_id],
  );
  const expiredPreflight = await db.query(
    'select public.ftf_preflight_commercial_invitation($1::uuid,$2::uuid) as result',
    [expired.invitation.invitation_id, expiredAuthUserId],
  );
  const after = await db.query(
    `select status,row_version,(select count(*)::integer from public.commercial_onboarding_invitation_events where invitation_id=$1) as events
     from public.commercial_onboarding_invitations where id=$1`,
    [expired.invitation.invitation_id],
  );
  expect(expiredPreflight.rows[0].result).toMatchObject({ eligible: false, code: 'INVITATION_EXPIRED' });
  expect(after.rows[0]).toEqual(before.rows[0]);
});

test('requires one unambiguous active invitation for the authenticated email', async () => {
  const authUserId = '94000000-0000-4000-8000-000000000001';
  const first = await createIssuedInvitation(
    'ambiguous@example.com', 'AmbiguousOne', 'ambiguous-one-token-with-enough-entropy-0001',
  );
  await createIssuedInvitation(
    'ambiguous@example.com', 'AmbiguousTwo', 'ambiguous-two-token-with-enough-entropy-0001',
  );
  await db.exec(`insert into auth.users(id,email) values('${authUserId}','ambiguous@example.com')`);

  const result = await db.query(
    'select public.ftf_preflight_commercial_invitation($1::uuid,$2::uuid) as result',
    [first.invitation.invitation_id, authUserId],
  );
  expect(result.rows[0].result).toMatchObject({ eligible: false, code: 'INVITATION_AMBIGUOUS' });
});

test('accepts by public invitation identifier, rejects another email, and emits no raw bearer evidence', async () => {
  const authUserId = '95000000-0000-4000-8000-000000000001';
  const otherAuthUserId = '95000000-0000-4000-8000-000000000002';
  const rawBearer = 'identifier-acceptance-raw-token-with-enough-entropy-0001';
  const issued = await createIssuedInvitation('identifier@example.com', 'Identifier', rawBearer);
  await db.exec(`
    insert into auth.users(id,email) values
      ('${authUserId}','identifier@example.com'),
      ('${otherAuthUserId}','identifier-other@example.com');
  `);

  const otherEmail = await db.query(
    'select public.ftf_accept_commercial_invitation_by_id($1::uuid,$2::uuid) as result',
    [issued.invitation.invitation_id, otherAuthUserId],
  );
  expect(otherEmail.rows[0].result).toMatchObject({ accepted: false, code: 'INVITATION_EMAIL_MISMATCH' });

  const accepted = await db.query(
    'select public.ftf_accept_commercial_invitation_by_id($1::uuid,$2::uuid) as result',
    [issued.invitation.invitation_id, authUserId],
  );
  expect(accepted.rows[0].result).toMatchObject({ accepted: true, already_provisioned: false, invitation_id: issued.invitation.invitation_id });

  const replay = await db.query(
    'select public.ftf_accept_commercial_invitation_by_id($1::uuid,$2::uuid) as result',
    [issued.invitation.invitation_id, authUserId],
  );
  expect(replay.rows[0].result).toMatchObject({ accepted: true, already_provisioned: true });

  const evidence = await db.query(`
    select concat_ws(' ',
      coalesce((select jsonb_agg(event_payload)::text from public.commercial_onboarding_invitation_events where invitation_id=$1),''),
      coalesce((select jsonb_agg(event_payload)::text from public.platform_audit_events where entity_id=$1),''),
      coalesce((select jsonb_agg(payload)::text from public.platform_transactional_outbox where aggregate_id=$1),''),
      coalesce((select jsonb_agg(event_payload)::text from public.audit_events where entity_id=$1),''),
      coalesce((select jsonb_agg(payload)::text from public.transactional_outbox where aggregate_id=$1),'')) as recorded
  `, [issued.invitation.invitation_id]);
  expect(evidence.rows[0].recorded).not.toContain(rawBearer);
});

test('keeps application events, invitation events, and consumed invitations immutable', async () => {
  const acceptedInvitation = await db.query(`
    select id,application_id from public.commercial_onboarding_invitations
    where status='ACCEPTED' order by accepted_at desc limit 1
  `);
  const { id: invitationId, application_id: applicationId } = acceptedInvitation.rows[0];

  await expect(db.query(`
    update public.commercial_onboarding_application_events
    set event_payload='{}'::jsonb where application_id=$1
  `, [applicationId])).rejects.toThrow(/append-only/);
  await expect(db.query(`
    delete from public.commercial_onboarding_invitation_events where invitation_id=$1
  `, [invitationId])).rejects.toThrow(/append-only/);
  await expect(db.query(`
    update public.commercial_onboarding_invitations set issuance_notes='changed' where id=$1
  `, [invitationId])).rejects.toThrow(/consumed invitation evidence is immutable/);
  await expect(db.query(`
    delete from public.commercial_onboarding_invitations where id=$1
  `, [invitationId])).rejects.toThrow(/consumed invitation evidence is immutable/);
});

} else {
  test('passes the real PostgreSQL lifecycle and hostile-path contract', () => {
    try {
      execFileSync(process.execPath, [__filename], {
        cwd: path.resolve(__dirname, '../..'),
        env: {
          ...process.env,
          COMMERCIAL_ONBOARDING_PGLITE_CHILD: '1',
        },
        stdio: 'pipe',
      });
    } catch (error) {
      const output = `${error.stdout || ''}${error.stderr || ''}`;
      throw new Error(output || error.message);
    }
  });
}

if (runPgliteInThisProcess) {
  (async () => {
    try {
      for (const setup of pureNodeBeforeAll) await setup();
      for (const { name, run } of pureNodeTests) {
        await run();
        process.stdout.write(`PASS ${name}\n`);
      }
    } finally {
      for (const cleanup of pureNodeAfterAll) await cleanup();
    }
  })().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
