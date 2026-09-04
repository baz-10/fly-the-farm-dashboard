const { createFinancialActualsHandler } = require('../../server/financial-actuals-api');
const { FinancialActualsRepository } = require('../../server/financial-actuals-repository');
const { createDefaultHandlers } = require('../../server/operational-dispatcher');

const UUID = '10000000-0000-4000-8000-000000000001';
const context = (permissions = ['financial_actuals.read']) => ({
  organisation: { id: UUID }, internalUser: { id: '20000000-0000-4000-8000-000000000001' },
  operatingLocationIds: ['30000000-0000-4000-8000-000000000001'], permissions, roles: ['contractor'],
});
const response = () => ({ statusCode: 200, body: null, headers: {}, setHeader(k,v){this.headers[k.toLowerCase()]=v;}, status(v){this.statusCode=v;return this;}, json(v){this.body=v;return this;} });
const request = (method='GET', action='list', body={}, query={}) => ({ method, body, query:{ action, ...query }, headers:{ origin:'https://spray.test', host:'spray.test', 'x-forwarded-proto':'https' }, correlationId:'request-12345678' });
const repository = () => ({
  list: jest.fn().mockResolvedValue({ schemaVersion:'FINANCIAL_ACTUAL_LIST_V1',rows:[],nextCursor:null }),
  read: jest.fn().mockResolvedValue({ schemaVersion:'FINANCIAL_ACTUAL_AUTHORITY_DETAIL_V1' }),
  create: jest.fn().mockResolvedValue({ record:{ id:UUID } }), updateDraft: jest.fn().mockResolvedValue({}),
  readPrefill: jest.fn().mockResolvedValue({}), acceptPrefill: jest.fn().mockResolvedValue({}),
  readSourceDrift: jest.fn().mockResolvedValue({ status:'UNCHANGED' }), finalise: jest.fn().mockResolvedValue({}),
  createCorrection:jest.fn().mockResolvedValue({schemaVersion:'FINANCIAL_ACTUAL_CORRECTION_V1'}),
  revisionHistory:jest.fn().mockResolvedValue({schemaVersion:'FINANCIAL_ACTUAL_REVISION_HISTORY_V1',rows:[]}),
  historicalRevision:jest.fn().mockResolvedValue({schemaVersion:'FINANCIAL_ACTUAL_HISTORICAL_REVISION_V1'}),
  archive:jest.fn().mockResolvedValue({schemaVersion:'FINANCIAL_ACTUAL_ARCHIVE_V1'}),
});

test('registers the exact financial-actuals route and permits only bounded checked list/read actions', async () => {
  expect(createDefaultHandlers()).toHaveProperty('financial-actuals');
  const repo=repository(),handler=createFinancialActualsHandler({repository:repo,resolveContext:async()=>context()});
  const listRes=response();await handler(request('GET','list',{}, { pageSize:'25' }),listRes);
  expect(listRes.statusCode).toBe(200);expect(repo.list).toHaveBeenCalledWith(expect.anything(),{operatingLocationId:null,afterId:null,pageSize:25});
  const readRes=response();await handler(request('GET','read',{}, { actualId:UUID }),readRes);
  expect(readRes.statusCode).toBe(200);expect(repo.read).toHaveBeenCalledWith(expect.anything(),UUID);
  const invalid=response();await handler(request('GET','rpc',{}, { rpc:'ftf_read_financial_actual_authority' }),invalid);
  expect(invalid.statusCode).toBe(400);expect(JSON.stringify(invalid.body)).not.toContain('ftf_read');
});

test('requires exact permissions rather than role names', async () => {
  const repo=repository(),handler=createFinancialActualsHandler({repository:repo,resolveContext:async()=>context([])}),res=response();
  await handler(request('GET','list'),res);
  expect(res.statusCode).toBe(403);expect(repo.list).not.toHaveBeenCalled();
});

test('requires same-origin and exact action permissions for mutations', async () => {
  const repo=repository(),handler=createFinancialActualsHandler({repository:repo,resolveContext:async()=>context(['financial_actuals.create'])});
  const cross=request('POST','create',{payload:{}});cross.headers.origin='https://evil.test';const denied=response();await handler(cross,denied);
  expect(denied.statusCode).toBe(403);expect(repo.create).not.toHaveBeenCalled();
  const allowed=response();await handler(request('POST','create',{payload:{formulaVersion:'FINANCIAL_ACTUAL_V1'}}),allowed);
  expect(allowed.statusCode).toBe(201);expect(repo.create).toHaveBeenCalledTimes(1);
  const finalise=response();await handler(request('POST','finalise',{actualId:UUID,revisionId:UUID,expectedAggregateVersion:1,expectedRevisionVersion:1}),finalise);
  expect(finalise.statusCode).toBe(403);expect(repo.finalise).not.toHaveBeenCalled();
});

test('maps conflicts and not-found results without leaking dependency diagnostics', async () => {
  const repo=repository();repo.updateDraft.mockResolvedValue({conflict:true,current_version:7});
  const handler=createFinancialActualsHandler({repository:repo,resolveContext:async()=>context(['financial_actuals.update'])}),conflict=response();
  await handler(request('POST','update-draft',{actualId:UUID,revisionId:UUID,expectedVersion:6,payload:{}}),conflict);
  expect(conflict.statusCode).toBe(409);expect(conflict.body).toEqual({error:{code:'FINANCIAL_ACTUAL_CONFLICT',message:'This Financial Actual was updated in another session.',currentVersion:7}});
  repo.read.mockRejectedValue(Object.assign(new Error('Bearer secret-value'),{statusCode:502,code:'UPSTREAM_secret',publicMessage:'token=secret'}));
  const readHandler=createFinancialActualsHandler({repository:repo,resolveContext:async()=>context(['financial_actuals.read'])}),failed=response();await readHandler(request('GET','read',{}, {actualId:UUID}),failed);
  expect(failed.statusCode).toBe(502);expect(JSON.stringify(failed.body)).not.toMatch(/secret|Bearer|token=/i);expect(failed.body.error.code).toBe('FINANCIAL_ACTUAL_UNAVAILABLE');
});

test('rejects malformed identifiers, versions, pages and oversized bodies before repository access', async () => {
  const repo=repository(),handler=createFinancialActualsHandler({repository:repo,resolveContext:async()=>context(['financial_actuals.read','financial_actuals.update'])});
  for(const req of[
    request('GET','read',{}, {actualId:'not-a-uuid'}),request('GET','list',{}, {pageSize:'101'}),
    request('POST','update-draft',{actualId:UUID,revisionId:UUID,expectedVersion:0,payload:{}}),
    request('POST','update-draft',{actualId:UUID,revisionId:UUID,expectedVersion:1,payload:{notes:'x'.repeat(200001)}}),
  ]){const res=response();await handler(req,res);expect(res.statusCode).toBe(400);}
  expect(repo.read).not.toHaveBeenCalled();expect(repo.updateDraft).not.toHaveBeenCalled();
});

test('maps finalisation to the exact reviewed PostgreSQL parameter names',async()=>{
  const requestRpc=jest.fn().mockResolvedValue({}),repo=new FinancialActualsRepository(requestRpc);
  await repo.finalise(context(['financial_actuals.finalise']),{actualId:UUID,revisionId:UUID,expectedAggregateVersion:2,expectedRevisionVersion:3});
  expect(JSON.parse(requestRpc.mock.calls[0][1].body)).toEqual({p_organisation_id:UUID,p_actor_internal_user_id:'20000000-0000-4000-8000-000000000001',p_financial_actual_id:UUID,p_revision_id:UUID,p_expected_aggregate_version:2,p_expected_draft_version:3});
});

test('allows only the four checked Slice 5 actions with exact permissions',async()=>{
  const repo=repository(),handler=createFinancialActualsHandler({repository:repo,resolveContext:async()=>context(['financial_actuals.read','financial_actuals.update','financial_actuals.archive'])});
  const history=response();await handler(request('GET','revision-history',{}, {actualId:UUID,pageSize:'25'}),history);expect(history.statusCode).toBe(200);expect(repo.revisionHistory).toHaveBeenCalledWith(expect.anything(),{actualId:UUID,beforeRevisionNumber:null,pageSize:25});
  const historical=response();await handler(request('GET','historical-revision',{}, {actualId:UUID,revisionId:UUID}),historical);expect(historical.statusCode).toBe(200);expect(repo.historicalRevision).toHaveBeenCalledWith(expect.anything(),{actualId:UUID,revisionId:UUID});
  const correction=response();await handler(request('POST','create-correction',{actualId:UUID,expectedAggregateVersion:3,expectedFinalRevisionId:UUID,expectedFinalRevisionVersion:4,correctionReason:'Correct product cost.'}),correction);expect(correction.statusCode).toBe(201);expect(repo.createCorrection).toHaveBeenCalledTimes(1);
  const archive=response();await handler(request('POST','archive',{actualId:UUID,expectedAggregateVersion:4,archiveReason:'No longer operational'}),archive);expect(archive.statusCode).toBe(200);expect(repo.archive).toHaveBeenCalledTimes(1);
  const tooLong=response();await handler(request('POST','archive',{actualId:UUID,expectedAggregateVersion:4,archiveReason:'x'.repeat(501)}),tooLong);expect(tooLong.statusCode).toBe(400);expect(repo.archive).toHaveBeenCalledTimes(1);
});

test('maps active Draft archive/correction conflicts explicitly and makes no second command',async()=>{
  const repo=repository();repo.archive.mockResolvedValue({active_draft_conflict:true,code:'ACTIVE_DRAFT_CONFLICT',revision_id:UUID});const handler=createFinancialActualsHandler({repository:repo,resolveContext:async()=>context(['financial_actuals.archive'])}),res=response();await handler(request('POST','archive',{actualId:UUID,expectedAggregateVersion:4,archiveReason:'Archive'}),res);expect(res.statusCode).toBe(409);expect(res.body).toEqual({error:{code:'ACTIVE_DRAFT_CONFLICT',message:'Resolve the active Financial Actual Draft before archiving.'}});expect(repo.archive).toHaveBeenCalledTimes(1);
});

test('maps Slice 5 repository calls to exact checked RPC parameters',async()=>{const requestRpc=jest.fn().mockResolvedValue({}),repo=new FinancialActualsRepository(requestRpc),ctx=context(['*']);await repo.createCorrection(ctx,{actualId:UUID,expectedAggregateVersion:2,expectedFinalRevisionId:UUID,expectedFinalRevisionVersion:3,correctionReason:'Reason'});await repo.revisionHistory(ctx,{actualId:UUID,beforeRevisionNumber:null,pageSize:25});await repo.historicalRevision(ctx,{actualId:UUID,revisionId:UUID});await repo.archive(ctx,{actualId:UUID,expectedAggregateVersion:4,archiveReason:'Archive'});expect(requestRpc.mock.calls.map(call=>call[0])).toEqual(['rest/v1/rpc/ftf_create_financial_actual_correction','rest/v1/rpc/ftf_read_financial_actual_revision_history','rest/v1/rpc/ftf_read_financial_actual_historical_revision','rest/v1/rpc/ftf_archive_financial_actual']);expect(JSON.parse(requestRpc.mock.calls[0][1].body)).toMatchObject({p_expected_final_revision_id:UUID,p_expected_final_revision_version:3,p_correction_reason:'Reason'});});
