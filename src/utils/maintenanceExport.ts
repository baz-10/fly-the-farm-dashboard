import { MaintenanceRecordInput, MaintenanceStore } from '../types/maintenance';

export function createFirmwareCampaign(assetIds:string[],version:string,previousVersions:Record<string,string>={}) : MaintenanceRecordInput[] {
 return assetIds.map(assetId=>({assetId,type:'firmware',title:`Firmware update to ${version}`,description:'Firmware campaign task',status:'reported',occurredAt:new Date().toISOString(),affectsServiceability:false,resultingServiceability:'unchanged',attachments:[],firmwareVersion:version,previousFirmwareVersion:previousVersions[assetId]}));
}

export function buildRpasTechnicalLog(assetId:string,store:MaintenanceStore){
 const asset=store.assets.find(item=>item.id===assetId);
 if(!asset||asset.scope!=='rpas')throw new Error('RPAS maintenance asset not found.');
 const records=store.records.filter(item=>item.assetId===assetId).sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)).map(({cost:_cost,...record})=>record);
 return {generatedAt:new Date().toISOString(),notice:'CASA-aligned operator record; use does not itself guarantee compliance.',identity:asset,schedules:store.schedules.filter(item=>item.assetId===assetId),records,auditEvents:store.auditEvents.filter(item=>item.assetId===assetId)};
}

const csvCell=(value:unknown)=>`"${String(value??'').replace(/"/g,'""')}"`;
export function downloadRpasTechnicalLogCsv(assetId:string,store:MaintenanceStore){
 const log=buildRpasTechnicalLog(assetId,store);const headings=['Date/time','Asset','Type','Title','Description','Status','Recorded by','Firmware','Certification'];
 const rows=log.records.map(r=>[r.occurredAt,log.identity.name,r.type,r.title,r.description,r.status,r.createdByName,r.firmwareVersion||'',r.certification?.statement||''].map(csvCell).join(','));
 const blob=new Blob([[headings.map(csvCell).join(','),...rows].join('\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${log.identity.name.replace(/[^a-z0-9]+/gi,'-')}-technical-log.csv`;a.click();URL.revokeObjectURL(url);
}
