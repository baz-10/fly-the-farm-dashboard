export interface MissionSetupDraft { id:string; operatingLocationId:string|null; currentStep:number; furthestStep:number; clientId:string|null; propertyId:string|null; fieldId:string|null; jobId:string|null; missionId:string|null; formState:Record<string,unknown>; rowVersion:number; createdAt:string; updatedAt:string; }
export type MissionSetupDraftInput=Omit<MissionSetupDraft,'id'|'rowVersion'|'createdAt'|'updatedAt'>;
type Fetcher=typeof fetch;
async function request(fetcher:Fetcher,path:string,init:RequestInit={}){const response=await fetcher(path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...init}),envelope=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(envelope.error?.message||'Mission setup draft could not be saved.'),{code:envelope.error?.code,meta:envelope.error?.meta});return envelope.data;}
export const createMissionSetupDraftsApi=(fetcher:Fetcher=fetch)=>({
  list:()=>request(fetcher,'/api/v1/mission-setup-drafts') as Promise<MissionSetupDraft[]>,
  get:(id:string)=>request(fetcher,`/api/v1/mission-setup-drafts?id=${encodeURIComponent(id)}`) as Promise<MissionSetupDraft>,
  create:(input:MissionSetupDraftInput)=>request(fetcher,'/api/v1/mission-setup-drafts',{method:'POST',body:JSON.stringify(input)}) as Promise<MissionSetupDraft>,
  update:(id:string,expectedVersion:number,input:MissionSetupDraftInput)=>request(fetcher,`/api/v1/mission-setup-drafts?id=${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({...input,expectedVersion})}) as Promise<MissionSetupDraft>,
  archive:(id:string,expectedVersion:number)=>request(fetcher,`/api/v1/mission-setup-drafts?id=${encodeURIComponent(id)}`,{method:'DELETE',body:JSON.stringify({expectedVersion})}) as Promise<MissionSetupDraft>,
});
