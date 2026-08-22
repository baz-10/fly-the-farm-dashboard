const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
const migrationDirectory = path.join(root, 'supabase/migrations');
const migrationName = '20260822100000_financial_actual_authority.sql';
const runChild = process.env.FINANCIAL_ACTUAL_AUTHORITY_PGLITE_CHILD === '1';
const tests = [];

if (runChild) {
  global.jest = { setTimeout: () => {} };
  global.expect = require('expect');
  global.test = (name, run) => tests.push({ name, run });
}

jest.setTimeout(180000);

const ids = {
  authA: '10000000-0000-4000-8000-000000000001',
  authB: '10000000-0000-4000-8000-000000000002',
  clientA: '20000000-0000-4000-8000-000000000001',
  propertyA: '30000000-0000-4000-8000-000000000001',
  fieldA: '40000000-0000-4000-8000-000000000001',
  jobA: '50000000-0000-4000-8000-000000000001',
  missionA: '60000000-0000-4000-8000-000000000001',
  provenanceA: '70000000-0000-4000-8000-000000000001',
  provenanceCostA: '70000000-0000-4000-8000-000000000002',
  workA: '80000000-0000-4000-8000-000000000001',
  costA: '90000000-0000-4000-8000-000000000001',
};

const scalar = async (db, sql, params = []) => (await db.query(sql, params)).rows[0]?.value;

if (runChild) {
  let db;
  let orgA;
  let orgB;
  let actorA;
  let actorB;
  let baseA;
  let baseB;

  const createPayload = () => ({
    operatingLocationId: baseA,
    clientId: ids.clientA,
    propertyId: ids.propertyA,
    fieldId: ids.fieldA,
    jobId: ids.jobA,
    missionId: ids.missionA,
    currencyCode: 'AUD',
    formulaVersion: 'FINANCIAL_ACTUAL_V1',
    startDate: '2026-08-20',
    endDate: '2026-08-21',
    provenance: [{
      id: ids.provenanceA,
      fieldPath: 'workEntries/2026-08-20/actualWorkHours',
      provenanceClass: 'MANUAL_FINANCIAL_INPUT',
      originalValue: '8.5000',
      effectiveValue: '8.5000',
      unitCode: 'HOUR',
    }, {
      id: ids.provenanceCostA,
      fieldPath: `costLines/${ids.costA}/amount`,
      provenanceClass: 'MANUAL_FINANCIAL_INPUT',
      originalValue: '1.0000',
      effectiveValue: '1.0000',
      unitCode: 'AUD',
    }],
    workEntries: [{ id: ids.workA, workDate: '2026-08-20', actualWorkHours: '8.5000', provenanceId: ids.provenanceA }],
    costLines: [{
      id: ids.costA, category: 'OTHER', subtype: 'MISCELLANEOUS', description: 'Landing fee',
      quantity: '3.000000', unitCode: 'EA', unitCost: '0.333333', amount: '1.0000', provenanceId: ids.provenanceCostA,
    }],
  });

  const call = async (functionName, args) => scalar(db, `select public.${functionName}(${args.map((_, i) => `$${i + 1}`).join(',')}) as value`, args);

  test('applies the migration and provisions admin-only Financial permissions', async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create table auth.users(id uuid primary key,email text unique);
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create role anon;
      create role authenticated;
      create role service_role;
    `);
    for (const dependency of [
      '20260801000000_production_beta_foundation.sql',
      '20260801006000_live_chain_access_prerequisites.sql',
      '20260801012000_legacy_runtime_dependencies.sql',
      '20260801013000_production_beta_identity_bootstrap.sql',
    ]) await db.exec(fs.readFileSync(path.join(migrationDirectory, dependency), 'utf8'));
    await db.exec(fs.readFileSync(path.join(migrationDirectory, migrationName), 'utf8'));
    await db.exec(`insert into auth.users(id,email) values('${ids.authA}','admin-a@example.test'),('${ids.authB}','admin-b@example.test')`);
    const a = await call('ftf_bootstrap_production_beta_organisation', [ids.authA,'Organisation A','Admin A','Base A',null,'Australia/Brisbane']);
    const b = await call('ftf_bootstrap_production_beta_organisation', [ids.authB,'Organisation B','Admin B','Base B',null,'Australia/Brisbane']);
    orgA = a.organisation_id; actorA = a.internal_user_id; baseA = a.operating_location_id;
    orgB = b.organisation_id; actorB = b.internal_user_id; baseB = b.operating_location_id;
    const permissions = await db.query(`select p.code from public.role_permissions rp join public.permissions p on p.organisation_id=rp.organisation_id and p.id=rp.permission_id join public.roles r on r.organisation_id=rp.organisation_id and r.id=rp.role_id where r.organisation_id=$1 and r.code='admin' and p.code like 'financial_actuals.%' order by p.code`, [orgA]);
    expect(permissions.rows.map(row => row.code)).toEqual(['financial_actuals.archive','financial_actuals.create','financial_actuals.export','financial_actuals.finalise','financial_actuals.read','financial_actuals.update']);
    await db.exec(`insert into public.roles(organisation_id,code,name) values('${orgA}','contractor','Contractor')`);
    const contractor = await scalar(db, `select count(*)::integer as value from public.role_permissions rp join public.roles r on r.organisation_id=rp.organisation_id and r.id=rp.role_id join public.permissions p on p.organisation_id=rp.organisation_id and p.id=rp.permission_id where r.organisation_id=$1 and r.code='contractor' and p.code like 'financial_actuals.%'`, [orgA]);
    expect(contractor).toBe(0);
  });

  test('creates one stable aggregate and Draft with exact hierarchy, children, audit and outbox', async () => {
    await db.exec(`
      insert into public.clients(id,organisation_id,name) values('${ids.clientA}','${orgA}','Client A');
      insert into public.properties(id,organisation_id,client_id,name) values('${ids.propertyA}','${orgA}','${ids.clientA}','Property A');
      insert into public.fields(id,organisation_id,property_id,name,area_hectares) values('${ids.fieldA}','${orgA}','${ids.propertyA}','Field A',10);
      insert into public.jobs(id,organisation_id,client_id,property_id,reference) values('${ids.jobA}','${orgA}','${ids.clientA}','${ids.propertyA}','JOB-A');
      insert into public.job_fields(organisation_id,property_id,job_id,field_id) values('${orgA}','${ids.propertyA}','${ids.jobA}','${ids.fieldA}');
      insert into public.missions(id,organisation_id,job_id,operating_location_id,mission_number) values('${ids.missionA}','${orgA}','${ids.jobA}','${baseA}','MIS-A');
    `);
    const created = await call('ftf_create_financial_actual', [orgA,actorA,JSON.stringify(createPayload())]);
    expect(created.record.reference).toBe('FA-000001');
    expect(created.revision).toMatchObject({ revision_number: 1, status: 'DRAFT', row_version: 1 });
    expect(created.record.active_draft_revision_id).toBe(created.revision.id);
    expect(created.record.current_final_revision_id).toBeNull();
    const counts = await db.query(`select (select count(*)::integer from public.financial_actual_work_entries) work,(select count(*)::integer from public.financial_actual_cost_lines) cost,(select count(*)::integer from public.financial_actual_value_provenance) provenance,(select count(*)::integer from public.audit_events where event_type='financial_actual.created') audit,(select count(*)::integer from public.transactional_outbox where topic='financial.actual.created') outbox`);
    expect(counts.rows[0]).toEqual({ work:1,cost:1,provenance:2,audit:1,outbox:1 });
    const storedRate = await scalar(db, `select unit_cost::text as value from public.financial_actual_cost_lines where id=$1`, [ids.costA]);
    expect(storedRate).toBe('0.333333');
    const storedAmount = await scalar(db, `select amount::text as value from public.financial_actual_cost_lines where id=$1`, [ids.costA]);
    expect(storedAmount).toBe('1.0000');
    global.created = created;
  });

  test('fails closed for foreign tenant, wrong Base, invalid hierarchy and missing permission', async () => {
    await expect(call('ftf_create_financial_actual', [orgB,actorB,JSON.stringify(createPayload())])).rejects.toThrow(/FINANCIAL_ACTUAL_LOCATION_FORBIDDEN/);
    const wrongBase = createPayload(); wrongBase.operatingLocationId = baseB; wrongBase.missionId = null;
    await expect(call('ftf_create_financial_actual', [orgA,actorA,JSON.stringify(wrongBase)])).rejects.toThrow(/FINANCIAL_ACTUAL_LOCATION_FORBIDDEN/);
    const invalid = createPayload(); invalid.fieldId = '40000000-0000-4000-8000-000000000099'; invalid.missionId = null;
    expect(await call('ftf_create_financial_actual', [orgA,actorA,JSON.stringify(invalid)])).toMatchObject({ relationship_conflict: true });
    await db.exec(`delete from public.role_permissions where organisation_id='${orgA}' and permission_id=(select id from public.permissions where organisation_id='${orgA}' and code='financial_actuals.create')`);
    await expect(call('ftf_create_financial_actual', [orgA,actorA,JSON.stringify(createPayload())])).rejects.toThrow(/FINANCIAL_ACTUAL_FORBIDDEN/);
  });

  test('updates the active Draft with optimistic concurrency and replaces governed children', async () => {
    const created = global.created;
    const contradictory = createPayload();
    contradictory.costLines[0].provenanceId = ids.provenanceA;
    await expect(call('ftf_update_financial_actual_draft', [orgA,actorA,created.record.id,created.revision.id,1,JSON.stringify(contradictory)])).rejects.toThrow(/FINANCIAL_ACTUAL_PROVENANCE_MISMATCH/);
    const nullUnit = createPayload();
    nullUnit.provenance[0].unitCode = null;
    await expect(call('ftf_update_financial_actual_draft', [orgA,actorA,created.record.id,created.revision.id,1,JSON.stringify(nullUnit)])).rejects.toThrow(/FINANCIAL_ACTUAL_PROVENANCE_MISMATCH/);
    const nonScalarValue = createPayload();
    nonScalarValue.provenance[1].effectiveValue = { amount: '25.00' };
    await expect(call('ftf_update_financial_actual_draft', [orgA,actorA,created.record.id,created.revision.id,1,JSON.stringify(nonScalarValue)])).rejects.toThrow(/FINANCIAL_ACTUAL_PROVENANCE_MISMATCH/);
    const payload = createPayload();
    payload.provenance[0].effectiveValue = '9.0000';
    payload.workEntries[0].actualWorkHours = '9.0000';
    const updated = await call('ftf_update_financial_actual_draft', [orgA,actorA,created.record.id,created.revision.id,1,JSON.stringify(payload)]);
    expect(updated.revision.row_version).toBe(2);
    const stale = await call('ftf_update_financial_actual_draft', [orgA,actorA,created.record.id,created.revision.id,1,JSON.stringify(payload)]);
    expect(stale).toMatchObject({ conflict:true,current_version:2 });
    const work = await db.query(`select actual_work_hours::text hours from public.financial_actual_work_entries where financial_actual_revision_id=$1`, [created.revision.id]);
    expect(work.rows).toEqual([{ hours:'9.0000' }]);
    expect(await scalar(db, `select count(*)::integer as value from public.audit_events where event_type='financial_actual.draft_updated'`)).toBe(1);
    expect(await scalar(db, `select count(*)::integer as value from public.transactional_outbox where topic='financial.actual.draft_updated'`)).toBe(1);
  });

  test('enforces one active Draft, immutable FINAL evidence and pointer state in the database', async () => {
    const created = global.created;
    await expect(db.exec(`insert into public.financial_actual_revisions(organisation_id,financial_actual_id,revision_number,status,currency_code,calculation_version,start_date,end_date,created_by_internal_user_id,updated_by_internal_user_id) values('${orgA}','${created.record.id}',2,'DRAFT','AUD','FINANCIAL_ACTUAL_V1','2026-08-20','2026-08-21','${actorA}','${actorA}')`)).rejects.toThrow();
    await db.exec(`select set_config('app.financial_actual_finalisation','allowed',false); update public.financial_actual_revisions set status='FINAL',input_snapshot='{}',provenance_snapshot='{}',calculation_snapshot='{}',source_manifest='{}',input_digest=repeat('a',64),finalised_at=now(),finalised_by_internal_user_id='${actorA}' where id='${created.revision.id}';`);
    const pointers = await db.query(`select current_final_revision_id,active_draft_revision_id from public.financial_actuals where id=$1`, [created.record.id]);
    expect(pointers.rows[0]).toEqual({ current_final_revision_id:created.revision.id,active_draft_revision_id:null });
    await expect(db.exec(`update public.financial_actual_revisions set currency_code='NZD' where id='${created.revision.id}'`)).rejects.toThrow(/FINANCIAL_ACTUAL_FINAL_IMMUTABLE/);
    await expect(db.exec(`update public.financial_actual_work_entries set actual_work_hours=10 where financial_actual_revision_id='${created.revision.id}'`)).rejects.toThrow(/FINANCIAL_ACTUAL_FINAL_IMMUTABLE/);
  });

  test('denies direct authenticated table mutation and keeps checked reads Base scoped', async () => {
    await db.exec(`set role authenticated`);
    try {
      await expect(db.exec(`insert into public.financial_actuals(organisation_id,operating_location_id,reference,client_id,property_id,field_id,job_id,created_by_internal_user_id,updated_by_internal_user_id) values('${orgA}','${baseA}','FA-999999','${ids.clientA}','${ids.propertyA}','${ids.fieldA}','${ids.jobA}','${actorA}','${actorA}')`)).rejects.toThrow();
    } finally { await db.exec(`reset role`); }
    await db.exec(`set role service_role`);
    try {
      await expect(db.query(`select * from public.financial_actuals`)).rejects.toThrow();
    } finally { await db.exec(`reset role`); }
    const list = await call('ftf_list_financial_actuals', [orgA,actorA,baseA,null,25]);
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0].reference).toBe('FA-000001');
  });

  test('closes the database', async () => { await db.close(); });
} else {
  test('passes the real Financial Actual authority behavior check', () => {
    try {
      execFileSync(process.execPath, [__filename], {
        cwd: root,
        env: { ...process.env, FINANCIAL_ACTUAL_AUTHORITY_PGLITE_CHILD: '1' },
        stdio: 'pipe',
      });
    } catch (error) {
      throw new Error(`${error.stdout || ''}${error.stderr || ''}` || error.message);
    }
  });
}

if (runChild) {
  (async () => {
    for (const { name, run } of tests) {
      await run();
      process.stdout.write(`PASS ${name}\n`);
    }
  })().catch(error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
