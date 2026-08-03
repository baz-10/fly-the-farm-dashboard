export class MissionAuthorisationApiError extends Error{code:string;meta:unknown;constructor(message:string,code='MISSION_AUTHORISATION_API_ERROR',meta?:unknown){super(message);this.code=code;this.meta=meta;}}
async function request(path:string,init:RequestInit={}){const response=await fetch(path,{...init,credentials:'same-origin',headers:init.body?{'Content-Type':'application/json',...(init.headers||{})}:init.headers});const envelope=await response.json().catch(()=>({}));if(!response.ok)throw new MissionAuthorisationApiError(envelope?.error?.message||'Mission Authorisation is unavailable.',envelope?.error?.code,envelope?.error?.meta);return envelope.data;}
export function createMissionAuthorisationApi(){return{
 readiness:(missionId:string)=>request(`/api/v1/mission-authorisation?missionId=${encodeURIComponent(missionId)}&action=readiness`),
 read:(missionId:string)=>request(`/api/v1/mission-authorisation?missionId=${encodeURIComponent(missionId)}`),
 readPack:(missionId:string)=>request(`/api/v1/mission-authorisation?missionId=${encodeURIComponent(missionId)}&action=pack`),
 authorise:(missionId:string,expectedVersion:number,declaration:string)=>request(`/api/v1/mission-authorisation?missionId=${encodeURIComponent(missionId)}&action=authorise`,{method:'POST',body:JSON.stringify({expectedVersion,declaration})}),
 generatePack:(missionId:string,authorisationRevisionId:string,expectedVersion:number)=>request(`/api/v1/mission-authorisation?missionId=${encodeURIComponent(missionId)}&action=generate-pack`,{method:'POST',body:JSON.stringify({authorisationRevisionId,expectedVersion})})
};}
