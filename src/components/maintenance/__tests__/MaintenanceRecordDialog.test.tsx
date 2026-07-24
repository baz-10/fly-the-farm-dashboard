import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MaintenanceRecordDialog from '../MaintenanceRecordDialog';

const asset = { id:'a1', tenantId:'t1', sourceId:'a1', scope:'rpas' as const, assetClass:'aircraft' as const, name:'FTF-T100-001', status:'serviceable' as const, readings:{}, createdAt:'2026-07-20', updatedAt:'2026-07-20' };

test('submits a safety defect as unserviceable', async () => {
 const onSubmit=vi.fn().mockResolvedValue('r1');
 render(<MaintenanceRecordDialog open asset={asset} activity="defect" onClose={vi.fn()} onSubmit={onSubmit}/>);
 const user=userEvent.setup();
 await user.type(screen.getByLabelText(/What happened\?/),'Motor vibration after landing');
 await user.click(screen.getByLabelText('This affects safe operation'));
 await user.click(screen.getByRole('button',{name:'Submit defect'}));
 expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({type:'defect',resultingServiceability:'unserviceable'}));
});
