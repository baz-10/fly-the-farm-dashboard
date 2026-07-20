import React from 'react';
import { render, screen } from '@testing-library/react';
import MaintenanceAssetPanel from '../MaintenanceAssetPanel';

const mockTransitionRecord=jest.fn().mockResolvedValue(undefined);
jest.mock('../../../contexts/AuthContext',()=>({useAuth:()=>({user:{id:'admin1',name:'Maintenance Controller',role:'admin'}})}));
jest.mock('../../../contexts/MaintenanceContext',()=>({useMaintenance:()=>({assets:[{id:'a1',tenantId:'t',sourceId:'a1',scope:'rpas',assetClass:'aircraft',name:'T100',status:'unserviceable',readings:{flightHours:12},createdAt:'x',updatedAt:'x'}],records:[{id:'r1',assetId:'a1',type:'defect',title:'Motor fault',description:'',status:'reported',occurredAt:'x',createdAt:'x',createdBy:'p',createdByName:'PIC',createdByRole:'contractor',affectsServiceability:true,resultingServiceability:'unserviceable',attachments:[]}],schedules:[],auditEvents:[],submitRecord:jest.fn(),transitionRecord:mockTransitionRecord})}));

test('labels RPAS history and exposes its blocking defect',()=>{
 render(<MaintenanceAssetPanel assetId="a1"/>);
 expect(screen.getByText('CASA-aligned RPAS technical log')).toBeInTheDocument();
 expect(screen.getByText('Motor fault')).toBeInTheDocument();
 expect(screen.getAllByText(/Unserviceable/i)).not.toHaveLength(0);
});

test('lets a company administrator certify a return to service',async()=>{
 render(<MaintenanceAssetPanel assetId="a1"/>);
 screen.getByRole('button',{name:'Authorised release'}).click();
 expect(mockTransitionRecord).toHaveBeenCalledWith('r1','serviceable',expect.objectContaining({authority:'maintenance-controller'}));
});
