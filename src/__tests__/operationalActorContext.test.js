jest.mock('../../server/platform-request-context',()=>({resolvePlatformRequestContext:jest.fn()}));
const { resolvePlatformRequestContext }=require('../../server/platform-request-context');
const { resolveOperationalActorContext }=require('../../server/operational-actor-context');

test('support cookie resolves a platform actor without an internal tenant user',async()=>{
 resolvePlatformRequestContext.mockResolvedValue({platformUser:{id:'platform-1',name:'Support'},permissions:['platform.support.session']});
 const repository={resolveSession:jest.fn().mockResolvedValue({id:'session-1',organisationId:'org-1',organisationName:'Farm Co',platformUserId:'platform-1',accessMode:'READ_WRITE',scopeType:'ORGANISATION',reason:'Support',state:'ACTIVE',expiresAt:'2099-01-01T00:00:00Z',approvedByInternalUserId:'approver-1'}),listOperatingLocationIds:jest.fn().mockResolvedValue(['location-1'])};
 const context=await resolveOperationalActorContext({headers:{cookie:'sc_support_session=session-1'}},{},{supportRepository:repository});
 expect(context).toMatchObject({actorType:'PLATFORM_SUPPORT',platformUser:{id:'platform-1'},organisation:{id:'org-1'},supportSession:{id:'session-1',approvedByInternalUserId:'approver-1'},operatingLocationIds:['location-1']});
 expect(context.internalUser).toBeUndefined();
});
