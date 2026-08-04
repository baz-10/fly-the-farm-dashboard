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
  await db.exec(`
    insert into auth.users(id,email)values('${platformAuth}','ben@trollope.com.au'),('${conflictedAuth}','conflicted@example.test');
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
} finally {
  await db.close();
}
