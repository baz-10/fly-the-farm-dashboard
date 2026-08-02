const { createPersonnelHandler, createMissionPersonnelHandler } = require('../../server/operational-api');

const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', location='cccccccc-cccc-4ccc-8ccc-cccccccccccc', person='dddddddd-dddd-4ddd-8ddd-dddddddddddd', mission='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const context={organisation:{id:org},internalUser:{id:actor},permissions:['personnel.read','personnel.create','personnel.update','personnel.archive','personnel.assign','personnel.private.read'],operatingLocationIds:[location]};
const response=()=>{const res={headers:{},setHeader:(k,v)=>{res.headers[k]=v;},status:s=>{res.statusCode=s;return res;},json:b=>{res.body=b;return res;},end:()=>res};return res;};
const request=(method,body={},query={})=>({method,body,query,headers:{origin:'https://spray.test',host:'spray.test'}});

test('lists location-scoped Personnel and only requests private fields with permission',async()=>{
 const repository={listPersonnel:jest.fn().mockResolvedValue([{id:person,full_name:'Alex',row_version:1,operating_location_ids:[location],operational_roles:['pilot']}])};const res=response();
 await createPersonnelHandler({repository,resolveContext:jest.fn().mockResolvedValue(context)})(request('GET',{}, {operatingLocationId:location}),res);
 expect(res.statusCode).toBe(200);expect(repository.listPersonnel).toHaveBeenCalledWith(context,{operatingLocationId:location,includePrivate:true});expect(res.body.data[0]).toEqual(expect.objectContaining({fullName:'Alex',rowVersion:1}));
});

test('validates Personnel input and dispatches create without transport business logic',async()=>{
 const repository={writePersonnel:jest.fn().mockResolvedValue({record:{id:person,full_name:'Alex',row_version:1}})};const res=response();
 await createPersonnelHandler({repository,resolveContext:jest.fn().mockResolvedValue(context)})(request('POST',{fullName:'Alex',engagementStatus:'contractor',operatingLocationIds:[location],operationalRoles:['pilot']}),res);
 expect(res.statusCode).toBe(201);expect(repository.writePersonnel).toHaveBeenCalledWith(context,'create',null,null,expect.objectContaining({fullName:'Alex'}));
});

test('rejects unsupported Personnel actions and stale writes visibly',async()=>{
 const unsupported=response();await createPersonnelHandler({repository:{},resolveContext:jest.fn().mockResolvedValue(context)})(request('POST',{}, {action:'unknown'}),unsupported);expect(unsupported.statusCode).toBe(400);
 const repository={writePersonnel:jest.fn().mockResolvedValue({conflict:true,currentVersion:3}),listPersonnel:jest.fn().mockResolvedValue([{id:person,operating_location_ids:[location]}])};const stale=response();
 await createPersonnelHandler({repository,resolveContext:jest.fn().mockResolvedValue(context)})(request('PATCH',{expectedVersion:1,fullName:'Alex',engagementStatus:'contractor',operatingLocationIds:[location],operationalRoles:['pilot']},{id:person}),stale);
 expect(stale.statusCode).toBe(409);expect(stale.body.error.code).toBe('VERSION_CONFLICT');
});

test('Mission Personnel save preserves blockers and location authority',async()=>{
 const repository={get:jest.fn().mockResolvedValue({id:mission,operating_location_id:location}),saveMissionPersonnel:jest.fn().mockResolvedValue({qualificationBlockers:[{code:'PIC_CREDENTIAL_INVALID',message:'PIC credential invalid'}]})};const res=response();
 await createMissionPersonnelHandler({repository,resolveContext:jest.fn().mockResolvedValue(context)})(request('POST',{expectedVersion:0,assignments:[{personnelId:person,assignmentRole:'pilot_in_command'}]},{missionId:mission}),res);
 expect(res.statusCode).toBe(409);expect(res.body.error.code).toBe('QUALIFICATION_BLOCKED');expect(repository.saveMissionPersonnel).toHaveBeenCalled();
});

test('Personnel handlers enforce authentication and permission context',async()=>{
 const unauth=response();await createPersonnelHandler({repository:{},resolveContext:jest.fn().mockRejectedValue(Object.assign(new Error(),{statusCode:401,publicMessage:'Authentication required.'}))})(request('GET'),unauth);expect(unauth.statusCode).toBe(401);
 const forbidden=response();await createPersonnelHandler({repository:{},resolveContext:jest.fn().mockResolvedValue({...context,permissions:[]})})(request('GET'),forbidden);expect(forbidden.statusCode).toBe(403);
});
