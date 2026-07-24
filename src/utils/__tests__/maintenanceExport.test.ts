import { expect, test } from 'vitest';

import { buildRpasTechnicalLog, createFirmwareCampaign } from '../maintenanceExport';
import { MaintenanceStore } from '../../types/maintenance';

const store:MaintenanceStore={assets:[{id:'a1',tenantId:'t',sourceId:'a1',scope:'rpas',assetClass:'aircraft',name:'T100',status:'serviceable',readings:{},createdAt:'x',updatedAt:'x'}],schedules:[],auditEvents:[],records:[{id:'r1',tenantId:'t',assetId:'a1',type:'firmware',title:'Update',description:'',status:'serviceable',occurredAt:'2026-07-20',createdAt:'x',createdBy:'u',createdByName:'Ben',createdByRole:'admin',affectsServiceability:false,resultingServiceability:'serviceable',attachments:[],firmwareVersion:'2.0',cost:300},{id:'r2',tenantId:'t',assetId:'other',type:'defect',title:'Other',description:'',status:'reported',occurredAt:'2026-07-20',createdAt:'x',createdBy:'u',createdByName:'Ben',createdByRole:'admin',affectsServiceability:false,resultingServiceability:'unchanged',attachments:[]}]};

test('exports only the selected RPAS without financial fields',()=>{
 const result=buildRpasTechnicalLog('a1',store);
 expect(result.records).toHaveLength(1);
 expect(result.records[0]).not.toHaveProperty('cost');
});

test('creates one firmware task per asset',()=>expect(createFirmwareCampaign(['a1','a2'],'3.1')).toHaveLength(2));
