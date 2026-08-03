import {MissionJsaDraft,MissionJsaReadiness,MissionJsaRevision} from '../types/missionJsa';
export class MissionJsaApiError extends Error{code:string;meta:unknown;constructor(message:string,code='JSA_API_ERROR',meta?:unknown){super(message);this.code=code;this.meta=meta;}}
async function request(path:string,init:RequestInit={}){const response=await fetch(path,{...init,credentials:'same-origin',headers:init.body?{'Content-Type':'application/json',...(init.headers||{})}:init.headers});const envelope=await response.json().catch(()=>({}));if(!response.ok)throw new MissionJsaApiError(envelope?.error?.message||'Mission JSA is unavailable.',envelope?.error?.code,envelope?.error?.meta);return envelope;}
export function createMissionJsaApi(){return{
 async read(missionId:string,history=false):Promise<MissionJsaRevision|null|MissionJsaRevision[]>{return(await request(`/api/v1/mission-jsa?missionId=${encodeURIComponent(missionId)}${history?'&history=true':''}`)).data;},
 async readiness(missionId:string):Promise<MissionJsaReadiness>{return(await request(`/api/v1/mission-jsa?missionId=${encodeURIComponent(missionId)}&action=readiness`)).data;},
 async save(missionId:string,draft:MissionJsaDraft):Promise<MissionJsaRevision>{return(await request(`/api/v1/mission-jsa?missionId=${encodeURIComponent(missionId)}`,{method:'POST',body:JSON.stringify(draft)})).data;},
 async approve(missionId:string,revisionId:string,expectedVersion:number):Promise<{record:MissionJsaRevision;readiness:MissionJsaReadiness}>{const envelope=await request(`/api/v1/mission-jsa?missionId=${encodeURIComponent(missionId)}&action=approve`,{method:'POST',body:JSON.stringify({revisionId,expectedVersion})});return{record:envelope.data,readiness:envelope.meta.readiness};}
};}
