import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MaintenanceProvider, useMaintenance } from '../MaintenanceContext';
import { readSharedValue, writeSharedValue } from '../../services/persistence';
const aircraft: never[] = [];
const equipmentKits: never[] = [];
const deploymentAssets: never[] = [];
jest.mock('../AuthContext',()=>({useAuth:()=>({user:{id:'admin1',name:'Ben',role:'admin',tenantId:'tenant1'}})}));
jest.mock('../AircraftContext',()=>({useAircraft:()=>({aircraft,equipmentKits})}));
jest.mock('../WorkPackContext',()=>({useWorkPacks:()=>({assets:deploymentAssets})}));
jest.mock('../../services/persistence',()=>({PERSISTENCE_KEYS:{maintenance:'ftf_maintenance'},readSharedValue:jest.fn().mockResolvedValue({assets:[],schedules:[],records:[],auditEvents:[]}),writeSharedValue:jest.fn().mockResolvedValue(undefined)}));

beforeEach(() => {
 (readSharedValue as jest.Mock).mockResolvedValue({assets:[],schedules:[],records:[],auditEvents:[]});
 (writeSharedValue as jest.Mock).mockResolvedValue(undefined);
});

test('creates immutable defect records with an audit event',async()=>{
 const wrapper=({children}:{children:React.ReactNode})=><MaintenanceProvider>{children}</MaintenanceProvider>;
 const {result}=renderHook(()=>useMaintenance(),{wrapper}); await waitFor(()=>expect(result.current.isLoading).toBe(false));
 await act(()=>result.current.submitRecord({assetId:'a1',type:'defect',title:'Motor vibration',description:'After landing',status:'reported',occurredAt:'2026-07-20T10:00:00Z',affectsServiceability:true,resultingServiceability:'unserviceable',attachments:[]}));
 expect(result.current.records[0]).toMatchObject({title:'Motor vibration',createdBy:'admin1'});
 expect(result.current.auditEvents[0]).toMatchObject({action:'record-created'});
 expect((result.current as any).deleteRecord).toBeUndefined();
});
