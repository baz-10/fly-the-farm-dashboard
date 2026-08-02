import { EquipmentKit } from '../types/aircraft';

type ApiRecord = Record<string, any>;
export type EquipmentKitWriteInput = Omit<EquipmentKit,'id'|'createdAt'|'updatedAt'|'rowVersion'|'activeAssignment'>;

export class EquipmentKitsApiError extends Error {
  constructor(readonly status:number,readonly code:string,message:string,readonly currentVersion?:number){super(message);this.name='EquipmentKitsApiError';}
}
const malformed=(field:string):never=>{throw new EquipmentKitsApiError(0,'MALFORMED_RESPONSE',`The Equipment Kits API returned an invalid ${field}.`);};
const string=(r:ApiRecord,k:string,empty=false)=>typeof r[k]==='string'&&(empty||r[k].trim())?r[k] as string:malformed(k);
const object=(r:ApiRecord,k:string)=>r[k]&&typeof r[k]==='object'&&!Array.isArray(r[k])?r[k] as ApiRecord:malformed(k);

export function mapEquipmentKitRecord(candidate:unknown):EquipmentKit {
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)) return malformed('record');
  const r=candidate as ApiRecord;
  if(!Array.isArray(r.components)||!Array.isArray(r.compatibleAircraft)||r.compatibleAircraft.some((id:any)=>typeof id!=='string')) return malformed('relationships');
  if(!Number.isInteger(r.rowVersion)||r.rowVersion<1) return malformed('rowVersion');
  const operationalData=object(r,'operationalData');
  return { id:string(r,'id'),operatingLocationId:string(r,'operatingLocationId'),name:string(r,'name'),type:string(r,'type') as EquipmentKit['type'],
    description:string(r,'description',true),specifications:object(r,'specifications') as EquipmentKit['specifications'],components:r.components,
    operationalData:operationalData as EquipmentKit['operationalData'],financialData:object(r,'financialData') as EquipmentKit['financialData'],
    compatibleAircraft:r.compatibleAircraft,activeAssignment:r.activeAssignment||null,notes:typeof r.notes==='string'?r.notes:'',rowVersion:r.rowVersion,
    createdAt:string(r,'createdAt'),updatedAt:string(r,'updatedAt') };
}

async function request(fetcher:typeof fetch,path:string,init:RequestInit={}):Promise<any>{
  const response=await fetcher(path,{...init,credentials:'same-origin',headers:{'Content-Type':'application/json',...(init.headers||{})}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok){const error=body?.error||{};throw new EquipmentKitsApiError(response.status,error.code||'EQUIPMENT_KITS_API_ERROR',error.message||'Equipment Kit request failed.',error.meta?.currentVersion);}
  return body?.data;
}

export function createEquipmentKitsApiGateway(fetcher:typeof fetch=fetch){return{
  async list(){const data=await request(fetcher,'/api/v1/equipment-kits?page=1&pageSize=100');if(!Array.isArray(data))return malformed('record list');return data.map(mapEquipmentKitRecord);},
  async create(input:EquipmentKitWriteInput){return mapEquipmentKitRecord(await request(fetcher,'/api/v1/equipment-kits',{method:'POST',body:JSON.stringify(input)}));},
  async update(id:string,input:EquipmentKitWriteInput,expectedVersion:number){return mapEquipmentKitRecord(await request(fetcher,`/api/v1/equipment-kits?id=${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({...input,expectedVersion})}));},
  async archive(id:string,expectedVersion:number){return mapEquipmentKitRecord(await request(fetcher,`/api/v1/equipment-kits?id=${encodeURIComponent(id)}`,{method:'DELETE',body:JSON.stringify({expectedVersion})}));},
  async assign(kitId:string,aircraftId:string,configurationName:string,configurationData:unknown){return request(fetcher,`/api/v1/equipment-kits?id=${encodeURIComponent(kitId)}&action=assign`,{method:'POST',body:JSON.stringify({aircraftId,configurationName,configurationData})});},
  async unassign(assignmentId:string,expectedVersion:number){return request(fetcher,`/api/v1/equipment-kits?id=${encodeURIComponent(assignmentId)}&action=unassign`,{method:'DELETE',body:JSON.stringify({expectedVersion})});},
};}
