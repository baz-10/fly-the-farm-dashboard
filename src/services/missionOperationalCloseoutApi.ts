type Fetcher=typeof fetch;
async function request(f:Fetcher,missionId:string,action?:string,body?:unknown){const path=`/api/v1/mission-operational-closeout?missionId=${encodeURIComponent(missionId)}${action?`&action=${action}`:''}`,response=await f(path,{credentials:'same-origin',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}),envelope=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(envelope?.error?.message||'Mission Operational Closeout is unavailable.'),{code:envelope?.error?.code,meta:envelope?.error?.meta});return envelope.data;}
export const createMissionOperationalCloseoutApi=(f:Fetcher=fetch)=>({
 read:(missionId:string)=>request(f,missionId),
 upload:(missionId:string,input:Record<string,unknown>)=>request(f,missionId,'import',input),
 saveResources:(missionId:string,expectedVersion:number,input:Record<string,unknown>)=>request(f,missionId,'resources',{expectedVersion,...input}),
 saveChemicals:(missionId:string,expectedVersion:number,input:Record<string,unknown>)=>request(f,missionId,'chemicals',{expectedVersion,...input}),
 saveEvents:(missionId:string,expectedVersion:number,events:Record<string,unknown>[])=>request(f,missionId,'events',{expectedVersion,events}),
 submit:(missionId:string,expectedVersion:number,input:Record<string,unknown>)=>request(f,missionId,'submit',{expectedVersion,...input}),
 complete:(missionId:string,operationalRevisionId:string,expectedVersion:number,declaration:string,overrideReason?:string)=>request(f,missionId,'complete',{operationalRevisionId,expectedVersion,declaration,...(overrideReason?{overrideReason}:{})})
});
export type MissionOperationalCloseoutApi=ReturnType<typeof createMissionOperationalCloseoutApi>;
