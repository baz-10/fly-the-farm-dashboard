const {createMissionSetupDraftsHandler}=require('../../server/operational-api');
const org='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',loc='33333333-3333-4333-8333-333333333333',id='44444444-4444-4444-8444-444444444444';
const ctx={organisation:{id:org},internalUser:{id:user},permissions:['missions.read','missions.create','missions.archive'],operatingLocationIds:[loc]};
const res=()=>({setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn(),end:jest.fn()});
const req=(method,body={},query={})=>({method,body,query,headers:{origin:'https://app.test',host:'app.test'}});
test('creates, reads and rejects stale setup draft writes through the versioned API',async()=>{
 const record={id,organisation_id:org,operating_location_id:loc,current_step:2,furthest_step:2,form_state:{field:{name:'North'}},row_version:1,created_at:'2026-08-04',updated_at:'2026-08-04'};
 const repository={writeMissionSetupDraft:jest.fn().mockResolvedValueOnce({record}).mockResolvedValueOnce({conflict:true,currentVersion:2}),getMissionSetupDraft:jest.fn().mockResolvedValue(record)};
 const handler=createMissionSetupDraftsHandler({repository,resolveContext:jest.fn().mockResolvedValue(ctx)}),response=res();
 await handler(req('POST',{operatingLocationId:loc,currentStep:2,furthestStep:2,formState:{}}),response);
 expect(response.status).toHaveBeenLastCalledWith(201);
 await handler(req('PATCH',{operatingLocationId:loc,currentStep:3,furthestStep:3,formState:{},expectedVersion:1},{id}),response);
 expect(response.status).toHaveBeenLastCalledWith(409);expect(response.json.mock.calls.at(-1)[0].error.code).toBe('VERSION_CONFLICT');
});
test('denies location scope before a setup draft write',async()=>{const repository={writeMissionSetupDraft:jest.fn()},handler=createMissionSetupDraftsHandler({repository,resolveContext:jest.fn().mockResolvedValue({...ctx,operatingLocationIds:[]})}),response=res();await handler(req('POST',{operatingLocationId:loc,currentStep:0,furthestStep:0,formState:{}}),response);expect(response.status).toHaveBeenCalledWith(403);expect(repository.writeMissionSetupDraft).not.toHaveBeenCalled();});
