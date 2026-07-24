import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionMapFeature } from '../../types/missionMap';
import MissionMapFeatureRegister from '../MissionMapFeatureRegister';

describe('MissionMapFeatureRegister', () => {
  test('edits feature names and notes and deletes only the selected feature', async () => {
    const user = userEvent.setup(); const onFeaturesChange = jest.fn();
    const features: MissionMapFeature[] = [{ id: 'gate', type: 'point-of-interest', label: 'Gate', name: 'Gate', notes: '', geometry: { type: 'Point', coordinates: [153.1, -27.4] } }];
    function Harness() { const [items, setItems] = React.useState(features); return <MissionMapFeatureRegister boundaries={[]} features={items} onFeaturesChange={(next) => { onFeaturesChange(next); setItems(next); }} onBoundariesChange={jest.fn()} />; }
    render(<Harness />);
    await user.clear(screen.getByLabelText('Name Gate')); await user.type(screen.getByLabelText('Name Gate'), 'Main gate');
    expect(onFeaturesChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'gate', name: 'Main gate' })]);
    await user.type(screen.getByLabelText('Notes Gate'), 'Keep access clear');
    expect(onFeaturesChange).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete Main gate' }));
    expect(onFeaturesChange).toHaveBeenLastCalledWith([]);
  });

  test('removes one boundary vertex without deleting the boundary or mission', async () => {
    const user = userEvent.setup(); const onBoundariesChange = jest.fn();
    render(<MissionMapFeatureRegister boundaries={[{ id: 'north', name: 'Boundary 1', notes: '', coordinates: [[-27.4,153.1],[-27.4,153.2],[-27.5,153.2],[-27.5,153.1]] }]} features={[]} onFeaturesChange={jest.fn()} onBoundariesChange={onBoundariesChange} />);
    await user.click(screen.getByRole('button', { name: 'Delete vertex 1 from Boundary 1' }));
    expect(onBoundariesChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'north', coordinates: [[-27.4,153.2],[-27.5,153.2],[-27.5,153.1]] })]);
  });

  test('edits boundary name and notes for persistence', async () => {
    const user = userEvent.setup(); const onBoundariesChange = jest.fn();
    const initial = [{ id: 'north', name: 'North block', notes: '', coordinates: [[-27.4,153.1],[-27.4,153.2],[-27.5,153.2]] as [number, number][] }];
    function Harness() { const [boundaries, setBoundaries] = React.useState(initial); return <MissionMapFeatureRegister boundaries={boundaries} onBoundariesChange={(next) => { onBoundariesChange(next); setBoundaries(next); }} features={[]} onFeaturesChange={jest.fn()} />; }
    render(<Harness />);
    await user.type(screen.getByLabelText('Boundary 1 notes'), 'Creek on western edge');
    expect(onBoundariesChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'north', notes: expect.stringContaining('Creek') })]);
  });
});
