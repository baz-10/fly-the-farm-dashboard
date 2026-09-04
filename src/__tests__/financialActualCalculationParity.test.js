const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const migrations = path.join(root, 'supabase/migrations');
const slice2Migration = path.join(migrations, '20260822110000_financial_actual_calculation_and_finalisation.sql');
const runChild = process.env.FINANCIAL_ACTUAL_CALCULATION_PGLITE_CHILD === '1';

if (runChild) {
  const assert = require('assert/strict');
  const { TextDecoder, TextEncoder } = require('util');
  global.TextDecoder = TextDecoder;
  global.TextEncoder = TextEncoder;
  const { PGlite } = require('@electric-sql/pglite');
  (async () => {
    const db = new PGlite();
    await db.exec(`create schema auth;create table auth.users(id uuid primary key,email text unique);create function auth.uid()returns uuid language sql stable as $$select null::uuid$$;create role anon;create role authenticated;create role service_role;`);
    for (const migration of [
      '20260801000000_production_beta_foundation.sql',
      '20260801006000_live_chain_access_prerequisites.sql',
      '20260801012000_legacy_runtime_dependencies.sql',
      '20260801013000_production_beta_identity_bootstrap.sql',
      '20260822100000_financial_actual_authority.sql',
    ]) await db.exec(fs.readFileSync(path.join(migrations, migration), 'utf8'));
    await db.exec(fs.readFileSync(slice2Migration, 'utf8'));

    for (const fixture of JSON.parse(process.env.FINANCIAL_ACTUAL_FIXTURES_JSON)) {
      const sqlResult = (await db.query(`select public.ftf_calculate_financial_actual_v1($1::jsonb) result`, [JSON.stringify(fixture.input)])).rows[0].result;
      assert.deepEqual(sqlResult, fixture.expected, fixture.name);
    }
    for (const input of JSON.parse(process.env.FINANCIAL_ACTUAL_INVALID_INPUTS_JSON)) {
      await assert.rejects(db.query(`select public.ftf_calculate_financial_actual_v1($1::jsonb)`, [JSON.stringify(input)]));
    }
    await db.exec('set role service_role');
    try { await assert.rejects(db.query(`select public.ftf_calculate_financial_actual_v1('{}'::jsonb)`)); }
    finally { await db.exec('reset role'); }

    const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.value;
    const call = async (name, args) => scalar(`select public.${name}(${args.map((_, index) => `$${index + 1}`).join(',')}) value`, args);
    const authA='10000000-0000-4000-8000-000000000001',authB='10000000-0000-4000-8000-000000000002';
    await db.exec(`insert into auth.users(id,email)values('${authA}','finance-a@example.test'),('${authB}','finance-b@example.test')`);
    const orgAResult=await call('ftf_bootstrap_production_beta_organisation',[authA,'Finance A','Finance Admin A','Finance Base A',null,'Australia/Brisbane']);
    const orgBResult=await call('ftf_bootstrap_production_beta_organisation',[authB,'Finance B','Finance Admin B','Finance Base B',null,'Australia/Brisbane']);
    const {organisation_id:orgA,internal_user_id:actorA,operating_location_id:baseA}=orgAResult;
    const {organisation_id:orgB,internal_user_id:actorB}=orgBResult;
    const client='20000000-0000-4000-8000-000000000001',property='30000000-0000-4000-8000-000000000001',field='40000000-0000-4000-8000-000000000001',job='50000000-0000-4000-8000-000000000001';
    await db.exec(`insert into public.clients(id,organisation_id,name)values('${client}','${orgA}','Finance Client');insert into public.properties(id,organisation_id,client_id,name)values('${property}','${orgA}','${client}','Finance Property');insert into public.fields(id,organisation_id,property_id,name,area_hectares)values('${field}','${orgA}','${property}','Finance Field',10);insert into public.jobs(id,organisation_id,client_id,property_id,reference)values('${job}','${orgA}','${client}','${property}','FIN-JOB');insert into public.job_fields(organisation_id,property_id,job_id,field_id)values('${orgA}','${property}','${job}','${field}');`);
    const draftPayload=(suffix,amount='1.0000')=>({operatingLocationId:baseA,clientId:client,propertyId:property,fieldId:field,jobId:job,missionId:null,currencyCode:'AUD',formulaVersion:'FINANCIAL_ACTUAL_V1',startDate:'2026-08-20',endDate:'2026-08-21',provenance:[
      {id:`70000000-0000-4000-8000-0000000000${suffix}`,fieldPath:'workEntries/2026-08-20/actualWorkHours',provenanceClass:'MANUAL_FINANCIAL_INPUT',originalValue:'3.0000',effectiveValue:'3.0000',unitCode:'HOUR'},
      {id:`71000000-0000-4000-8000-0000000000${suffix}`,fieldPath:`costLines/90000000-0000-4000-8000-0000000000${suffix}/amount`,provenanceClass:'MANUAL_FINANCIAL_INPUT',originalValue:amount,effectiveValue:amount,unitCode:'AUD'},
      {id:`72000000-0000-4000-8000-0000000000${suffix}`,fieldPath:'revenue/mode',provenanceClass:'MANUAL_FINANCIAL_INPUT',originalValue:'HOURLY',effectiveValue:'HOURLY',unitCode:'REVENUE_MODE'},
      {id:`73000000-0000-4000-8000-0000000000${suffix}`,fieldPath:'revenue/hourlyRate',provenanceClass:'MANUAL_FINANCIAL_INPUT',originalValue:'100.000000',effectiveValue:'100.000000',unitCode:'AUD_PER_HOUR'},
    ],workEntries:[{id:`80000000-0000-4000-8000-0000000000${suffix}`,workDate:'2026-08-20',actualWorkHours:'3.0000',provenanceId:`70000000-0000-4000-8000-0000000000${suffix}`}],costLines:[{id:`90000000-0000-4000-8000-0000000000${suffix}`,category:'OTHER',subtype:'MISCELLANEOUS',description:'Controlled cost',quantity:'3.000000',unitCode:'EA',unitCost:'0.333333',amount,provenanceId:`71000000-0000-4000-8000-0000000000${suffix}`}]});

    const created=await call('ftf_create_financial_actual',[orgA,actorA,JSON.stringify(draftPayload('01'))]);
    assert.deepEqual(await call('ftf_finalise_financial_actual_revision',[orgB,actorB,created.record.id,created.revision.id,created.record.row_version,created.revision.row_version]),{not_found:true});
    const stale=await call('ftf_finalise_financial_actual_revision',[orgA,actorA,created.record.id,created.revision.id,created.record.row_version,99]);
    assert.equal(stale.conflict,true);
    await db.exec(`delete from public.role_permissions where organisation_id='${orgA}'and permission_id=(select id from public.permissions where organisation_id='${orgA}'and code='financial_actuals.finalise')`);
    await assert.rejects(call('ftf_finalise_financial_actual_revision',[orgA,actorA,created.record.id,created.revision.id,created.record.row_version,created.revision.row_version]),/FINANCIAL_ACTUAL_FORBIDDEN/);
    await db.exec(`insert into public.role_permissions(organisation_id,role_id,permission_id)select '${orgA}',r.id,p.id from public.roles r join public.permissions p on p.organisation_id=r.organisation_id where r.organisation_id='${orgA}'and r.code='admin'and p.code='financial_actuals.finalise'`);
    await db.exec(`update public.membership_operating_location_assignments set archived_at=now(),is_active=false where organisation_id='${orgA}'`);
    await assert.rejects(call('ftf_finalise_financial_actual_revision',[orgA,actorA,created.record.id,created.revision.id,created.record.row_version,created.revision.row_version]),/FINANCIAL_ACTUAL_LOCATION_FORBIDDEN/);
    await db.exec(`update public.membership_operating_location_assignments set archived_at=null,is_active=true where organisation_id='${orgA}'`);

    const invalid=await call('ftf_create_financial_actual',[orgA,actorA,JSON.stringify(draftPayload('02','1.0100'))]);
    await assert.rejects(call('ftf_finalise_financial_actual_revision',[orgA,actorA,invalid.record.id,invalid.revision.id,invalid.record.row_version,invalid.revision.row_version]),/FINANCIAL_ACTUAL_COST_AMOUNT_MISMATCH/);
    const invalidState=(await db.query(`select r.status,a.current_final_revision_id,a.active_draft_revision_id from public.financial_actual_revisions r join public.financial_actuals a on a.id=r.financial_actual_id where r.id=$1`,[invalid.revision.id])).rows[0];
    assert.deepEqual(invalidState,{status:'DRAFT',current_final_revision_id:null,active_draft_revision_id:invalid.revision.id});

    const duplicatePayload=draftPayload('03');duplicatePayload.provenance.push({...duplicatePayload.provenance[2],id:'74000000-0000-4000-8000-000000000003'});
    const duplicate=await call('ftf_create_financial_actual',[orgA,actorA,JSON.stringify(duplicatePayload)]);
    await assert.rejects(call('ftf_finalise_financial_actual_revision',[orgA,actorA,duplicate.record.id,duplicate.revision.id,duplicate.record.row_version,duplicate.revision.row_version]),/FINANCIAL_ACTUAL_REVENUE_PROVENANCE_INVALID/);

    const quotePayload=draftPayload('04');Object.assign(quotePayload.provenance[3],{provenanceClass:'QUOTE_DERIVED',sourceEntityType:'quote_version',sourceEntityId:'75000000-0000-4000-8000-000000000004',sourceVersion:'1'});
    const quote=await call('ftf_create_financial_actual',[orgA,actorA,JSON.stringify(quotePayload)]);
    await assert.rejects(call('ftf_finalise_financial_actual_revision',[orgA,actorA,quote.record.id,quote.revision.id,quote.record.row_version,quote.revision.row_version]),/FINANCIAL_ACTUAL_QUOTE_AUTHORITY_UNAVAILABLE/);

    let finalised;await db.exec('set role service_role');
    try { finalised=await call('ftf_finalise_financial_actual_revision',[orgA,actorA,created.record.id,created.revision.id,created.record.row_version,created.revision.row_version]); }
    finally { await db.exec('reset role'); }
    assert.equal(finalised.revision.status,'FINAL');assert.equal(finalised.record.current_final_revision_id,created.revision.id);assert.equal(finalised.record.active_draft_revision_id,null);
    assert.deepEqual(finalised.revision.calculation_snapshot,{formulaVersion:'FINANCIAL_ACTUAL_V1',currencyCode:'AUD',operationalDays:1,totalHours:'3.0000',revenue:'300.0000',lineAmounts:{[`90000000-0000-4000-8000-000000000001`]:'1.0000'},categoryTotals:{LABOUR:'0.0000',PRODUCT:'0.0000',TRAVEL:'0.0000',AIRCRAFT_EQUIPMENT:'0.0000',OTHER:'1.0000'},totalCost:'1.0000',grossProfit:'299.0000',grossMarginPercentage:'99.6667',effectiveHourlyRevenue:'100.0000'});
    assert.equal(finalised.revision.calculation_version,'FINANCIAL_ACTUAL_V1');assert.ok(finalised.revision.input_snapshot.workEntries);assert.ok(finalised.revision.provenance_snapshot.rows);
    assert.deepEqual(finalised.revision.source_manifest,{schemaVersion:'FINANCIAL_ACTUAL_SOURCE_MANIFEST_V1',financialActualId:created.record.id,revisionId:created.revision.id,formulaVersion:'FINANCIAL_ACTUAL_V1',revenueMode:'HOURLY',workEntryIds:['80000000-0000-4000-8000-000000000001'],costLineIds:['90000000-0000-4000-8000-000000000001'],provenanceIds:['70000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001']});assert.match(finalised.revision.input_digest,/^[0-9a-f]{64}$/);
    assert.equal(await scalar(`select count(*)::integer value from public.audit_events where organisation_id=$1 and entity_id=$2 and event_type='financial_actual.finalised'`,[orgA,created.record.id]),1);
    assert.equal(await scalar(`select count(*)::integer value from public.transactional_outbox where organisation_id=$1 and aggregate_id=$2 and topic='financial.actual.finalised'`,[orgA,created.record.id]),1);
    await assert.rejects(db.exec(`update public.financial_actual_revisions set currency_code='NZD'where id='${created.revision.id}'`),/FINANCIAL_ACTUAL_FINAL_IMMUTABLE/);
    await db.close();
  })().catch(error => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
} else {
  const { calculateFinancialActualV1 } = require('../domain/financialActuals/calculation');
  const { FINANCIAL_ACTUAL_CALCULATION_FIXTURES } = require('../domain/financialActuals/fixtures');

  const invalidInputs = ['1e3','NaN','Infinity','-0.01','0.0000001','12345678901234.000000'].map(unitCost => ({
    ...FINANCIAL_ACTUAL_CALCULATION_FIXTURES[0].input,
    costLines: [{ id:'bad',category:'OTHER',quantity:'1.000000',unitCost }],
  }));
  invalidInputs.push(
    {...FINANCIAL_ACTUAL_CALCULATION_FIXTURES[0].input,workEntries:[{workDate:'2026-02-30',actualWorkHours:'1.0000'}]},
    {...FINANCIAL_ACTUAL_CALCULATION_FIXTURES[0].input,workEntries:[{workDate:'2026-08-20',actualWorkHours:'999999.9999'},{workDate:'2026-08-21',actualWorkHours:'0.0001'}]},
    {...FINANCIAL_ACTUAL_CALCULATION_FIXTURES[0].input,revenue:{mode:'MANUAL',manualRevenue:'0.00',provenance:{fieldPath:'revenue/manualRevenue',provenanceClass:'MANUAL_FINANCIAL_INPUT',effectiveValue:'0.00',unitCode:'AUD'}},costLines:[{id:'one',category:'OTHER',quantity:'100.000000',unitCost:'9999999999999.999900'},{id:'two',category:'OTHER',quantity:'100.000000',unitCost:'9999999999999.999900'}]},
  );

  test('matches PostgreSQL and TypeScript across the authoritative fixtures', () => {
    const fixtures = FINANCIAL_ACTUAL_CALCULATION_FIXTURES.map(fixture => {
      const expected = calculateFinancialActualV1(fixture.input);
      expect(expected).toMatchObject(fixture.expected);
      return { name: fixture.name, input: fixture.input, expected };
    });
    for (const input of invalidInputs) expect(() => calculateFinancialActualV1(input)).toThrow();
    expect(() => execFileSync(process.execPath, [__filename], {
      cwd: root,
      env: {
        ...process.env,
        FINANCIAL_ACTUAL_CALCULATION_PGLITE_CHILD: '1',
        FINANCIAL_ACTUAL_FIXTURES_JSON: JSON.stringify(fixtures),
        FINANCIAL_ACTUAL_INVALID_INPUTS_JSON: JSON.stringify(invalidInputs),
      },
      stdio: 'pipe',
    })).not.toThrow();
  });

  test('migration defines only Slice 2 calculation and finalisation authority', () => {
    const sql = fs.existsSync(slice2Migration) ? fs.readFileSync(slice2Migration, 'utf8') : '';
    expect(sql).toContain('ftf_calculate_financial_actual_v1');
    expect(sql).toContain('ftf_finalise_financial_actual_revision');
    expect(sql).toContain("'financial_actual.finalised'");
    expect(sql).toContain("'financial.actual.finalised'");
    expect(sql).not.toMatch(/operational_prefill|create_correction|archive_financial_actual/i);
    expect(sql).not.toMatch(/grant execute on function public\.ftf_calculate_financial_actual_v1[^;]*service_role/i);
  });
}
