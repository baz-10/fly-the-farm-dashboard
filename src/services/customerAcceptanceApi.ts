type Fetcher = typeof fetch;
async function request(fetcher:Fetcher,path:string,body?:unknown){const response=await fetcher(path,{credentials:'same-origin',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});const envelope=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(envelope?.error?.message||'Customer Acceptance is unavailable.'),{code:envelope?.error?.code});return envelope.data;}
export function createCustomerAcceptanceApi(fetcher:Fetcher=fetch){return{
 read:(missionId:string)=>request(fetcher,`/api/v1/customer-acceptance?missionId=${encodeURIComponent(missionId)}`),
 record:(missionId:string,input:Record<string,unknown>)=>request(fetcher,`/api/v1/customer-acceptance?missionId=${encodeURIComponent(missionId)}&action=record`,input),
 stageFile:(missionId:string,input:Record<string,unknown>)=>request(fetcher,`/api/v1/customer-acceptance?missionId=${encodeURIComponent(missionId)}&action=file`,input),
 issueLink:(missionId:string,input:Record<string,unknown>)=>request(fetcher,`/api/v1/customer-acceptance?missionId=${encodeURIComponent(missionId)}&action=link-issue`,input),
 revokeLink:(missionId:string,input:Record<string,unknown>)=>request(fetcher,`/api/v1/customer-acceptance?missionId=${encodeURIComponent(missionId)}&action=link-revoke`,input),
 resolvePublic:(token:string)=>request(fetcher,`/api/v1/customer-acceptance-public?token=${encodeURIComponent(token)}`),
 stagePublicSignature:(token:string,input:Record<string,unknown>)=>request(fetcher,`/api/v1/customer-acceptance-public?token=${encodeURIComponent(token)}&action=signature`,input),
 stagePublicFile:(token:string,input:Record<string,unknown>)=>request(fetcher,`/api/v1/customer-acceptance-public?token=${encodeURIComponent(token)}&action=file`,input),
 submitPublic:(token:string,input:Record<string,unknown>)=>request(fetcher,`/api/v1/customer-acceptance-public?token=${encodeURIComponent(token)}&action=submit`,input),
};}
export const customerAcceptanceApi=createCustomerAcceptanceApi();
