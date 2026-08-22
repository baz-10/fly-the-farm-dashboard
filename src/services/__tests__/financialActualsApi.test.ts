import { createFinancialActualsApi, FinancialActualApiError } from '../financialActualsApi';

const ID='10000000-0000-4000-8000-000000000001';
const ok=(data:unknown)=>Promise.resolve({ok:true,status:200,json:async()=>({data})} as Response);
const list={schemaVersion:'FINANCIAL_ACTUAL_LIST_V1',rows:[{id:ID,reference:'FA-000001',operatingLocation:{id:ID,label:'Fly The Farm Base'},client:{id:ID,label:'Client'},job:{id:ID,label:'JOB-1'},mission:null,lifecycle:'FINAL',activeDraft:null,currentFinalRevisionNumber:1,finalCalculation:{revenue:'100.0000',totalCost:'40.0000',grossProfit:'60.0000',grossMarginPercentage:'60.0000'},sourceDrift:'UNCHANGED',archived:false}],nextCursor:null};
const detail={schemaVersion:'FINANCIAL_ACTUAL_AUTHORITY_DETAIL_V1',record:{id:ID,reference:'FA-000001',organisationId:ID,operatingLocationId:ID,clientId:ID,propertyId:ID,fieldId:ID,jobId:ID,missionId:null,rowVersion:2,archivedAt:null,currentFinalRevisionId:null,activeDraftRevisionId:ID},hierarchy:{operatingLocation:{id:ID,label:'Base'},client:{id:ID,label:'Client'},property:{id:ID,label:'Property'},field:{id:ID,label:'Field'},job:{id:ID,label:'JOB-1'},mission:null},draft:{id:ID,revisionNumber:1,status:'DRAFT',rowVersion:2,currencyCode:'AUD',formulaVersion:'FINANCIAL_ACTUAL_V1',startDate:'2026-08-20',endDate:'2026-08-21',operationalSources:{},revenueInputs:{'revenue/mode':'AREA','revenue/actualHectares':'12.400000','revenue/ratePerHectare':'100.000000'},workEntries:[{id:ID,workDate:'2026-08-20',actualWorkHours:'3.0000',provenanceId:ID}],costLines:[{id:ID,category:'OTHER',subtype:'MISCELLANEOUS',description:'Fee',incurredOn:null,quantity:'3.000000',unitCode:'EA',unitCost:'0.333333',amount:'1.0000',provenanceId:ID,displayOrder:0}],provenance:[{id:ID,fieldPath:'revenue/actualHectares',provenanceClass:'MANUAL_FINANCIAL_INPUT',predecessorProvenanceId:null,sourceEntityType:null,sourceEntityId:null,sourceVersion:null,sourceRecordedAt:null,originalValue:'12.400000',effectiveValue:'12.400000',unitCode:'HECTARE',overrideReason:null,acceptedByInternalUserId:ID,acceptedAt:'2026-08-20T00:00:00Z'}]},final:null,sourceDrift:{status:'NO_ACCEPTED_OPERATIONAL_SOURCE'}};
const commandResult=(status:'DRAFT'|'FINAL',recordVersion=2,revisionVersion=3)=>({record:{id:ID,organisation_id:ID,operating_location_id:ID,reference:'FA-000001',client_id:ID,property_id:ID,field_id:ID,job_id:ID,mission_id:null,current_final_revision_id:status==='FINAL'?ID:null,active_draft_revision_id:status==='DRAFT'?ID:null,archived_at:null,archived_by_internal_user_id:null,archive_reason:null,created_by_internal_user_id:ID,updated_by_internal_user_id:ID,row_version:recordVersion,created_at:'2026-08-20T00:00:00Z',updated_at:'2026-08-20T00:00:00Z'},revision:{id:ID,organisation_id:ID,financial_actual_id:ID,revision_number:1,status,predecessor_revision_id:null,correction_reason:null,currency_code:'AUD',calculation_version:'FINANCIAL_ACTUAL_V1',start_date:'2026-08-20',end_date:'2026-08-21',source_manifest:{},input_snapshot:status==='FINAL'?{}:null,provenance_snapshot:status==='FINAL'?{}:null,calculation_snapshot:status==='FINAL'?{}:null,input_digest:status==='FINAL'?'a'.repeat(64):null,finalised_at:status==='FINAL'?'2026-08-20T00:00:00Z':null,finalised_by_internal_user_id:status==='FINAL'?ID:null,created_by_internal_user_id:ID,updated_by_internal_user_id:ID,row_version:revisionVersion,created_at:'2026-08-20T00:00:00Z',updated_at:'2026-08-20T00:00:00Z'}});

test('decodes complete authoritative list and detail responses with canonical decimal strings',async()=>{
  const fetcher=jest.fn().mockImplementationOnce(()=>ok(list)).mockImplementationOnce(()=>ok(detail));const api=createFinancialActualsApi(fetcher as any);
  await expect(api.list({pageSize:25})).resolves.toEqual(list);
  await expect(api.read(ID)).resolves.toEqual(detail);
  expect(fetcher.mock.calls[0][0]).toBe('/api/v1/financial-actuals?action=list&pageSize=25');
});

test.each(['1e3','NaN','Infinity','1.23456',100])('fails the whole response for malformed money %p',async(value)=>{
  const malformed=JSON.parse(JSON.stringify(list));malformed.rows[0].finalCalculation.revenue=value;
  const api=createFinancialActualsApi(jest.fn().mockResolvedValue(await ok(malformed)) as any);
  await expect(api.list()).rejects.toThrow('Financial Actual data could not be validated.');
});

test('fails the whole detail when provenance, pointers or cardinality are malformed',async()=>{
  const malformed=JSON.parse(JSON.stringify(detail));malformed.draft.provenance[0].sourceEntityId='foreign';
  const api=createFinancialActualsApi(jest.fn().mockResolvedValue(await ok(malformed)) as any);
  await expect(api.read(ID)).rejects.toThrow('Financial Actual data could not be validated.');
  const oversized=JSON.parse(JSON.stringify(detail));oversized.draft.workEntries=Array.from({length:367},()=>detail.draft!.workEntries[0]);
  const second=createFinancialActualsApi(jest.fn().mockResolvedValue(await ok(oversized)) as any);
  await expect(second.read(ID)).rejects.toThrow('Financial Actual data could not be validated.');
});

test('rejects calendar-normalised dates and incomplete frozen evidence',async()=>{
  const badDate=JSON.parse(JSON.stringify(detail));badDate.draft.startDate='2026-02-30';
  await expect(createFinancialActualsApi(jest.fn().mockResolvedValue(await ok(badDate)) as any).read(ID)).rejects.toThrow('Financial Actual data could not be validated.');
  const finalDetail=JSON.parse(JSON.stringify(detail));finalDetail.record.activeDraftRevisionId=null;finalDetail.record.currentFinalRevisionId=ID;finalDetail.draft=null;finalDetail.final={id:ID,revisionNumber:1,status:'FINAL',rowVersion:3,currencyCode:'AUD',formulaVersion:'FINANCIAL_ACTUAL_V1',startDate:'2026-08-20',endDate:'2026-08-20',input:{},provenance:{rows:['not-an-evidence-row']},calculation:{formulaVersion:'FINANCIAL_ACTUAL_V1',currencyCode:'AUD',operationalDays:1,totalHours:'3.0000',revenue:'3.0000',totalCost:'0.0000',grossProfit:'3.0000',grossMarginPercentage:'100.0000',effectiveHourlyRevenue:'1.0000',categoryTotals:{LABOUR:'0.0000',PRODUCT:'0.0000',TRAVEL:'0.0000',AIRCRAFT_EQUIPMENT:'0.0000',OTHER:'0.0000'},lineAmounts:{}},sourceManifest:{schemaVersion:'FINANCIAL_ACTUAL_SOURCE_MANIFEST_V1'},inputDigest:'a'.repeat(64),finalisedAt:'2026-08-20T00:00:00Z',finalisedByInternalUserId:ID};
  await expect(createFinancialActualsApi(jest.fn().mockResolvedValue(await ok(finalDetail)) as any).read(ID)).rejects.toThrow('Financial Actual data could not be validated.');
});

test('rejects extra nested authority and values beyond numeric(18,6)',async()=>{const extra=JSON.parse(JSON.stringify(detail));extra.hierarchy.client.privateCommercialNote='must not cross the decoder';await expect(createFinancialActualsApi(jest.fn().mockResolvedValue(await ok(extra)) as any).read(ID)).rejects.toThrow('Financial Actual data could not be validated.');const oversized=JSON.parse(JSON.stringify(detail));oversized.draft.costLines[0].quantity='1000000000000.000000';await expect(createFinancialActualsApi(jest.fn().mockResolvedValue(await ok(oversized)) as any).read(ID)).rejects.toThrow('Financial Actual data could not be validated.')});

test('uses exact JSON decimal strings for mutations and never touches browser-local authority',async()=>{
  const get=jest.spyOn(Storage.prototype,'getItem'),set=jest.spyOn(Storage.prototype,'setItem');
  const fetcher=jest.fn().mockResolvedValue(await ok(commandResult('DRAFT',1,1)));const api=createFinancialActualsApi(fetcher as any);
  await api.create({formulaVersion:'FINANCIAL_ACTUAL_V1',currencyCode:'AUD',ratePerHectare:'0.333333'});
  const init=fetcher.mock.calls[0][1] as RequestInit;expect(JSON.parse(String(init.body)).payload.ratePerHectare).toBe('0.333333');expect(get).not.toHaveBeenCalled();expect(set).not.toHaveBeenCalled();get.mockRestore();set.mockRestore();
});

test('fails whole for malformed checked-command results',async()=>{
  const malformed=commandResult('DRAFT',1,1);malformed.revision.id='wrong';const api=createFinancialActualsApi(jest.fn().mockResolvedValue(await ok(malformed)) as any);
  await expect(api.create({formulaVersion:'FINANCIAL_ACTUAL_V1'})).rejects.toThrow('Financial Actual data could not be validated.');
});

test('decodes exact command identities and versions for create, update, prefill and finalise',async()=>{
  const draftResult=commandResult('DRAFT',2,3);
  const finalResult=commandResult('FINAL',3,4);
  const fetcher=jest.fn().mockImplementationOnce(()=>ok(draftResult)).mockImplementationOnce(()=>ok(draftResult)).mockImplementationOnce(()=>ok({...draftResult,acceptedCount:2})).mockImplementationOnce(()=>ok(finalResult));
  const api=createFinancialActualsApi(fetcher as any);
  await expect(api.create({})).resolves.toMatchObject({actualId:ID,revisionId:ID,actualVersion:2,revisionVersion:3,status:'DRAFT'});
  await expect(api.updateDraft({actualId:ID,revisionId:ID,expectedVersion:2,payload:{}})).resolves.toMatchObject({status:'DRAFT'});
  await expect(api.acceptPrefill({actualId:ID,revisionId:ID,expectedVersion:2,payload:{}})).resolves.toMatchObject({acceptedCount:2});
  await expect(api.finalise({actualId:ID,revisionId:ID,expectedAggregateVersion:2,expectedRevisionVersion:3})).resolves.toMatchObject({status:'FINAL'});
});

test('returns a typed conflict and rejects unsafe diagnostics as a generic failure',async()=>{
  const conflict={ok:false,status:409,json:async()=>({error:{code:'FINANCIAL_ACTUAL_CONFLICT',message:'This Financial Actual was updated in another session.',currentVersion:7}})} as Response;
  await expect(createFinancialActualsApi(jest.fn().mockResolvedValue(conflict) as any).updateDraft({actualId:ID,revisionId:ID,expectedVersion:6,payload:{}})).rejects.toMatchObject({code:'FINANCIAL_ACTUAL_CONFLICT',currentVersion:7});
  const unsafe={ok:false,status:502,json:async()=>({error:{code:'UPSTREAM_SECRET',message:'Bearer sk-proj-secret',reference:'eyJhbGci.payload.signature'}})} as Response;
  try{await createFinancialActualsApi(jest.fn().mockResolvedValue(unsafe) as any).read(ID);throw new Error('expected failure');}catch(error){expect(error).toBeInstanceOf(FinancialActualApiError);expect(String(error)).not.toMatch(/secret|Bearer|eyJ/i);}
});

test('financialsStore is a fail-closed compatibility boundary with no local CRUD',async()=>{
  const store=await import('../financialsStore');expect(Object.keys(store).sort()).toEqual(['FINANCIALS_LOCAL_AUTHORITY_DISABLED']);expect(store.FINANCIALS_LOCAL_AUTHORITY_DISABLED).toBe(true);
});
