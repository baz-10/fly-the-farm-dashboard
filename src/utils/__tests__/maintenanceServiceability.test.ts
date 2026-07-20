import { getAssetServiceability, getMissionMaintenanceBlockers } from '../maintenanceServiceability';
import { MaintenanceAsset, MaintenanceRecord } from '../../types/maintenance';

const asset: MaintenanceAsset = { id:'a1',tenantId:'t',sourceId:'a1',scope:'rpas',assetClass:'aircraft',name:'T100',status:'serviceable',readings:{},createdAt:'',updatedAt:'' };
const defect: MaintenanceRecord = { id:'r1',tenantId:'t',assetId:'a1',type:'defect',title:'Motor defect',description:'',status:'reported',occurredAt:'',createdAt:'',createdBy:'u',createdByName:'PIC',createdByRole:'contractor',affectsServiceability:true,resultingServiceability:'unserviceable',attachments:[] };

test('open safety defect grounds an asset and blocks its mission', () => {
  expect(getAssetServiceability(asset,[defect],[]).state).toBe('unserviceable');
  expect(getMissionMaintenanceBlockers({ aircraftIds:['a1'], supportAssets:[] },{assets:[asset],records:[defect],schedules:[],auditEvents:[]})).toHaveLength(1);
});

test('non-critical support asset never blocks', () => {
  const truck={...asset,id:'truck',sourceId:'truck',scope:'fleet' as const,assetClass:'truck' as const,status:'unserviceable' as const};
  expect(getMissionMaintenanceBlockers({ aircraftIds:[], supportAssets:[{id:'truck',missionCritical:false}] },{assets:[truck],records:[],schedules:[],auditEvents:[]})).toEqual([]);
});
