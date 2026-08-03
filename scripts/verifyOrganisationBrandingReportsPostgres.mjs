import{readFile,readdir}from'node:fs/promises';
import{fileURLToPath}from'node:url';
import{dirname,resolve}from'node:path';
import{PGlite}from'@electric-sql/pglite';

const migrationDirectory=resolve(dirname(fileURLToPath(import.meta.url)),'../supabase/migrations');
const db=new PGlite();
const id={org:'61000000-0000-4000-8000-000000000001',otherOrg:'62000000-0000-4000-8000-000000000001',admin:'61000000-0000-4000-8000-000000000101',operator:'61000000-0000-4000-8000-000000000102',otherAdmin:'62000000-0000-4000-8000-000000000101'};
try{
 await db.exec(`create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select null::uuid$$;create role anon;create role authenticated;create role service_role;`);
 for(const name of(await readdir(migrationDirectory)).filter(name=>name.endsWith('.sql')).sort())await db.exec(await readFile(resolve(migrationDirectory,name),'utf8'));
 await db.exec(`
  insert into auth.users(id)values('61000000-0000-4000-8000-000000000011'),('61000000-0000-4000-8000-000000000012'),('62000000-0000-4000-8000-000000000011');
  insert into public.organisations(id,organisation_id,name)values('${id.org}','${id.org}','Fly The Farm'),('${id.otherOrg}','${id.otherOrg}','Other Operator');
  insert into public.internal_users(id,organisation_id,auth_user_id,display_name)values('${id.admin}','${id.org}','61000000-0000-4000-8000-000000000011','Administrator'),('${id.operator}','${id.org}','61000000-0000-4000-8000-000000000012','Operator'),('${id.otherAdmin}','${id.otherOrg}','62000000-0000-4000-8000-000000000011','Other Administrator');
  insert into public.roles(id,organisation_id,code,name)values('61000000-0000-4000-8000-000000000111','${id.org}','admin','Administrator'),('61000000-0000-4000-8000-000000000112','${id.org}','operator','Operator'),('62000000-0000-4000-8000-000000000111','${id.otherOrg}','admin','Administrator');
  insert into public.memberships(organisation_id,internal_user_id,role_id)values('${id.org}','${id.admin}','61000000-0000-4000-8000-000000000111'),('${id.org}','${id.operator}','61000000-0000-4000-8000-000000000112'),('${id.otherOrg}','${id.otherAdmin}','62000000-0000-4000-8000-000000000111');
  insert into public.organisation_capability_entitlements(organisation_id,capability_code,source)values('${id.org}','ORGANISATION_BRANDING','production_beta_acceptance'),('${id.otherOrg}','BRANDING_UNAVAILABLE','test_default');
 `);
 const denied=(await db.query(`select public.ftf_update_organisation_branding('${id.org}','${id.operator}',1,'{"reportDisplayName":"Forbidden"}'::jsonb)result`)).rows[0].result;
 if(!denied.forbidden)throw new Error('ordinary operator changed organisation branding');
 const saved=(await db.query(`select public.ftf_update_organisation_branding('${id.org}','${id.admin}',1,'{"legalBusinessName":"Fly The Farm Pty Ltd","tradingName":"Fly The Farm","reportDisplayName":"Fly The Farm","businessIdentifierType":"ABN","businessIdentifierValue":"12 345 678 901","primaryEmail":"operations@example.test"}'::jsonb)result`)).rows[0].result;
 if(saved.record.profile.report_display_name!=='Fly The Farm'||saved.record.profile.row_version!==2||saved.record.entitlement.capabilityCode!=='ORGANISATION_BRANDING')throw new Error('authoritative organisation branding update failed');
 const stale=(await db.query(`select public.ftf_update_organisation_branding('${id.org}','${id.admin}',1,'{"reportDisplayName":"Stale"}'::jsonb)result`)).rows[0].result;
 if(!stale.conflict||stale.current_version!==2)throw new Error('stale branding update was accepted');
 const other=(await db.query(`select public.ftf_read_organisation_branding('${id.otherOrg}')result`)).rows[0].result;
 if(other.profile.report_display_name||other.entitlement.capabilityCode!=='BRANDING_UNAVAILABLE')throw new Error('organisation branding leaked across tenants');
 const evidence=(await db.query(`select(select count(*)::int from public.audit_events where organisation_id='${id.org}'and event_type='organisation.branding.updated')audits,(select count(*)::int from public.transactional_outbox where organisation_id='${id.org}'and topic='platform.organisation.branding_updated')outbox`)).rows[0];
 if(evidence.audits!==1||evidence.outbox!==1)throw new Error('branding audit/outbox evidence missing');
}finally{await db.close();}
