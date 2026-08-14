const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const CURRENT = {
  applicationId: 'a865f157-c334-447e-aa1e-661ee0db7b85',
  invitationId: '29b9b342-335e-4959-9402-4cb4e1090427',
  organisationId: '961a4354-40f5-479d-a577-74839596ad14',
  authUserId: 'ef06368d-6981-4fa6-8317-657bd6418f32',
  internalUserId: '2dd42623-5095-47ef-a46e-ace0f684dcf4',
  membershipId: 'd8a1ab9e-227b-46a6-b4b4-ea73c2d520be',
  locationId: '5afd5961-be47-4504-89bf-a51e737f3cf7',
};

const controlledBlock = () => {
  const sql = read('scripts/productionStateIntegrityReconciliation.sql');
  const match = sql.match(/-- BEGIN CONTROLLED ACCEPTANCE INTEGRITY\n([\s\S]*?)\n-- END CONTROLLED ACCEPTANCE INTEGRITY/);
  if (!match) throw new Error('Controlled acceptance integrity block is not independently testable.');
  return match[1];
};

const uuid = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const marker = (value) => `SC ACCEPTANCE — 2026-08-14T00-00-${String(value).padStart(2, '0')}-000Z ONBOARDING`;
let seedSequence = 6000;

const schemaSql = `
    create table commercial_onboarding_applications(
      id uuid primary key, application_reference text not null, business_name text not null,
      status text not null, row_version integer not null
    );
    create table commercial_onboarding_application_events(
      id uuid primary key, application_id uuid not null, to_status text not null, created_at timestamptz not null
    );
    create table commercial_onboarding_invitations(
      id uuid primary key, application_id uuid not null, status text not null, row_version integer not null,
      accepted_by_auth_user_id uuid, resulting_organisation_id uuid, resulting_internal_user_id uuid,
      resulting_membership_id uuid, resulting_operating_location_id uuid
    );
    create table commercial_onboarding_invitation_events(
      id uuid primary key, invitation_id uuid not null, application_id uuid not null,
      to_status text not null, created_at timestamptz not null
    );
    create table organisations(id uuid primary key, name text not null, archived_at timestamptz);
    create table internal_users(id uuid primary key, organisation_id uuid, auth_user_id uuid, is_active boolean, archived_at timestamptz);
    create table memberships(id uuid primary key, organisation_id uuid, internal_user_id uuid, is_active boolean, archived_at timestamptz);
    create table operating_locations(id uuid primary key, organisation_id uuid, archived_at timestamptz);
    create table organisation_seat_allocations(id uuid primary key, organisation_id uuid, archived_at timestamptz);
    create table internal_user_seat_assignments(
      id uuid primary key, organisation_id uuid, internal_user_id uuid, membership_id uuid,
      organisation_seat_allocation_id uuid, status text, archived_at timestamptz
    );
    create table membership_operating_location_assignments(
      id uuid primary key, organisation_id uuid, membership_id uuid, operating_location_id uuid,
      is_active boolean, archived_at timestamptz
    );
    create table platform_users(id uuid primary key, auth_user_id uuid, archived_at timestamptz);
    create table personnel(id uuid primary key, organisation_id uuid, archived_at timestamptz);
    create table ftf_profiles(tenant_id uuid, user_id uuid);
    create table ftf_store(tenant_id uuid, collection text, record_id text);
    create table clients(id uuid primary key, organisation_id uuid, archived_at timestamptz);
    create table properties(id uuid primary key, organisation_id uuid, archived_at timestamptz);
    create table fields(id uuid primary key, organisation_id uuid, archived_at timestamptz);
    create table jobs(id uuid primary key, organisation_id uuid, archived_at timestamptz);
    create table missions(id uuid primary key, organisation_id uuid, archived_at timestamptz);
    create table audit_events(
      id uuid primary key, organisation_id uuid, event_type text, entity_type text,
      entity_id uuid, event_payload jsonb not null default '{}'::jsonb
    );
    create table transactional_outbox(
      id uuid primary key, organisation_id uuid, topic text, aggregate_type text,
      aggregate_id uuid, payload jsonb not null default '{}'::jsonb
    );
`;

function seedApplicationSql({
  applicationId, invitationId, applicationReference, businessName,
  invitationStatus = 'SENT',
}) {
  const applicationEvents = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].map((status, index) =>
    `('${uuid(seedSequence += 1)}','${applicationId}','${status}','2026-08-14T00:00:0${index}Z')`).join(',');
  const invitationVersion = invitationStatus === 'ACCEPTED' ? 3 : 2;
  const statuses = invitationStatus === 'ACCEPTED' ? ['PENDING', 'SENT', 'ACCEPTED'] : ['PENDING', 'SENT'];
  const invitationEvents = statuses.map((status, index) =>
    `('${uuid(seedSequence += 1)}','${invitationId}','${applicationId}','${status}','2026-08-14T00:01:0${index}Z')`).join(',');
  return `
    insert into commercial_onboarding_applications values('${applicationId}','${applicationReference}','${businessName}','APPROVED',3);
    insert into commercial_onboarding_application_events values ${applicationEvents};
    insert into commercial_onboarding_invitations(id,application_id,status,row_version)
      values('${invitationId}','${applicationId}','${invitationStatus}',${invitationVersion});
    insert into commercial_onboarding_invitation_events values ${invitationEvents};
  `;
}

function seedAcceptedSql(values) {
  const seatAllocationId = uuid(seedSequence += 1);
  const seatAssignmentId = uuid(seedSequence += 1);
  const baseAssignmentId = uuid(seedSequence += 1);
  return `${seedApplicationSql({ ...values, invitationStatus: 'ACCEPTED' })}
    update commercial_onboarding_invitations set
      accepted_by_auth_user_id='${values.authUserId}',resulting_organisation_id='${values.organisationId}',
      resulting_internal_user_id='${values.internalUserId}',resulting_membership_id='${values.membershipId}',
      resulting_operating_location_id='${values.locationId}' where id='${values.invitationId}';
    insert into organisations values('${values.organisationId}','${values.businessName}',${values.archived ? "'2026-08-14T01:00:00Z'" : 'null'});
    insert into audit_events values(
      '${uuid(seedSequence += 1)}','${values.organisationId}','commercial_onboarding.accepted',
      'commercial_onboarding_invitation','${values.invitationId}','{}');
    ${values.archived ? `
      insert into internal_users values('${values.internalUserId}','${values.organisationId}','${values.authUserId}',false,'2026-08-14T01:00:00Z');
      insert into memberships values('${values.membershipId}','${values.organisationId}','${values.internalUserId}',false,'2026-08-14T01:00:00Z');
      insert into operating_locations values('${values.locationId}','${values.organisationId}','2026-08-14T01:00:00Z');
      insert into organisation_seat_allocations values('${seatAllocationId}','${values.organisationId}','2026-08-14T01:00:00Z');
      insert into internal_user_seat_assignments values('${seatAssignmentId}','${values.organisationId}','${values.internalUserId}','${values.membershipId}','${seatAllocationId}','revoked','2026-08-14T01:00:00Z');
      insert into membership_operating_location_assignments values('${baseAssignmentId}','${values.organisationId}','${values.membershipId}','${values.locationId}',false,'2026-08-14T01:00:00Z');
      insert into audit_events values(
        '${uuid(seedSequence += 1)}','${values.organisationId}','commercial_onboarding.acceptance_archived',
        'organisation','${values.organisationId}',
        '{"applicationId":"${values.applicationId}","invitationId":"${values.invitationId}"}');
      insert into transactional_outbox values(
        '${uuid(seedSequence += 1)}','${values.organisationId}','commercial_onboarding.acceptance_archived',
        'organisation','${values.organisationId}',
        '{"organisationId":"${values.organisationId}","applicationId":"${values.applicationId}","invitationId":"${values.invitationId}"}');
    ` : ''}
  `;
}

const currentSql = () => seedAcceptedSql({
  applicationId: CURRENT.applicationId, invitationId: CURRENT.invitationId,
  organisationId: CURRENT.organisationId, authUserId: CURRENT.authUserId,
  internalUserId: CURRENT.internalUserId, membershipId: CURRENT.membershipId,
  locationId: CURRENT.locationId, applicationReference: 'SC-APP-FD04165C43EA',
  businessName: marker(1), archived: true,
});

function runIntegrity(setupSql = '', { current = true } = {}) {
  const child = spawnSync(process.execPath, ['-e', `
    const { PGlite } = require('@electric-sql/pglite');
    (async () => {
      const db = new PGlite();
      await db.exec(process.env.SCHEMA_SQL);
      await db.exec(process.env.SEED_SQL);
      await db.exec(process.env.CONTRACT_SQL);
      await db.close();
    })().catch((error) => { process.stderr.write(String(error?.message || error)); process.exit(1); });
  `], {
    cwd: root,
    env: {
      ...process.env,
      SCHEMA_SQL: schemaSql,
      SEED_SQL: `${current ? currentSql() : ''}\n${setupSql}`,
      CONTRACT_SQL: controlledBlock(),
    },
    encoding: 'utf8',
  });
  return child;
}

function expectIntegrityPass(setupSql = '') {
  const result = runIntegrity(setupSql);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
}

function expectIntegrityFailure(setupSql = '', options) {
  const result = runIntegrity(setupSql, options);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('PRODUCTION_STATE_INTEGRITY: controlled evidence mismatch');
}

describe('read-only Production state integrity reconciliation', () => {
  test('binds the retained controlled onboarding identity chain and migration head', () => {
    const sql = read('scripts/productionStateIntegrityReconciliation.sql');
    for (const value of [
      '20260813140000',
      '961a4354-40f5-479d-a577-74839596ad14',
      'a865f157-c334-447e-aa1e-661ee0db7b85',
      '29b9b342-335e-4959-9402-4cb4e1090427',
      'ef06368d-6981-4fa6-8317-657bd6418f32',
      '2dd42623-5095-47ef-a46e-ace0f684dcf4',
      'd8a1ab9e-227b-46a6-b4b4-ea73c2d520be',
      '5afd5961-be47-4504-89bf-a51e737f3cf7',
      'eca3b587-bca1-40da-b91b-fb0eef7555ea',
      'ca153101-1ce5-451e-b21d-95133434a701',
      'd6b51071-817d-4b58-bf14-780d7d9d8fd8',
    ]) expect(sql).toContain(value);
    expect(sql).toMatch(/max\(version\)[\s\S]*20260813140000/);
    expect(sql).toMatch(/version>'20260813140000'/);
  });

  test('proves frozen genuine-data counts and digests without mutation', () => {
    const sql = read('scripts/productionStateIntegrityReconciliation.sql');
    for (const [count, digest] of [
      [27, '361ec0ed3203caf8f71f5a0e580fb98f'],
      [23, '8481208a52acf250dcb45d8ddd954297'],
      [20, 'ac6d293bc50227acac86e26feaaac141'],
      [18, 'e2c080779ebb0c3eda4f6ba63eb7a712'],
      [18, '341a30e6f87afdcaaab99d8622c95ba8'],
      [7, '7544fdbf2a4820630183588eaa0d542a'],
      [3, 'ea98f788724f969e823071afdcbb1ec4'],
      [6, 'f29ee3e6379136074b2f69dc715e2d46'],
    ]) {
      expect(sql).toContain(String(count));
      expect(sql).toContain(digest);
    }
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/i);
  });

  test('classifies unfrozen history evidence explicitly and emits bounded evidence only', () => {
    const sql = read('scripts/productionStateIntegrityReconciliation.sql');
    expect(sql).toContain('NOT PREVIOUSLY FROZEN');
    expect(sql).toContain('MATCH');
    expect(sql).toMatch(/commercial_onboarding_application_events/);
    expect(sql).toMatch(/commercial_onboarding_invitation_events/);
    expect(sql).toMatch(/audit_events/);
    expect(sql).toMatch(/transactional_outbox/);
    expect(sql).toContain("array['SUBMITTED','UNDER_REVIEW','APPROVED']");
    expect(sql).toContain("array['PENDING','SENT','ACCEPTED']");
    expect(sql).toContain('BEGIN CONTROLLED ACCEPTANCE INTEGRITY');
    expect(sql).not.toMatch(/email|phone|payload\s+as|submitted_payload/i);
  });

  test('accepts the exact current governed archived fixture', async () => {
    await expectIntegrityPass();
  });

  test('allows one or multiple clean archived historical fixtures', async () => {
    await expectIntegrityPass([2, 3].map((index) => seedAcceptedSql({
        applicationId: uuid(index * 10 + 1), invitationId: uuid(index * 10 + 2), organisationId: uuid(index * 10 + 3),
        authUserId: uuid(index * 10 + 4), internalUserId: uuid(index * 10 + 5), membershipId: uuid(index * 10 + 6),
        locationId: uuid(index * 10 + 7), applicationReference: `SC-APP-HISTORY${index}`,
        businessName: marker(index), archived: true,
      })).join('\n'));
  });

  test('allows immutable SENT-only failed application and invitation history without an organisation', async () => {
    await expectIntegrityPass(seedApplicationSql({
      applicationId: uuid(101), invitationId: uuid(102), applicationReference: 'SC-APP-FAILED01', businessName: marker(4),
    }));
  });

  test('fails ambiguous duplicate SENT or mixed SENT and ACCEPTED invitations for one controlled application', async () => {
    const duplicateSent = uuid(108);
    await expectIntegrityFailure(`
      ${seedApplicationSql({ applicationId: uuid(101), invitationId: uuid(102), applicationReference: 'SC-APP-FAILED01', businessName: marker(4) })}
      insert into commercial_onboarding_invitations(id,application_id,status,row_version) values('${duplicateSent}','${uuid(101)}','SENT',2);
      insert into commercial_onboarding_invitation_events values
        ('${uuid(seedSequence += 1)}','${duplicateSent}','${uuid(101)}','PENDING','2026-08-14T00:02:00Z'),
        ('${uuid(seedSequence += 1)}','${duplicateSent}','${uuid(101)}','SENT','2026-08-14T00:02:01Z');
    `);

    const mixedSent = uuid(109);
    await expectIntegrityFailure(`
      insert into commercial_onboarding_invitations(id,application_id,status,row_version) values('${mixedSent}','${CURRENT.applicationId}','SENT',2);
      insert into commercial_onboarding_invitation_events values
        ('${uuid(seedSequence += 1)}','${mixedSent}','${CURRENT.applicationId}','PENDING','2026-08-14T00:02:00Z'),
        ('${uuid(seedSequence += 1)}','${mixedSent}','${CURRENT.applicationId}','SENT','2026-08-14T00:02:01Z');
    `);
  });

  test('fails for one or five unexpected active controlled organisations', async () => {
    await expectIntegrityFailure(seedAcceptedSql({
      applicationId: uuid(111), invitationId: uuid(112), organisationId: uuid(113), authUserId: uuid(114),
      internalUserId: uuid(115), membershipId: uuid(116), locationId: uuid(117),
      applicationReference: 'SC-APP-ACTIVE01', businessName: marker(5), archived: false,
    }));
    await expectIntegrityFailure(Array.from({ length: 5 }, (_, index) => seedAcceptedSql({
        applicationId: uuid(201 + index * 10), invitationId: uuid(202 + index * 10), organisationId: uuid(203 + index * 10),
        authUserId: uuid(204 + index * 10), internalUserId: uuid(205 + index * 10), membershipId: uuid(206 + index * 10),
        locationId: uuid(207 + index * 10), applicationReference: `SC-APP-ACTIVE${index + 2}`,
        businessName: marker(6 + index), archived: false,
      })).join('\n'));
  });

  test('fails active controlled operational state across every Client-to-Mission table', async () => {
    const values = {
        applicationId: uuid(301), invitationId: uuid(302), organisationId: uuid(303), authUserId: uuid(304),
        internalUserId: uuid(305), membershipId: uuid(306), locationId: uuid(307),
        applicationReference: 'SC-APP-OPERATIONAL', businessName: marker(12), archived: false,
    };
    await expectIntegrityFailure(`${seedAcceptedSql(values)}
      ${['clients', 'properties', 'fields', 'jobs', 'missions'].map((table, index) =>
        `insert into ${table} values('${uuid(310 + index)}','${values.organisationId}',null);`).join('\n')}`);
  });

  test('fails ambiguous accepted provenance', async () => {
    await expectIntegrityFailure(`update commercial_onboarding_invitations set resulting_organisation_id='${uuid(999)}'
      where id='${CURRENT.invitationId}';`);
  });

  test('does not classify genuine customer data with similar words as controlled evidence', async () => {
    await expectIntegrityPass(`
      insert into organisations values('${uuid(401)}','SC ACCEPTANCE — Genuine Customer',null);
      insert into commercial_onboarding_applications values('${uuid(402)}','BUSINESS-401','SC ACCEPTANCE — Genuine Customer','APPROVED',3);
    `);
  });

  test('requires historical archive audit and outbox evidence', async () => {
    await expectIntegrityFailure(`delete from audit_events where organisation_id='${CURRENT.organisationId}' and event_type='commercial_onboarding.acceptance_archived';`);
    await expectIntegrityFailure(`delete from transactional_outbox where organisation_id='${CURRENT.organisationId}';`);
  });

  test('fails archived fixtures with active identity residue', async () => {
    await expectIntegrityFailure(`update internal_users set is_active=true,archived_at=null where id='${CURRENT.internalUserId}';`);
  });

  test('fails archived fixtures with missing or mismatched retained identity provenance', async () => {
    await expectIntegrityFailure(`delete from memberships where id='${CURRENT.membershipId}';`);
    await expectIntegrityFailure(`update internal_users set auth_user_id='${uuid(998)}' where id='${CURRENT.internalUserId}';`);
    await expectIntegrityFailure(`update membership_operating_location_assignments set operating_location_id='${uuid(997)}';`);
    await expectIntegrityFailure(`update internal_user_seat_assignments set organisation_seat_allocation_id='${uuid(996)}';`);
  });

  test('fails archived fixtures with mismatched archive audit or outbox identity and provenance', async () => {
    await expectIntegrityFailure(`update audit_events set entity_id='${uuid(995)}'
      where event_type='commercial_onboarding.acceptance_archived';`);
    await expectIntegrityFailure(`update transactional_outbox set aggregate_type='client'
      where topic='commercial_onboarding.acceptance_archived';`);
    await expectIntegrityFailure(`update audit_events set event_payload=jsonb_build_object('applicationId','${uuid(994)}','invitationId','${CURRENT.invitationId}')
      where event_type='commercial_onboarding.acceptance_archived';`);
    await expectIntegrityFailure(`update transactional_outbox set payload=jsonb_build_object(
      'organisationId','${CURRENT.organisationId}','applicationId','${CURRENT.applicationId}','invitationId','${uuid(993)}')
      where topic='commercial_onboarding.acceptance_archived';`);
  });

  test('fails archived fixtures with remaining legacy-store data', async () => {
    await expectIntegrityFailure(`insert into ftf_store values('${CURRENT.organisationId}','ftf_work_packs','__value__');`);
  });

  test('fails closed on a new active replacement fixture', async () => {
    await expectIntegrityFailure(seedAcceptedSql({
      applicationId: uuid(501), invitationId: uuid(502), organisationId: uuid(503), authUserId: uuid(504),
      internalUserId: uuid(505), membershipId: uuid(506), locationId: uuid(507),
      applicationReference: 'SC-APP-REPLACEMENT', businessName: marker(13), archived: false,
    }));
  });

  test('fails explicitly when controlled evidence is absent or the current governed identity is missing', async () => {
    await expectIntegrityFailure('', { current: false });
    await expectIntegrityFailure(`delete from commercial_onboarding_applications where id='${CURRENT.applicationId}';`);
  });
});
