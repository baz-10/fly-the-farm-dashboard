import React from 'react';
import { render, screen } from '@testing-library/react';
import MaintenanceCommand from './MaintenanceCommand';

jest.mock('../contexts/MaintenanceContext',()=>({useMaintenance:()=>({assets:[
 {id:'a1',tenantId:'t',sourceId:'a1',scope:'rpas',assetClass:'aircraft',name:'T100-001',status:'unserviceable',readings:{},createdAt:'x',updatedAt:'x'},
 {id:'t1',tenantId:'t',sourceId:'t1',scope:'fleet',assetClass:'truck',name:'Spray Truck',status:'serviceable',readings:{},createdAt:'x',updatedAt:'x'}],records:[{id:'r1',assetId:'a1',type:'defect',title:'Motor vibration',description:'',status:'reported',occurredAt:'2026-07-20',createdAt:'x',createdBy:'p',createdByName:'PIC',createdByRole:'contractor',affectsServiceability:true,resultingServiceability:'unserviceable',attachments:[]}],schedules:[],auditEvents:[],submitRecord:jest.fn(),isLoading:false})}));

test('shows command summary and action queue',()=>{
 render(<MaintenanceCommand/>);
 expect(screen.getByRole('heading',{name:'Maintenance Command'})).toBeInTheDocument();
 expect(screen.getByText('Motor vibration')).toBeInTheDocument();
 expect(screen.getByText('RPAS Compliance')).toBeInTheDocument();
 expect(screen.getByText('Vehicle & Support Fleet')).toBeInTheDocument();
});
