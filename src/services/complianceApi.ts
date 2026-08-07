type Fetcher=typeof fetch;
export type AuthorityEvidenceInput={file:File;evidenceRole:string;description?:string};
export type AuthorityUpload={uploadId:string};
export type UploadProgress=(index:number,state:'PREPARING'|'UPLOADING'|'UPLOADED'|'FAILED',percent:number)=>void;

const asDataUrl=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
export class ComplianceApiError extends Error{constructor(message:string,public code:string,public status:number,public correlationId?:string){super(message);this.name='Error';}}

async function request(fetcher:Fetcher,action='overview',init:RequestInit={}){
 const response=await fetcher(`/api/v1/compliance?action=${action}`,{credentials:'same-origin',headers:init.body?{'Content-Type':'application/json'}:undefined,...init}),text=await response.text(),payload=(()=>{try{return text?JSON.parse(text):{};}catch{return {};}})();
 if(!response.ok){const oversized=response.status===413;throw new ComplianceApiError(oversized?'The compliance file is too large for the old upload route. Use the secure file upload and try again.':payload?.error?.message||'CASA Compliance request failed.',oversized?'FUNCTION_PAYLOAD_TOO_LARGE':payload?.error?.code||`HTTP_${response.status}`,response.status,payload?.error?.correlationId);}
 return payload.data;
}
const filePayload=async(file:File)=>({fileName:file.name,contentType:file.type,sizeBytes:file.size,dataUrl:await asDataUrl(file)});
const directUpload=(url:string,file:File,onProgress?:(percent:number)=>void)=>new Promise<void>((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',url);xhr.setRequestHeader('Content-Type',file.type);xhr.setRequestHeader('x-upsert','false');xhr.upload.addEventListener('progress',event=>{if(event.lengthComputable)onProgress?.(Math.round(event.loaded/event.total*100));});xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new ComplianceApiError('The compliance file could not be uploaded.','DIRECT_UPLOAD_FAILED',xhr.status));xhr.onerror=()=>reject(new ComplianceApiError('The compliance file could not be uploaded.','DIRECT_UPLOAD_FAILED',0));xhr.send(file);});

export const createComplianceApi=(fetcher:Fetcher=fetch)=>({
 overview:()=>request(fetcher),
 readAuthorityRegister:()=>request(fetcher,'register'),
 saveInstrument:async(input:any,file?:File)=>request(fetcher,'instrument',{method:'POST',body:JSON.stringify({...input,file:file?await filePayload(file):undefined})}),
 publishManual:async(input:any,file:File)=>request(fetcher,'manual',{method:'POST',body:JSON.stringify({...input,file:await filePayload(file)})}),
 uploadAuthorityFiles:async(inputs:AuthorityEvidenceInput[],onProgress?:UploadProgress):Promise<AuthorityUpload[]>=>{
  const uploads:AuthorityUpload[]=[];
  for(let index=0;index<inputs.length;index++){const{file,evidenceRole,description}=inputs[index];onProgress?.(index,'PREPARING',0);try{const authorised=await request(fetcher,'upload-authorise',{method:'POST',body:JSON.stringify({originalFilename:file.name,contentType:file.type,sizeBytes:file.size,evidenceRole,description})});onProgress?.(index,'UPLOADING',0);await directUpload(authorised.uploadUrl,file,percent=>onProgress?.(index,'UPLOADING',percent));uploads.push({uploadId:authorised.uploadId});onProgress?.(index,'UPLOADED',100);}catch(error){onProgress?.(index,'FAILED',0);throw error;}}
  return uploads;
 },
 createAuthority:(input:any,uploads:AuthorityUpload[])=>request(fetcher,'authority-create',{method:'POST',body:JSON.stringify({...input,uploads})}),
 appendAuthorityEvidence:(authorityId:string,expectedVersion:number,uploads:AuthorityUpload[])=>request(fetcher,'evidence-append',{method:'POST',body:JSON.stringify({authorityId,expectedVersion,uploads})}),
});
