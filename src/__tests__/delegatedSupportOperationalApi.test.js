const { createOperationalHandler } = require('../../server/operational-api');

function response(){return{statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(v){this.body=v;return this;},end(){return this;}};}
const orgContext={organisation:{id:'11111111-1111-4111-8111-111111111111'},internalUser:{id:'22222222-2222-4222-8222-222222222222'},permissions:['clients.*'],operatingLocationIds:[]};
const supportContext={actorType:'PLATFORM_SUPPORT',organisation:{id:'11111111-1111-4111-8111-111111111111'},platformUser:{id:'33333333-3333-4333-8333-333333333333'},supportSession:{id:'44444444-4444-4444-8444-444444444444',accessMode:'READ_WRITE',scopeType:'ORGANISATION',reason:'Assisted support'},permissions:['*'],operatingLocationIds:[]};

test('delegated support writes use the explicit support repository path',async()=>{
 const repository={createDelegated:jest.fn().mockResolvedValue({record:{id:'55555555-5555-4555-8555-555555555555',name:'Supported client',row_version:1}}),create:jest.fn()};
 const handler=createOperationalHandler('clients',{repository,resolveContext:async()=>supportContext});const res=response();
 await handler({method:'POST',headers:{origin:'https://example.test',host:'example.test'},query:{},body:{name:'Supported client'}},res);
 expect(res.statusCode).toBe(201);expect(repository.createDelegated).toHaveBeenCalledWith('clients',supportContext,expect.any(Object));expect(repository.create).not.toHaveBeenCalled();
});

test('read-only delegated support cannot write',async()=>{
 const repository={createDelegated:jest.fn()};const handler=createOperationalHandler('clients',{repository,resolveContext:async()=>({...supportContext,supportSession:{...supportContext.supportSession,accessMode:'READ_ONLY'}})});const res=response();
 await handler({method:'POST',headers:{origin:'https://example.test',host:'example.test'},query:{},body:{name:'Denied client'}},res);
 expect(res.statusCode).toBe(403);expect(res.body.error.code).toBe('SUPPORT_READ_ONLY');expect(repository.createDelegated).not.toHaveBeenCalled();
});

test('mission-scoped support cannot use an unrelated generic resource command',async()=>{
 const repository={createDelegated:jest.fn()};const handler=createOperationalHandler('clients',{repository,resolveContext:async()=>({...supportContext,supportSession:{...supportContext.supportSession,scopeType:'MISSION',missionId:'66666666-6666-4666-8666-666666666666'}})});const res=response();
 await handler({method:'POST',headers:{origin:'https://example.test',host:'example.test'},query:{},body:{name:'Denied client'}},res);
 expect(res.statusCode).toBe(403);expect(res.body.error.code).toBe('SUPPORT_SCOPE_MISMATCH');expect(repository.createDelegated).not.toHaveBeenCalled();
});

test('ordinary organisation writes retain the existing repository path',async()=>{
 const repository={create:jest.fn().mockResolvedValue({record:{id:'55555555-5555-4555-8555-555555555555',name:'Tenant client',row_version:1}}),createDelegated:jest.fn()};
 const handler=createOperationalHandler('clients',{repository,resolveContext:async()=>orgContext});const res=response();
 await handler({method:'POST',headers:{origin:'https://example.test',host:'example.test'},query:{},body:{name:'Tenant client'}},res);
 expect(res.statusCode).toBe(201);expect(repository.create).toHaveBeenCalled();expect(repository.createDelegated).not.toHaveBeenCalled();
});

test('delegated reads record the viewed resource under the support session',async()=>{
 const id='55555555-5555-4555-8555-555555555555',repository={get:jest.fn().mockResolvedValue({id,name:'Viewed client',row_version:1}),recordDelegatedActivity:jest.fn().mockResolvedValue({recorded:true})};
 const handler=createOperationalHandler('clients',{repository,resolveContext:async()=>supportContext});const res=response();
 await handler({method:'GET',headers:{},query:{id}},res);
 expect(res.statusCode).toBe(200);expect(repository.recordDelegatedActivity).toHaveBeenCalledWith(supportContext,'READ','clients',id,'SUCCEEDED');
});
