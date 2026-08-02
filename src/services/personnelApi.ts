import { MissionPersonnelAssignment, MissionPersonnelRevision, PersonnelBlocker, PersonnelRecord, PersonnelWriteInput } from '../types/personnel';

type Fetcher=typeof fetch;
export class PersonnelApiError extends Error{constructor(message:string,public code:string,public status:number,public blockers?:PersonnelBlocker[],public currentVersion?:number){super(message);this.name='PersonnelApiError';}}
async function request(fetcher:Fetcher,path:string,init:RequestInit={}){const response=await fetcher(path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(init.headers||{})},...init});const payload=await response.json().catch(()=>({}));if(!response.ok){const error=payload?.error||{};throw new PersonnelApiError(error.message||'Personnel request failed.',error.code||'REQUEST_FAILED',response.status,error.meta?.blockers,error.meta?.currentVersion);}return payload.data;}

export function createPersonnelApi(fetcher:Fetcher=fetch){return{
 list:(operatingLocationId?:string)=>request(fetcher,`/api/v1/personnel${operatingLocationId?`?operatingLocationId=${encodeURIComponent(operatingLocationId)}`:''}`) as Promise<PersonnelRecord[]>,
 get:(id:string)=>request(fetcher,`/api/v1/personnel?id=${encodeURIComponent(id)}`) as Promise<PersonnelRecord>,
 create:(input:PersonnelWriteInput)=>request(fetcher,'/api/v1/personnel',{method:'POST',body:JSON.stringify(input)}) as Promise<PersonnelRecord>,
 update:(id:string,input:PersonnelWriteInput,expectedVersion:number)=>request(fetcher,`/api/v1/personnel?id=${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({...input,expectedVersion})}) as Promise<PersonnelRecord>,
 archive:(id:string,expectedVersion:number)=>request(fetcher,`/api/v1/personnel?id=${encodeURIComponent(id)}`,{method:'DELETE',body:JSON.stringify({expectedVersion})}) as Promise<PersonnelRecord>,
 link:(id:string,expectedVersion:number,internalUserId:string,membershipId:string)=>request(fetcher,`/api/v1/personnel?id=${encodeURIComponent(id)}&action=link`,{method:'POST',body:JSON.stringify({expectedVersion,internalUserId,membershipId})}) as Promise<PersonnelRecord>,
 addCredential:(id:string,input:Record<string,unknown>)=>request(fetcher,`/api/v1/personnel?id=${encodeURIComponent(id)}&action=credential`,{method:'POST',body:JSON.stringify(input)}),
 addEvidence:(id:string,input:Record<string,unknown>)=>request(fetcher,`/api/v1/personnel?id=${encodeURIComponent(id)}&action=evidence`,{method:'POST',body:JSON.stringify(input)}),
 readMissionAssignments:(missionId:string,history=false)=>request(fetcher,`/api/v1/mission-personnel?missionId=${encodeURIComponent(missionId)}${history?'&history=true':''}`) as Promise<MissionPersonnelRevision|null>,
 saveMissionAssignments:(missionId:string,expectedVersion:number,assignments:MissionPersonnelAssignment[])=>request(fetcher,`/api/v1/mission-personnel?missionId=${encodeURIComponent(missionId)}`,{method:'POST',body:JSON.stringify({expectedVersion,assignments})}) as Promise<MissionPersonnelRevision>,
};}
