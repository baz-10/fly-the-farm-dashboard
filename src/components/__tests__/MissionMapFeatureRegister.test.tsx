import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissionMapFeatureRegister from '../MissionMapFeatureRegister';

describe('MissionMapFeatureRegister', () => {
  test('edits feature names and notes and deletes only the selected feature', async () => {
    const user = userEvent.setup(); const onFeaturesChange = jest.fn();
    const features = [{ id: 'gate', type: 'point-of-interest' as const, label: 'Gate', name: 'Gate', notes: '', geometry: { type: 'Point' as const, coordinates: [153.1, -27.4] as [number, number] } }];
    function Harness() { const [items, setItems] = React.useState(features); return <MissionMapFeatureRegister polygons={[]} features={items} onFeaturesChange={(next) => { onFeaturesChange(next); setItems(next); }} onPolygonsChange={jest.fn()} />; }
    render(<Harness />);
    await user.clear(screen.getByLabelText('Name Gate')); await user.type(screen.getByLabelText('Name Gate'), 'Main gate');
    expect(onFeaturesChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'gate', name: 'Main gate' })]);
    await user.type(screen.getByLabelText('Notes Gate'), 'Keep access clear');
    expect(onFeaturesChange).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete Main gate' }));
    expect(onFeaturesChange).toHaveBeenLastCalledWith([]);
  });

  test('removes one boundary vertex without deleting the boundary or mission', async () => {
    const user = userEvent.setup(); const onPolygonsChange = jest.fn();
    render(<MissionMapFeatureRegister polygons={[[[-27.4,153.1],[-27.4,153.2],[-27.5,153.2],[-27.5,153.1]]]} features={[]} onFeaturesChange={jest.fn()} onPolygonsChange={onPolygonsChange} />);
    await user.click(screen.getByRole('button', { name: 'Delete vertex 1 from Boundary 1' }));
    expect(onPolygonsChange).toHaveBeenCalledWith([[[-27.4,153.2],[-27.5,153.2],[-27.5,153.1]]]);
  });

  test('edits boundary name and notes for persistence', async () => {
    const user = userEvent.setup(); const onBoundaryMetadataChange = jest.fn();
    render(<MissionMapFeatureRegister polygons={[[[-27.4,153.1],[-27.4,153.2],[-27.5,153.2]]]} boundaryMetadata={[{ name: 'North block', notes: '' }]} onBoundaryMetadataChange={onBoundaryMetadataChange} features={[]} onFeaturesChange={jest.fn()} onPolygonsChange={jest.fn()} />);
    await user.type(screen.getByLabelText('Boundary 1 notes'), 'Creek on western edge');
    expect(onBoundaryMetadataChange).toHaveBeenCalled();
  });
});
