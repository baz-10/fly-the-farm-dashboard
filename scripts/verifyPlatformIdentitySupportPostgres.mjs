import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readMigration = (name) => readFile(resolve(root, 'supabase/migrations', name), 'utf8');
const db = new PGlite();

try {
  await db.exec(`
    create schema auth;
    create table auth.users(id uuid primary key,email text unique);
    create function auth.uid()returns uuid language sql stable as $$select null::uuid$$;
    create role anon;create role authenticated;create role service_role;
  `);
  await db.exec(await readMigration('20260801000000_production_beta_foundation.sql'));
  await db.exec(await readMigration('20260801006000_live_chain_access_prerequisites.sql'));
  await db.exec(await readMigration('20260802024000_authoritative_personnel.sql'));
  await db.exec(await readMigration('20260804160000_platform_identity_assisted_support.sql'));

  const platformAuth='71000000-0000-4000-8000-000000000001';
  const conflictedAuth='71000000-0000-4000-8000-000000000002';
  const org='71000000-0000-4000-8000-000000000101';
  const internal='71000000-0000-4000-8000-000000000102';
  const role='71000000-0000-4000-8000-000000000103';
  const organisationAdmin='71000000-0000-4000-8000-000000000104';
  const organisationAdminAuth='71000000-0000-4000-8000-000000000004';
  await db.exec(`
    insert into auth.users(id,email)values('${platformAuth}','ben@trollope.com.au'),('${conflictedAuth}','conflicted@example.test'),('${organisationAdminAuth}','ben@flythefarm.com.au');
    insert into public.organisations(id,organisation_id,name)values('${org}','${org}','Test Organisation');
    insert into public.internal_users(id,organisation_id,auth_user_id,display_name)values('${internal}','${org}','${conflictedAuth}','Conflicted User');
    insert into public.roles(id,organisation_id,code,name)values('${role}','${org}','admin','Administrator');
    insert into public.memberships(organisation_id,internal_user_id,role_id)values('${org}','${internal}','${role}');
  `);

  const first=(await db.query(`select public.reconcile_platform_identity('${platformAuth}','ben@trollope.com.au','Ben Trollope','PLATFORM_SUPER_ADMIN','${platformAuth}') result`)).rows[0].result;
  const second=(await db.query(`select public.reconcile_platform_identity('${platformAuth}','ben@trollope.com.au','Ben Trollope','PLATFORM_SUPER_ADMIN','${platformAuth}') result`)).rows[0].result;
  if(first.status!=='RECONCILED'||second.status!=='ALREADY_RECONCILED'||first.platform_user_id!==second.platform_user_id)throw new Error('platform reconciliation is not idempotent');

  const mismatch=(await db.query(`select public.reconcile_platform_identity('${platformAuth}','wrong@example.test','Ben Trollope','PLATFORM_SUPER_ADMIN','${platformAuth}') result`)).rows[0].result;
  if(mismatch.status!=='IDENTITY_AMBIGUOUS')throw new Error('email mismatch did not fail closed');
  const conflict=(await db.query(`select public.reconcile_platform_identity('${conflictedAuth}','conflicted@example.test','Conflicted','PLATFORM_SUPER_ADMIN','${platformAuth}') result`)).rows[0].result;
  if(conflict.status!=='TENANT_ACCESS_PRESENT')throw new Error('tenant identity was silently converted to platform identity');

  const evidence=(await db.query(`select
    (select count(*)::int from public.platform_users) platform_users,
    (select count(*)::int from public.platform_user_roles) platform_roles,
    (select count(*)::int from public.platform_audit_events where event_type='platform.identity.reconciled') audits,
    (select count(*)::int from public.platform_transactional_outbox where topic='platform.identity.reconciled') outbox,
    (select count(*)::int from public.memberships) memberships,
    (select count(*)::int from public.platform_permissions where code='platform.break_glass' and enabled=false) break_glass_disabled
  `)).rows[0];
  for(const [key,value] of Object.entries(evidence))if(value!==1)throw new Error(`${key} expected 1, received ${value}`);

  await db.exec(`
    insert into public.internal_users(id,organisation_id,auth_user_id,display_name)values('${organisationAdmin}','${org}','${organisationAdminAuth}','Organisation Administrator');
    insert into public.memberships(organisation_id,internal_user_id,role_id)values('${org}','${organisationAdmin}','${role}');
  `);
  const request=(await db.query(`select public.create_support_request('${org}','${organisationAdmin}','Production support','READ_ONLY','ORGANISATION',null,null,null,120) result`)).rows[0].result;
  if(!request.request_id||request.state!=='PENDING')throw new Error('support request was not recorded independently');
  const approval=(await db.query(`select public.decide_support_request('${org}','${organisationAdmin}','${request.request_id}',1,'APPROVE','Approved for investigation') result`)).rows[0].result;
  if(!approval.approval_id||approval.requester_is_approver!==true||approval.state!=='APPROVED')throw new Error('same-person approval disclosure is missing');
  const session=(await db.query(`select public.start_support_session('${first.platform_user_id}','${request.request_id}') result`)).rows[0].result;
  if(!session.session_id||session.state!=='ACTIVE')throw new Error('approved support session did not start');
  const read=(await db.query(`select public.support_access_allowed('${session.session_id}','${org}','READ','missions',null,null,now()) result`)).rows[0].result;
  const write=(await db.query(`select public.support_access_allowed('${session.session_id}','${org}','WRITE','missions',null,null,now()) result`)).rows[0].result;
  if(read.allowed!==true||write.allowed!==false||write.denial_code!=='SUPPORT_READ_ONLY')throw new Error('support access mode was not enforced');
  const activity=(await db.query(`select public.record_delegated_support_activity('${session.session_id}','${first.platform_user_id}','READ','missions','mission',null,'SUCCESS','{}') result`)).rows[0].result;
  if(!activity.recorded||activity.audit_actor_type!=='PLATFORM_SUPPORT')throw new Error('explicit delegated actor activity was not recorded');
  const supportEvidence=(await db.query(`select
    (select count(*)::int from public.support_requests) requests,
    (select count(*)::int from public.support_approval_events) approvals,
    (select count(*)::int from public.support_sessions) sessions,
    (select count(*)::int from public.audit_events where event_type like 'support.%') audits,
    (select count(*)::int from public.audit_events where actor_type='PLATFORM_SUPPORT'and actor_platform_user_id='${first.platform_user_id}'and support_session_id='${session.session_id}'and authority_snapshot->>'approvingOrganisationUserId'='${organisationAdmin}') delegated_actor_audits,
    (select count(*)::int from public.transactional_outbox where topic like 'platform.support.%') outbox,
    (select count(*)::int from public.organisation_notifications where event_type in('SUPPORT_GRANTED','SUPPORT_STARTED')) notifications
  `)).rows[0];
  if(supportEvidence.requests!==1||supportEvidence.approvals!==1||supportEvidence.sessions!==1||supportEvidence.audits<4||supportEvidence.delegated_actor_audits!==1||supportEvidence.outbox<4||supportEvidence.notifications!==2)throw new Error(`support lifecycle evidence invalid: ${JSON.stringify(supportEvidence)}`);
} finally {
  await db.close();
}
