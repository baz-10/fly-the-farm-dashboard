import { MaintenanceAsset, MaintenanceRecord, MaintenanceSchedule, MaintenanceStore } from '../types/maintenance';
import { calculateScheduleStatus } from './maintenanceSchedule';

export function getAssetServiceability(asset:MaintenanceAsset,records:MaintenanceRecord[],schedules:MaintenanceSchedule[]){
 const open=records.filter(r=>r.assetId===asset.id&&!['serviceable'].includes(r.status)&&r.affectsServiceability);
 const overdue=schedules.filter(s=>s.assetId===asset.id&&s.mandatory&&['due','overdue'].includes(calculateScheduleStatus(s,asset.readings).state));
 const unserviceable=asset.status==='unserviceable'||open.some(r=>r.resultingServiceability==='unserviceable')||overdue.length>0;
 return {state:unserviceable?'unserviceable' as const:'serviceable' as const,blockers:[...open.map(r=>r.title),...overdue.map(s=>`${s.title} overdue`)]};
}
export interface MissionMaintenanceSelection{aircraftIds:string[];supportAssets:Array<{id:string;missionCritical:boolean}>}
export function getMissionMaintenanceBlockers(selection:MissionMaintenanceSelection,store:MaintenanceStore){
 const ids=[...selection.aircraftIds,...selection.supportAssets.filter(a=>a.missionCritical).map(a=>a.id)];
 return ids.flatMap(id=>{const asset=store.assets.find(a=>a.id===id||a.sourceId===id);if(!asset)return[];const state=getAssetServiceability(asset,store.records,store.schedules);return state.state==='unserviceable'?[{assetId:asset.id,assetName:asset.name,reasons:state.blockers.length?state.blockers:['Asset is unserviceable']}]:[];});
}
