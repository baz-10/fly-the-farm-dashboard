type Fetcher=typeof fetch;
async function request(fetcher:Fetcher){const response=await fetcher('/api/v1/compliance?action=overview',{credentials:'same-origin'});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload?.error?.message||'CASA Compliance overview could not be loaded.');return payload.data;}
export const createComplianceApi=(fetcher:Fetcher=fetch)=>({overview:()=>request(fetcher)});
