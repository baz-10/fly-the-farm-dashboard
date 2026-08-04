const { parseCookies, resolveRequestContext } = require('./request-context');
const { resolvePlatformRequestContext } = require('./platform-request-context');
const { SupportRepository } = require('./support-repository');
const { createHttpError } = require('./supabase');

async function resolveOperationalActorContext(req,res,dependencies={}){
  const sessionId=parseCookies(req).sc_support_session;
  if(!sessionId)return (dependencies.resolveOrganisationContext||resolveRequestContext)(req,res);
  const platform=await (dependencies.resolvePlatformContext||resolvePlatformRequestContext)(req,res);
  if(!platform.permissions?.includes('platform.support.session'))throw createHttpError(403,'Platform Support permission is required.');
  const repository=dependencies.supportRepository||new SupportRepository();
  const session=await repository.resolveSession(sessionId,platform.platformUser.id);
  if(!session||session.state!=='ACTIVE'||Date.now()>=new Date(session.expiresAt).getTime()){const error=createHttpError(403,'The delegated Support Session is unavailable or expired.');error.code='SUPPORT_SESSION_EXPIRED';throw error;}
  return{actorType:'PLATFORM_SUPPORT',user:{id:platform.authUser?.id||null,name:platform.platformUser.name},platformUser:platform.platformUser,organisation:{id:session.organisationId,name:session.organisationName},supportSession:session,permissions:['*'],roles:[],operatingLocationIds:await repository.listOperatingLocationIds(session.organisationId),entitlement:{seatActive:false,delegatedSupport:true}};
}

module.exports={resolveOperationalActorContext};
