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

async function approveApplication(applicationId, rowVersion = 1) {
  const result = await db.query(
    `select public.ftf_review_commercial_application(
      $1::uuid, $2::uuid, $3::integer, 'APPROVE', 'Approved for invitation.'
    ) as result`,
    [applicationId, platformUserId, rowVersion],
  );
  return result.rows[0].result;
}

async function issueInvitation(applicationId, rowVersion, rawToken, expiresAt = '2099-01-01T00:00:00Z') {
  const result = await db.query(
    `select public.ftf_issue_commercial_invitation(
      $1::uuid, $2::uuid, $3::integer, $4::text, 'Initial invitation', $5::timestamptz
    ) as result`,
    [applicationId, platformUserId, rowVersion, rawToken, expiresAt],
  );
  return result.rows[0].result;
}

async function createIssuedInvitation(email, suffix, rawToken) {
  const application = await submitApplication(email, suffix);
  const approval = await approveApplication(application.application_id, application.row_version);
  const invitation = await issueInvitation(application.application_id, approval.row_version, rawToken);
  invitation.token_hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { application, approval, invitation };
}

test('separates application approval from invitation creation', () => {
  expect(sql).toContain('commercial_onboarding_applications');
  expect(sql).toContain('commercial_onboarding_application_events');
  expect(sql).toContain('commercial_onboarding_invitations');
  expect(sql).toContain('commercial_onboarding_invitation_events');
  expect(sql).toContain("status = 'APPROVED'");
  expect(sql).toContain('approved_application_required');
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
  ];
  for (const migrationName of migrationNames) {
    await db.exec(fs.readFileSync(path.join(migrationDirectory, migrationName), 'utf8'));
  }

  await db.exec(`
    insert into auth.users(id,email)
    values('${platformAuthUserId}','platform-reviewer@example.com');
    insert into public.platform_users(id,auth_user_id,email,display_name)
    values('${platformUserId}','${platformAuthUserId}','platform-reviewer@example.com','Platform Reviewer');
    insert into public.platform_user_roles(platform_user_id,role_id)
    select '${platformUserId}',id from public.platform_roles where code='PLATFORM_SUPER_ADMIN';
  `);
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
        'commercial_onboarding_invitation_events'
      )
    order by c.relname
  `);

  expect(result.rows).toHaveLength(4);
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

test('keeps submission, approval, and invitation issuance as separate transitions', async () => {
  const before = await db.query('select count(*)::integer as count from public.organisations');
  const application = await submitApplication('first-admin@example.com', 'First');
  expect(application).toMatchObject({ status: 'SUBMITTED', row_version: 1 });

  const premature = await issueInvitation(
    application.application_id,
    application.row_version,
    'premature-token-with-enough-entropy-0001',
  );
  expect(premature).toMatchObject({ issued: false, code: 'approved_application_required' });

  const approval = await approveApplication(application.application_id, application.row_version);
  expect(approval).toMatchObject({ status: 'APPROVED', row_version: 2 });
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

  const rawToken = 'first-invitation-token-with-enough-entropy-0001';
  const invitation = await issueInvitation(
    application.application_id,
    approval.row_version,
    rawToken,
  );
  expect(invitation).toMatchObject({ status: 'SENT', row_version: 1 });

  const stored = await db.query(`
    select token_hash, intended_administrator_email,
      approved_organisation_snapshot, approved_base_snapshot
    from public.commercial_onboarding_invitations where id=$1
  `, [invitation.invitation_id]);
  expect(stored.rows[0]).toMatchObject({
    token_hash: crypto.createHash('sha256').update(rawToken).digest('hex'),
    intended_administrator_email: 'first-admin@example.com',
  });
  expect(stored.rows[0].token_hash).not.toContain(rawToken);
  expect(stored.rows[0].approved_organisation_snapshot.name).toBe('Onboarding Air First');
  expect(stored.rows[0].approved_base_snapshot.name).toBe('Primary Base First');
});

test('enforces optimistic review and revocation transitions', async () => {
  const application = await submitApplication('versions@example.com', 'Versions');
  const reviewConflict = await approveApplication(application.application_id, 99);
  expect(reviewConflict).toMatchObject({ conflict: true, current_version: 1 });

  const approval = await approveApplication(application.application_id, 1);
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
    [expired.invitation.token_hash, '91000000-0000-4000-8000-000000000001'],
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
      $1::uuid,$2::uuid,1,'Application withdrawn'
    ) as result`,
    [revoked.invitation.invitation_id, platformUserId],
  );
  expect(revokeResult.rows[0].result).toMatchObject({ status: 'REVOKED', row_version: 2 });
  const revokedAcceptance = await db.query(
    'select public.ftf_accept_commercial_invitation($1,$2::uuid) as result',
    [revoked.invitation.token_hash, '91000000-0000-4000-8000-000000000002'],
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
    [wrongEmail.invitation.token_hash, '91000000-0000-4000-8000-000000000003'],
  );
  expect(wrongEmailAcceptance.rows[0].result).toMatchObject({ accepted: false, code: 'INVITATION_EMAIL_MISMATCH' });

  const platformInvitation = await createIssuedInvitation(
    'customer-platform@example.com', 'Platform', 'platform-invitation-token-with-enough-entropy-0001',
  );
  await db.exec(`
    insert into auth.users(id,email)
    values('91000000-0000-4000-8000-000000000004','customer-platform@example.com');
    insert into public.platform_users(auth_user_id,email,display_name)
    values('91000000-0000-4000-8000-000000000004','customer-platform@example.com','Platform Customer');
  `);
  const platformAcceptance = await db.query(
    'select public.ftf_accept_commercial_invitation($1,$2::uuid) as result',
    [platformInvitation.invitation.token_hash, '91000000-0000-4000-8000-000000000004'],
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
    [conflictingInvitation.invitation.token_hash, '91000000-0000-4000-8000-000000000005'],
  );
  expect(conflictingAcceptance.rows[0].result).toMatchObject({ accepted: false, code: 'ORGANISATION_IDENTITY_CONFLICT' });
  const afterConflict = await db.query('select count(*)::integer as count from public.organisations');
  expect(afterConflict.rows[0].count).toBe(beforeConflict.rows[0].count);
});

test('provisions one complete organisation identity atomically and is idempotent for the same user', async () => {
  const authUserId = '92000000-0000-4000-8000-000000000001';
  const issued = await createIssuedInvitation(
    'accepted@example.com', 'Accepted', 'accepted-invitation-token-with-enough-entropy-0001',
  );
  await db.exec(`insert into auth.users(id,email) values('${authUserId}','accepted@example.com')`);

  const accepted = await db.query(
    'select public.ftf_accept_commercial_invitation($1,$2::uuid) as result',
    [issued.invitation.token_hash, authUserId],
  );
  expect(accepted.rows[0].result).toMatchObject({ accepted: true, already_provisioned: false });
  const organisationId = accepted.rows[0].result.organisation_id;
  expect(organisationId).toBeTruthy();

  const replay = await db.query(
    'select public.ftf_accept_commercial_invitation($1,$2::uuid) as result',
    [issued.invitation.token_hash, authUserId],
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

  const differentUser = '92000000-0000-4000-8000-000000000002';
  await db.exec(`insert into auth.users(id,email) values('${differentUser}','replay@example.com')`);
  const replayByDifferentUser = await db.query(
    'select public.ftf_accept_commercial_invitation($1,$2::uuid) as result',
    [issued.invitation.token_hash, differentUser],
  );
  expect(replayByDifferentUser.rows[0].result).toMatchObject({ accepted: false, code: 'INVITATION_ALREADY_ACCEPTED' });
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
