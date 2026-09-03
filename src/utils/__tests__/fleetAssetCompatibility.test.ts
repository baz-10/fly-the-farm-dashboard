import { fleetAssetToDeploymentAsset } from '../fleetAssetCompatibility';
import { FleetAsset } from '../../types/fleetAsset';

const canonical: FleetAsset = {
  id: 'fleet-1', operatingLocationId: 'base-1', assetType: 'generator', assetIdentifier: 'GEN-001',
  serialNumber: 'SER-001', manufacturer: 'Honda', model: 'EU70', status: 'available', notes: 'Current',
  rowVersion: 2, createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T01:00:00.000Z',
};

test('adapts the canonical Fleet ID for current Work Pack selection without vehicle-only identity', () => {
  expect(fleetAssetToDeploymentAsset(canonical)).toEqual(expect.objectContaining({
    id: 'fleet-1', assetType: 'generator', name: 'GEN-001', registration: '', vin: '',
  }));
});

test('does not mutate historical Work Pack snapshot evidence when canonical identity changes', () => {
  const historical = { assets: [{ id: 'legacy-1', name: 'GEN OLD', serialNumber: 'OLD-SERIAL' }] };
  const before = JSON.stringify(historical);
  fleetAssetToDeploymentAsset({ ...canonical, assetIdentifier: 'GEN-RENAMED', rowVersion: 3 });
  expect(JSON.stringify(historical)).toBe(before);
});
