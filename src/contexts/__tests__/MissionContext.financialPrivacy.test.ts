import { MissionRecord } from '../../types/mission';
import { redactMissionDeploymentFinancials } from '../MissionContext';

const mission = {
  id: 'mission-1',
  deploymentWorkPack: {
    assets: [{ id: 'truck-1', name: 'Truck', costs: { costPerDay: 450 } }],
    estimatedDeploymentCost: 1250,
    costingComplete: true,
  },
} as MissionRecord;

test('removes deployment financials from contractor mission runtime records', () => {
  const safe = redactMissionDeploymentFinancials(mission);
  expect(safe.deploymentWorkPack).toEqual({
    assets: [{ id: 'truck-1', name: 'Truck' }],
    costingComplete: true,
  });
  expect(mission.deploymentWorkPack?.estimatedDeploymentCost).toBe(1250);
});
