import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const foundationPath = resolve(scriptDirectory, '../supabase/migrations/20260801000000_production_beta_foundation.sql');
const legacyRuntimePath = resolve(scriptDirectory, '../supabase/migrations/20260801012000_legacy_runtime_dependencies.sql');

async function expectRejected(db, label, sql) {
  try {
    await db.exec(sql);
  } catch {
    return;
  }
  throw new Error(`${label} was accepted`);
}

const foundation = await readFile(foundationPath, 'utf8');
const legacyRuntime = await readFile(legacyRuntimePath, 'utf8');
const db = new PGlite();

try {
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid; $$;
    create role anon;
    create role authenticated;
    create role service_role;
  `);
  await db.exec(foundation);
  await db.exec(legacyRuntime);

  await db.exec(`
    insert into auth.users (id) values
      ('00000000-0000-0000-0000-000000000011'),
      ('00000000-0000-0000-0000-000000000022');
    insert into public.organisations (id, organisation_id, name) values
      ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Organisation one');
    insert into public.ftf_profiles (user_id, tenant_id, role, name, invite_code, tier) values
      ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'contractor', 'Operator one', 'ABC123', 'beta'),
      ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', 'client', 'Client user', null, 'free');
    update public.ftf_profiles
      set contractor_id = '00000000-0000-0000-0000-000000000011'
      where user_id = '00000000-0000-0000-0000-000000000022';
    insert into public.ftf_store (tenant_id, collection, record_id, payload) values
      ('00000000-0000-0000-0000-000000000001', 'ftf_missions', 'mission-1', '{"id":"mission-1"}'::jsonb);
  `);

  await expectRejected(
    db,
    'profile for missing organisation',
    `insert into public.ftf_profiles (user_id, tenant_id, role, name) values
      ('00000000-0000-0000-0000-000000000011', '99999999-9999-4999-8999-999999999999', 'contractor', 'Invalid');`
  );
  await expectRejected(
    db,
    'cross-tenant contractor profile',
    `insert into public.organisations (id, organisation_id, name) values
      ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Organisation two');
     update public.ftf_profiles set tenant_id = '00000000-0000-0000-0000-000000000002'
       where user_id = '00000000-0000-0000-0000-000000000022';`
  );
  await expectRejected(
    db,
    'store row for missing organisation',
    `insert into public.ftf_store (tenant_id, collection, record_id, payload) values
      ('99999999-9999-4999-8999-999999999999', 'ftf_missions', 'mission-2', '{}'::jsonb);`
  );

  const security = await db.query(`
    select relname, relrowsecurity, relforcerowsecurity
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('ftf_profiles', 'ftf_store')
    order by relname;
  `);
  if (security.rows.length !== 2 || security.rows.some((row) => !row.relrowsecurity || !row.relforcerowsecurity)) {
    throw new Error('legacy runtime tables are not protected by forced RLS');
  }

  const privileges = await db.query(`
    select
      has_table_privilege('anon', 'public.ftf_profiles', 'select') as anon_profiles,
      has_table_privilege('authenticated', 'public.ftf_profiles', 'select') as authenticated_profiles,
      has_table_privilege('anon', 'public.ftf_store', 'select') as anon_store,
      has_table_privilege('authenticated', 'public.ftf_store', 'select') as authenticated_store,
      has_table_privilege('service_role', 'public.ftf_profiles', 'select,insert,update,delete') as service_profiles,
      has_table_privilege('service_role', 'public.ftf_store', 'select,insert,update,delete') as service_store;
  `);
  const grants = privileges.rows[0];
  if (grants.anon_profiles || grants.authenticated_profiles || grants.anon_store || grants.authenticated_store
      || !grants.service_profiles || !grants.service_store) {
    throw new Error('legacy runtime table grants do not enforce the server-only boundary');
  }
} finally {
  await db.close();
}
