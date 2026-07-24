import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Mock } from 'vitest';
import { MaintenanceProvider, useMaintenance } from '../MaintenanceContext';
import { readSharedValue, writeSharedValue } from '../../services/persistence';
const aircraft: never[] = [];
const equipmentKits: never[] = [];
const deploymentAssets: never[] = [];
vi.mock('../AuthContext',()=>({useAuth:()=>({user:{id:'admin1',name:'Ben',role:'admin',tenantId:'tenant1'}})}));
vi.mock('../AircraftContext',()=>({useAircraft:()=>({aircraft,equipmentKits})}));
vi.mock('../WorkPackContext',()=>({useWorkPacks:()=>({assets:deploymentAssets})}));
vi.mock('../../services/persistence',()=>({PERSISTENCE_KEYS:{maintenance:'ftf_maintenance'},readSharedValue:vi.fn().mockResolvedValue({assets:[],schedules:[],records:[],auditEvents:[]}),writeSharedValue:vi.fn().mockResolvedValue(undefined)}));

beforeEach(() => {
 (readSharedValue as Mock).mockResolvedValue({assets:[],schedules:[],records:[],auditEvents:[]});
 (writeSharedValue as Mock).mockResolvedValue(undefined);
});

test('creates immutable defect records with an audit event',async()=>{
 const wrapper=({children}:{children:React.ReactNode})=><MaintenanceProvider>{children}</MaintenanceProvider>;
 const {result}=renderHook(()=>useMaintenance(),{wrapper}); await waitFor(()=>expect(result.current.isLoading).toBe(false));
 await act(()=>result.current.submitRecord({assetId:'a1',type:'defect',title:'Motor vibration',description:'After landing',status:'reported',occurredAt:'2026-07-20T10:00:00Z',affectsServiceability:true,resultingServiceability:'unserviceable',attachments:[]}));
 expect(result.current.records[0]).toMatchObject({title:'Motor vibration',createdBy:'admin1'});
 expect(result.current.auditEvents[0]).toMatchObject({action:'record-created'});
 expect((result.current as any).deleteRecord).toBeUndefined();
});
