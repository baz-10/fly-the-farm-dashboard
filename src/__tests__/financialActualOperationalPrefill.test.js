const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const migrations = path.join(root, 'supabase/migrations');
const migration = path.join(migrations, '20260822120000_financial_actual_operational_prefill.sql');
const child = process.env.FINANCIAL_ACTUAL_PREFILL_PGLITE_CHILD === '1';

if (child) {
  const assert = require('assert/strict');
  const { TextDecoder, TextEncoder } = require('util');
  global.TextDecoder = TextDecoder; global.TextEncoder = TextEncoder;
  const { PGlite } = require('@electric-sql/pglite');
  const ids = {
    authA:'10000000-0000-4000-8000-000000000001',authB:'10000000-0000-4000-8000-000000000002',
    client:'20000000-0000-4000-8000-000000000001',property:'30000000-0000-4000-8000-000000000001',field:'40000000-0000-4000-8000-000000000001',job:'50000000-0000-4000-8000-000000000001',mission:'60000000-0000-4000-8000-000000000001',
    person:'61000000-0000-4000-8000-000000000001',aircraft:'62000000-0000-4000-8000-000000000001',kit:'63000000-0000-4000-8000-000000000001',product:'64000000-0000-4000-8000-000000000001',
    authorisation:'65000000-0000-4000-8000-000000000001',resource1:'66000000-0000-4000-8000-000000000001',chemical1:'67000000-0000-4000-8000-000000000001',operational1:'68000000-0000-4000-8000-000000000001',completion1:'69000000-0000-4000-8000-000000000001',
  };
  (async()=>{
    const db=new PGlite();
    const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
    const call=(name,args)=>scalar(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args);
    await db.exec(`create schema auth;create table auth.users(id uuid primary key,email text unique);create function auth.uid()returns uuid language sql stable as $$select null::uuid$$;create role anon;create role authenticated;create role service_role;`);
    for(const name of[
      '20260801000000_production_beta_foundation.sql','20260801006000_live_chain_access_prerequisites.sql','20260801012000_legacy_runtime_dependencies.sql','20260801013000_production_beta_identity_bootstrap.sql',
    ])await db.exec(fs.readFileSync(path.join(migrations,name),'utf8'));
    await db.exec(`insert into auth.users(id,email)values('${ids.authA}','a@example.test'),('${ids.authB}','b@example.test')`);
    const a=await call('ftf_bootstrap_production_beta_organisation',[ids.authA,'Org A','Admin A','Base A',null,'Australia/Brisbane']);
    const b=await call('ftf_bootstrap_production_beta_organisation',[ids.authB,'Org B','Admin B','Base B',null,'Australia/Brisbane']);
    for(const name of[
      '20260802000000_authoritative_aircraft.sql','20260802010000_authoritative_equipment_kits.sql','20260802024000_authoritative_personnel.sql','20260803110000_mission_authorisation_and_pack.sql','20260803120000_authoritative_operational_closeout.sql','20260803121000_operational_closeout_integrity_guards.sql',
      '20260822100000_financial_actual_authority.sql','20260822110000_financial_actual_calculation_and_finalisation.sql','20260822120000_financial_actual_operational_prefill.sql',
    ])await db.exec(fs.readFileSync(path.join(migrations,name),'utf8'));
    const org=a.organisation_id,actor=a.internal_user_id,base=a.operating_location_id;
    await db.exec(`
      insert into public.clients(id,organisation_id,name)values('${ids.client}','${org}','Client');
      insert into public.properties(id,organisation_id,client_id,name)values('${ids.property}','${org}','${ids.client}','Property');
      insert into public.fields(id,organisation_id,property_id,name,area_hectares)values('${ids.field}','${org}','${ids.property}','Field',20);
      insert into public.jobs(id,organisation_id,client_id,property_id,reference)values('${ids.job}','${org}','${ids.client}','${ids.property}','JOB-1');
      insert into public.job_fields(organisation_id,property_id,job_id,field_id)values('${org}','${ids.property}','${ids.job}','${ids.field}');
      insert into public.missions(id,organisation_id,job_id,operating_location_id,mission_number,status)values('${ids.mission}','${org}','${ids.job}','${base}','MIS-1','completed');
      insert into public.personnel(id,organisation_id,full_name,created_by_internal_user_id,updated_by_internal_user_id)values('${ids.person}','${org}','Pilot','${actor}','${actor}');
      insert into public.personnel_operating_locations(organisation_id,personnel_id,operating_location_id,created_by_internal_user_id)values('${org}','${ids.person}','${base}','${actor}');
      insert into public.aircraft(id,organisation_id,operating_location_id,registration,manufacturer,model,serial_number,status,serviceability_state,mission_ready,mtow,max_altitude,max_wind_speed,insurance_policy_number,insurance_provider,insurance_expiry_date,insurance_coverage_amount,hull_value,min_operating_temp,max_operating_temp,max_payload_weight,max_flight_time,service_range,minimum_crew_size,created_by_internal_user_id,updated_by_internal_user_id)values('${ids.aircraft}','${org}','${base}','FTF-T100','DJI','T100','SERIAL-1','operational','serviceable',true,149.9,120,50,'POL-1','Provider','2027-08-22',100000,50000,-10,50,80,20,10,1,'${actor}','${actor}');
      insert into public.equipment_kits(id,organisation_id,operating_location_id,name,kit_type,status,created_by_internal_user_id,updated_by_internal_user_id)values('${ids.kit}','${org}','${base}','Spray kit','spray_system','available','${actor}','${actor}');
      insert into public.mission_authorisation_revisions(id,organisation_id,operating_location_id,mission_id,version_number,evidence_manifest,readiness_snapshot,declaration,authorised_personnel_id,authorised_personnel_snapshot,authorised_by_internal_user_id)values('${ids.authorisation}','${org}','${base}','${ids.mission}',1,'{}','{}','Authorised','${ids.person}','{}','${actor}');
      insert into public.mission_operational_resource_revisions(id,organisation_id,operating_location_id,mission_id,version_number,actual_resources,recorded_by_internal_user_id,recorded_at)values('${ids.resource1}','${org}','${base}','${ids.mission}',1,'{"aircraftIds":["${ids.aircraft}"],"equipmentKitIds":["${ids.kit}"],"personnelIds":["${ids.person}"]}','${actor}','2026-08-20T08:00:00Z');
      insert into public.mission_operational_chemical_revisions(id,organisation_id,operating_location_id,mission_id,version_number,changed_from_plan,actual_usage,recorded_by_internal_user_id,recorded_at)values('${ids.chemical1}','${org}','${base}','${ids.mission}',1,true,'{"actualTreatmentAreaHa":"12.400000","products":[{"productId":"${ids.product}","productVersion":"7","productName":"Product A","actualQuantity":"42.600000","unit":"L"}]}','${actor}','2026-08-20T08:05:00Z');
      insert into public.mission_operational_revisions(id,organisation_id,operating_location_id,mission_id,version_number,authorisation_revision_id,resource_revision_id,chemical_revision_id,review_snapshot,submitted_by_internal_user_id,submitted_at)values('${ids.operational1}','${org}','${base}','${ids.mission}',1,'${ids.authorisation}','${ids.resource1}','${ids.chemical1}','{}','${actor}','2026-08-20T08:10:00Z');
      insert into public.mission_completion_revisions(id,organisation_id,operating_location_id,mission_id,version_number,authorisation_revision_id,operational_revision_id,completion_snapshot,declaration,completed_by_internal_user_id,completed_at)values('${ids.completion1}','${org}','${base}','${ids.mission}',1,'${ids.authorisation}','${ids.operational1}','{}','Complete','${actor}','2026-08-20T08:15:00Z');
    `);
    const payload=()=>({operatingLocationId:base,clientId:ids.client,propertyId:ids.property,fieldId:ids.field,jobId:ids.job,missionId:ids.mission,currencyCode:'AUD',formulaVersion:'FINANCIAL_ACTUAL_V1',startDate:'2026-08-20',endDate:'2026-08-21',provenance:[
      {id:'70000000-0000-4000-8000-000000000001',fieldPath:'workEntries/2026-08-20/actualWorkHours',provenanceClass:'MANUAL_FINANCIAL_INPUT',originalValue:'3.0000',effectiveValue:'3.0000',unitCode:'HOUR'},
      {id:'71000000-0000-4000-8000-000000000001',fieldPath:'costLines/90000000-0000-4000-8000-000000000001/amount',provenanceClass:'MANUAL_FINANCIAL_INPUT',originalValue:'1.0000',effectiveValue:'1.0000',unitCode:'AUD'},
      {id:'72000000-0000-4000-8000-000000000001',fieldPath:'revenue/mode',provenanceClass:'MANUAL_FINANCIAL_INPUT',originalValue:'AREA',effectiveValue:'AREA',unitCode:'REVENUE_MODE'},
      {id:'73000000-0000-4000-8000-000000000001',fieldPath:'revenue/ratePerHectare',provenanceClass:'MANUAL_FINANCIAL_INPUT',originalValue:'100.000000',effectiveValue:'100.000000',unitCode:'AUD_PER_HECTARE'},
    ],workEntries:[{id:'80000000-0000-4000-8000-000000000001',workDate:'2026-08-20',actualWorkHours:'3.0000',provenanceId:'70000000-0000-4000-8000-000000000001'}],costLines:[{id:'90000000-0000-4000-8000-000000000001',category:'OTHER',subtype:'MISCELLANEOUS',description:'Fee',quantity:'3.000000',unitCode:'EA',unitCost:'0.333333',amount:'1.0000',provenanceId:'71000000-0000-4000-8000-000000000001'}]});
    const created=await call('ftf_create_financial_actual',[org,actor,JSON.stringify(payload())]);

    const proposal=await call('ftf_read_financial_actual_operational_prefill',[org,actor,created.record.id]);
    assert.equal(proposal.missionId,ids.mission);assert.equal(proposal.completionRevisionId,ids.completion1);assert.equal(proposal.completionVersion,1);assert.match(proposal.proposalDigest,/^[0-9a-f]{64}$/);
    assert.deepEqual(proposal.sources,{mission:{id:ids.mission,version:2},completion:{id:ids.completion1,version:1,recordedAt:'2026-08-20T08:15:00+00:00'},operational:{id:ids.operational1,version:1,recordedAt:'2026-08-20T08:10:00+00:00'},chemicals:{id:ids.chemical1,version:1,recordedAt:'2026-08-20T08:05:00+00:00'},resources:{id:ids.resource1,version:1,recordedAt:'2026-08-20T08:00:00+00:00'}});
    const fields=Object.fromEntries(proposal.facts.map(f=>[f.fieldPath,f]));
    assert.equal(fields['revenue/actualHectares'].value,'12.400000');assert.equal(fields['revenue/actualHectares'].unitCode,'HECTARE');
    assert.equal(fields[`operational/products/${ids.product}/actualQuantity`].value,'42.600000');assert.equal(fields[`operational/aircraft/${ids.aircraft}`].value,ids.aircraft);assert.equal(fields[`operational/equipmentKits/${ids.kit}`].value,ids.kit);assert.equal(fields[`operational/personnel/${ids.person}`].value,ids.person);
    assert.equal(JSON.stringify(proposal).match(/unitCost|purchasePrice|wage|hourlyCost|financialCost/gi),null);
    assert.equal(await scalar(`select count(*)::integer value from public.financial_actual_value_provenance where financial_actual_revision_id=$1`,[created.revision.id]),4);

    assert.deepEqual(await call('ftf_read_financial_actual_operational_prefill',[b.organisation_id,b.internal_user_id,created.record.id]),{not_found:true});
    await db.exec(`delete from public.role_permissions where organisation_id='${org}'and permission_id in(select id from public.permissions where organisation_id='${org}'and code='financial_actuals.update')`);
    await assert.rejects(call('ftf_read_financial_actual_operational_prefill',[org,actor,created.record.id]),/FINANCIAL_ACTUAL_FORBIDDEN/);
    await db.exec(`insert into public.role_permissions(organisation_id,role_id,permission_id)select '${org}',r.id,p.id from public.roles r join public.permissions p on p.organisation_id=r.organisation_id where r.organisation_id='${org}'and r.code='admin'and p.code='financial_actuals.update'on conflict do nothing;delete from public.role_permissions where organisation_id='${org}'and permission_id in(select id from public.permissions where organisation_id='${org}'and code='financial_actuals.create')`);
    assert.equal((await call('ftf_read_financial_actual_operational_prefill',[org,actor,created.record.id])).missionId,ids.mission);

    const area=fields['revenue/actualHectares'];
    await assert.rejects(call('ftf_accept_financial_actual_operational_prefill',[org,actor,created.record.id,created.revision.id,created.revision.row_version,JSON.stringify({proposalDigest:proposal.proposalDigest,selections:[{evidenceIdentity:area.evidenceIdentity,action:'ACCEPT'},{evidenceIdentity:area.evidenceIdentity,action:'ACCEPT'}]})]),/FINANCIAL_ACTUAL_PREFILL_SELECTION_DUPLICATE/);
    assert.equal(await scalar(`select count(*)::integer value from public.financial_actual_value_provenance where financial_actual_revision_id=$1`,[created.revision.id]),4);
    const accepted=await call('ftf_accept_financial_actual_operational_prefill',[org,actor,created.record.id,created.revision.id,created.revision.row_version,JSON.stringify({proposalDigest:proposal.proposalDigest,acceptAll:true})]);
    assert.equal(accepted.revision.row_version,2);assert.equal(accepted.acceptedCount,proposal.facts.length);
    const areaEvidence=(await db.query(`select provenance_class,field_path,source_entity_type,source_entity_id,source_version,original_value#>>'{}' original,effective_value#>>'{}' effective,unit_code,created_by_internal_user_id from public.financial_actual_value_provenance where financial_actual_revision_id=$1 and field_path='revenue/actualHectares'`,[created.revision.id])).rows;
    assert.deepEqual(areaEvidence,[{provenance_class:'AUTHORITATIVE_OPERATIONAL_INPUT',field_path:'revenue/actualHectares',source_entity_type:'mission_operational_chemical_revision',source_entity_id:ids.chemical1,source_version:'1',original:'12.400000',effective:'12.400000',unit_code:'HECTARE',created_by_internal_user_id:actor}]);
    assert.deepEqual(await call('ftf_accept_financial_actual_operational_prefill',[org,actor,created.record.id,created.revision.id,1,JSON.stringify({proposalDigest:proposal.proposalDigest,acceptAll:true})]),{conflict:true,current_version:2});
    assert.equal(await scalar(`select count(*)::integer value from public.audit_events where organisation_id=$1 and event_type='financial_actual.operational_prefill_accepted'`,[org]),1);
    assert.equal(await scalar(`select count(*)::integer value from public.transactional_outbox where organisation_id=$1 and topic='financial.actual.operational_prefill_accepted'`,[org]),1);

    const refreshed=await call('ftf_read_financial_actual_operational_prefill',[org,actor,created.record.id]);
    assert.equal(refreshed.facts.find(f=>f.fieldPath==='revenue/actualHectares').comparison,'UNCHANGED');
    const product=refreshed.facts.find(f=>f.fieldPath.startsWith('operational/products/'));
    const overridden=await call('ftf_accept_financial_actual_operational_prefill',[org,actor,created.record.id,created.revision.id,2,JSON.stringify({proposalDigest:refreshed.proposalDigest,selections:[{evidenceIdentity:product.evidenceIdentity,action:'OVERRIDE',effectiveValue:'40.000000',overrideReason:'Verified stock reconciliation'}]})]);
    assert.equal(overridden.revision.row_version,3);
    const productEvidence=(await db.query(`select provenance_class,predecessor_provenance_id,original_value#>>'{}' original,effective_value#>>'{}' effective,override_reason from public.financial_actual_value_provenance where financial_actual_revision_id=$1 and field_path=$2 order by predecessor_provenance_id nulls first,id`,[created.revision.id,product.fieldPath])).rows;
    assert.equal(productEvidence.length,2);assert.equal(productEvidence[0].provenance_class,'AUTHORITATIVE_OPERATIONAL_INPUT');assert.equal(productEvidence[1].provenance_class,'MANUAL_OVERRIDE');assert.equal(productEvidence[1].predecessor_provenance_id!==null,true);assert.equal(productEvidence[1].original,'42.600000');assert.equal(productEvidence[1].effective,'40.000000');assert.equal(productEvidence[1].override_reason,'Verified stock reconciliation');

    const finalised=await call('ftf_finalise_financial_actual_revision',[org,actor,created.record.id,created.revision.id,created.record.row_version,3]);
    assert.equal(finalised.revision.status,'FINAL');assert.equal(finalised.revision.source_manifest.schemaVersion,'FINANCIAL_ACTUAL_SOURCE_MANIFEST_V1');assert.equal(finalised.revision.source_manifest.operationalSources.completion.id,ids.completion1);
    const frozen=JSON.stringify(finalised.revision);
    const chemical2='67000000-0000-4000-8000-000000000002',operational2='68000000-0000-4000-8000-000000000002',completion2='69000000-0000-4000-8000-000000000002';
    await db.exec(`insert into public.mission_operational_chemical_revisions(id,organisation_id,operating_location_id,mission_id,version_number,changed_from_plan,actual_usage,recorded_by_internal_user_id)values('${chemical2}','${org}','${base}','${ids.mission}',2,true,'{"actualTreatmentAreaHa":"13.000000","products":[]}','${actor}');insert into public.mission_operational_revisions(id,organisation_id,operating_location_id,mission_id,version_number,authorisation_revision_id,resource_revision_id,chemical_revision_id,review_snapshot,submitted_by_internal_user_id)values('${operational2}','${org}','${base}','${ids.mission}',2,'${ids.authorisation}','${ids.resource1}','${chemical2}','{}','${actor}');insert into public.mission_completion_revisions(id,organisation_id,operating_location_id,mission_id,version_number,authorisation_revision_id,operational_revision_id,completion_snapshot,declaration,completed_by_internal_user_id)values('${completion2}','${org}','${base}','${ids.mission}',2,'${ids.authorisation}','${operational2}','{}','Corrected','${actor}')`);
    const drift=await call('ftf_read_financial_actual_source_drift',[org,actor,created.record.id]);
    assert.equal(drift.status,'SOURCE_CHANGED_SINCE_FINALISATION');assert.equal(drift.completion.status,'SUPERSEDED');assert.equal(drift.facts.some(f=>f.fieldPath==='revenue/actualHectares'&&f.status==='CHANGED_VALUE'),true);assert.equal(drift.facts.some(f=>f.fieldPath===product.fieldPath&&f.status==='SOURCE_REMOVED_OR_SUPERSEDED'),true);
    assert.equal(JSON.stringify((await db.query(`select to_jsonb(r) value from public.financial_actual_revisions r where id=$1`,[created.revision.id])).rows[0].value),frozen);
    await db.exec('set role service_role');try{await assert.rejects(db.query(`select * from public.financial_actual_value_provenance`));await assert.rejects(db.query(`select public.ftf_financial_actual_operational_proposal('${org}','${actor}','${created.record.id}')`));}finally{await db.exec('reset role')}
    await db.close();
  })().catch(e=>{process.stderr.write(`${e.stack||e}\n`);process.exitCode=1});
} else {
  test('applies exact operational evidence to a Draft only through checked explicit acceptance',()=>{
    expect(()=>execFileSync(process.execPath,[__filename],{cwd:root,env:{...process.env,FINANCIAL_ACTUAL_PREFILL_PGLITE_CHILD:'1'},stdio:'pipe'})).not.toThrow();
  },240000);
  test('migration remains Slice 3 only and exposes only checked service-role RPCs',()=>{
    const sql=fs.existsSync(migration)?fs.readFileSync(migration,'utf8'):'';
    for(const name of['ftf_read_financial_actual_operational_prefill','ftf_accept_financial_actual_operational_prefill','ftf_read_financial_actual_source_drift'])expect(sql).toContain(name);
    expect(sql).not.toMatch(/create_correction|archive_financial_actual|quote|fleet.*cost/i);
    expect(sql).not.toMatch(/grant execute on function public\.ftf_financial_actual_operational_proposal[^;]*service_role/i);
  });
}
