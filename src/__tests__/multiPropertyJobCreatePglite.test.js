const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

if (process.env.MULTIPROPERTY_JOB_CREATE_PGLITE_CHILD !== '1') {
  test('checked Job creation is atomic for valid and cross-Client scopes', () => {
    expect(execFileSync(process.execPath, [__filename], {
      encoding: 'utf8', env: { ...process.env, MULTIPROPERTY_JOB_CREATE_PGLITE_CHILD: '1' },
    }).trim()).toBe('multi-property-job-create-pglite: pass');
  });
} else {
  const assert = require('assert/strict');
  const { TextDecoder, TextEncoder } = require('util');
  global.TextDecoder = TextDecoder; global.TextEncoder = TextEncoder;
  const { PGlite } = require('@electric-sql/pglite');
  const migration = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20260905220000_checked_multiproperty_job_create.sql'), 'utf8');
  const i = {
    org:'11111111-1111-4111-8111-111111111111',actor:'22222222-2222-4222-8222-222222222222',client:'33333333-3333-4333-8333-333333333333',otherClient:'44444444-4444-4444-8444-444444444444',propertyA:'55555555-5555-4555-8555-555555555555',propertyB:'66666666-6666-4666-8666-666666666666',otherProperty:'77777777-7777-4777-8777-777777777777',fieldA:'88888888-8888-4888-8888-888888888888',fieldB:'99999999-9999-4999-8999-999999999999',otherField:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const schema = `
    create role anon;create role authenticated;create role service_role;
    create table clients(id uuid,organisation_id uuid,archived_at timestamptz);
    create table properties(id uuid,organisation_id uuid,client_id uuid,archived_at timestamptz);
    create table fields(id uuid,organisation_id uuid,property_id uuid,archived_at timestamptz);
    create table jobs(id uuid primary key default gen_random_uuid(),organisation_id uuid,client_id uuid,property_id uuid,reference text,scope text,status text,notes text,requested_date date,scheduled_date date,row_version integer default 1,created_at timestamptz default now(),updated_at timestamptz default now());
    create table job_fields(id uuid default gen_random_uuid(),organisation_id uuid,property_id uuid,job_id uuid,field_id uuid,archived_at timestamptz);
    create table roles(id uuid,organisation_id uuid,code text,archived_at timestamptz);
    create table memberships(organisation_id uuid,internal_user_id uuid,role_id uuid,is_active boolean,archived_at timestamptz);
    create table audit_events(id uuid default gen_random_uuid(),organisation_id uuid,actor_internal_user_id uuid,event_type text,entity_type text,entity_id uuid,event_payload jsonb);
    create table transactional_outbox(id uuid default gen_random_uuid(),organisation_id uuid,topic text,aggregate_type text,aggregate_id uuid,payload jsonb);
    create function ftf_actor_has_permission(uuid,uuid,text)returns boolean language sql as $$select true$$;
    create function ftf_actor_has_active_beta_seat(uuid,uuid)returns boolean language sql as $$select true$$;
    create function ftf_allocate_operational_reference(uuid,text)returns text language sql as $$select 'FTF-JOB-000001'$$;`;
  const seed = `insert into clients values('${i.client}','${i.org}',null),('${i.otherClient}','${i.org}',null);insert into properties values('${i.propertyA}','${i.org}','${i.client}',null),('${i.propertyB}','${i.org}','${i.client}',null),('${i.otherProperty}','${i.org}','${i.otherClient}',null);insert into fields values('${i.fieldA}','${i.org}','${i.propertyA}',null),('${i.fieldB}','${i.org}','${i.propertyB}',null),('${i.otherField}','${i.org}','${i.otherProperty}',null);`;
  const call = async (db, payload) => (await db.query(`select ftf_create_job_with_scope('${i.org}','${i.actor}','${JSON.stringify(payload).replaceAll("'", "''")}'::jsonb) value`)).rows[0].value;
  (async()=>{
    const validDb=new PGlite();await validDb.exec(schema);await validDb.exec(migration);await validDb.exec(seed);
    const valid=await call(validDb,{client_id:i.client,field_ids:[i.fieldA,i.fieldB],auto_generate_reference:true,scope:'Two Properties',status:'open',notes:''});
    assert.equal(valid.record.reference,'FTF-JOB-000001');assert.equal(valid.record.property_id,i.propertyA);assert.deepEqual(valid.record.property_ids,[i.propertyA,i.propertyB]);assert.equal((await validDb.query('select id from job_fields')).rows.length,2);assert.equal((await validDb.query('select id from audit_events')).rows.length,1);assert.equal((await validDb.query('select id from transactional_outbox')).rows.length,1);await validDb.close();
    const invalidDb=new PGlite();await invalidDb.exec(schema);await invalidDb.exec(migration);await invalidDb.exec(seed);
    const invalid=await call(invalidDb,{client_id:i.client,field_ids:[i.fieldA,i.otherField],reference:'INVALID',scope:'Cross Client',status:'open',notes:''});assert.deepEqual(invalid,{error:'JOB_SCOPE_CLIENT_MISMATCH'});for(const table of['jobs','job_fields','audit_events','transactional_outbox'])assert.equal((await invalidDb.query(`select id from ${table}`)).rows.length,0);await invalidDb.close();
    process.stdout.write('multi-property-job-create-pglite: pass\n');
  })().catch(error=>{console.error(error);process.exit(1);});
}
