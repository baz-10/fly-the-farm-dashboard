type Fetcher = typeof fetch;
export type ChecklistScope = { operatingLocationId: string; lifecycleStage: string; missionId?: string; aircraftId?: string; maintainableAssetId?: string; assetSystemId?: string; componentPositionId?: string; configurationCode?: string };
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid=():never=>{throw new Error('Checklist response was invalid.');};
const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:invalid();
const id=(v:unknown)=>typeof v==='string'&&UUID.test(v)?v:invalid();
const text=(v:unknown,max=500)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v)?v:invalid();
const positiveInteger=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0?v:invalid();
const sections=(value:unknown)=>{
  const list=Array.isArray(value)?value:invalid();if(list.length>100)invalid();
  return list.map(raw=>{const section=object(raw),items=Array.isArray(section.items)?section.items:invalid();if(items.length>300)invalid();return{id:text(section.id,100),title:text(section.title,300),items:items.map(rawItem=>{const item=object(rawItem),responseType=text(item.responseType,40),required=item.required!==false;return{id:text(item.id,100),prompt:text(item.prompt,2000),responseType,type:responseType,required,mandatory:required,allowNA:item.allowNA===true,evidenceRequired:item.evidenceRequired===true,authorityClass:text(item.authorityClass,60),sourceItemId:item.sourceItemId===null||item.sourceItemId===undefined?null:text(item.sourceItemId,100),options:Array.isArray(item.options)?item.options.map(x=>text(x,200)):[]};})};});
};
function applicable(data:unknown){const root=object(data),records=Array.isArray(root.records)?root.records:invalid();if(records.length>500)invalid();return records.map(raw=>{const row=object(raw),template=object(row.template),version=object(row.version),application=object(row.applicability);const templateId=id(template.id),versionId=id(version.id);return{id:templateId,name:text(template.name,300),category:text(template.category,100),authority_scope:text(template.authority_scope,30),applicability:{id:id(application.id),operatingLocationId:application.operating_location_id===null?null:id(application.operating_location_id),lifecycleStage:text(application.lifecycle_stage,50),readinessRequired:application.readiness_required===true},checklist_template_versions:[{id:versionId,template_id:templateId,version_number:positiveInteger(version.version_number),status:text(version.status,30),authority_scope:text(version.authority_scope,30),source_system_template_version_id:version.source_system_template_version_id===null?null:id(version.source_system_template_version_id),sections:sections(version.sections)}]};});}
function missionRecords(data:unknown){const records=Array.isArray(data)?data:invalid();if(records.length>500)invalid();return records.map(raw=>{const row=object(raw);return{id:id(row.id),template_id:id(row.template_id),template_version_id:id(row.template_version_id),status:text(row.status,30),row_version:positiveInteger(row.row_version),responses:object(row.responses),failure_summary:[],completed_at:row.completed_at===null?null:text(row.completed_at,50)};});}
const asDataUrl=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
async function call(fetcher:Fetcher,action:string,init:RequestInit={}){const r=await fetcher(`/api/v1/checklists?action=${action}`,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...init});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error('Checklist request failed.');return p.data;}
const query=(scope:ChecklistScope)=>{const q=new URLSearchParams({operatingLocationId:scope.operatingLocationId,lifecycleStage:scope.lifecycleStage});for(const[k,v]of Object.entries(scope))if(k!=='operatingLocationId'&&k!=='lifecycleStage'&&v)q.set(k,String(v));return q.toString();};
export const createChecklistsApi=(fetcher:Fetcher=fetch)=>({
 templates:async(scope:ChecklistScope)=>applicable(await call(fetcher,`templates&${query(scope)}`)),
 createTemplate:(body:any)=>call(fetcher,'template',{method:'POST',body:JSON.stringify({operation:'CREATE',...body})}),
 publish:(body:any)=>call(fetcher,'publish',{method:'POST',body:JSON.stringify(body)}),
 mission:async(missionId:string)=>missionRecords(await call(fetcher,`mission&missionId=${encodeURIComponent(missionId)}`)),
 readiness:(missionId:string,stage:string)=>call(fetcher,`readiness&missionId=${encodeURIComponent(missionId)}&lifecycleStage=${encodeURIComponent(stage)}`),
 start:(body:any)=>call(fetcher,'start',{method:'POST',body:JSON.stringify(body)}),save:(body:any)=>call(fetcher,'save',{method:'POST',body:JSON.stringify(body)}),submit:(body:any)=>call(fetcher,'submit',{method:'POST',body:JSON.stringify(body)}),
 uploadEvidence:async(executionId:string,itemId:string,evidenceKind:string,file:File)=>call(fetcher,'evidence',{method:'POST',body:JSON.stringify({executionId,itemId,evidenceKind,fileName:file.name,sizeBytes:file.size,dataUrl:await asDataUrl(file)})}),
 correctiveAction:(body:any)=>call(fetcher,'corrective-action',{method:'POST',body:JSON.stringify(body)})
});
