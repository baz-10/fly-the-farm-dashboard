import { MissionRecord } from '../../types/mission';
import { redactMissionDeploymentFinancials, restoreMissionDeploymentFinancials } from '../MissionContext';

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

test('restores privileged costing before persisting a contractor operational edit', () => {
  const contractorEdit = {
    ...redactMissionDeploymentFinancials(mission),
    deploymentWorkPack: {
      ...redactMissionDeploymentFinancials(mission).deploymentWorkPack!,
      notes: 'Contractor changed operations',
    },
  };

  const restored = restoreMissionDeploymentFinancials(contractorEdit, mission);

  expect(restored.deploymentWorkPack?.notes).toBe('Contractor changed operations');
  expect(restored.deploymentWorkPack?.estimatedDeploymentCost).toBe(1250);
  expect(restored.deploymentWorkPack?.assets[0].costs).toEqual({ costPerDay: 450 });
});
