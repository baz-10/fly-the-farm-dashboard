export type MaintenanceAssetSource = 'aircraft' | 'equipment-kit' | 'fleet-asset';
export type MeterSource = 'MANUAL' | 'MISSION' | 'IMPORT';

export interface AssetAttachmentPeriod { id:string; parentAssetId:string; childAssetId:string; positionLabel:string; attachedAt:string; detachedAt?:string; rowVersion:number; }
export interface AssetMeterReading { id:string; meterDefinitionId:string; recordedAt:string; value:number; source:string; sourceSystem:string; sourceRecordId:string; supersedesReadingId?:string; }

export class MaintenanceApiError extends Error { constructor(readonly status:number,readonly code:string,message:string,readonly correlationId?:string){super(message);this.name='MaintenanceApiError';} }

async function call(action:string, body:Record<string,unknown>) {
  const response=await fetch(`/api/v1/asset-maintenance?action=${encodeURIComponent(action)}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const envelope=await response.json().catch(()=>({}));
  if(!response.ok)throw new MaintenanceApiError(response.status,envelope?.error?.code||`HTTP_${response.status}`,envelope?.error?.message||'Maintenance request failed.',response.headers.get('X-Correlation-ID')||undefined);
  if(!envelope?.data||typeof envelope.data!=='object')throw new MaintenanceApiError(0,'MALFORMED_RESPONSE','The maintenance API returned an invalid record.');
  return envelope.data;
}

export const maintenanceApi={
  attach:(input:{parentAssetId:string;childAssetId:string;positionLabel:string;attachedAt:string;meterSnapshot?:Record<string,number>})=>call('attach',input),
  detach:(id:string,expectedVersion:number,detachedAt:string,meterSnapshot?:Record<string,number>)=>call('detach',{id,expectedVersion,detachedAt,meterSnapshot}),
  recordReading:(input:{meterDefinitionId:string;recordedAt:string;value:number;source:MeterSource;sourceSystem:string;sourceRecordId:string;evidence?:Record<string,unknown>})=>call('record-reading',input),
  correctReading:(input:{meterDefinitionId:string;supersedesReadingId:string;recordedAt:string;value:number;sourceSystem:string;sourceRecordId:string;correctionReason:string;evidence?:Record<string,unknown>})=>call('correct-reading',input),
};
