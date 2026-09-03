import { FleetAsset } from '../types/fleetAsset';
import { DeploymentAsset } from '../types/workPack';

const zeroCosts = {
  purchasePrice: 0, currentValue: 0, financePaymentMonthly: 0, registrationAnnual: 0,
  insuranceAnnual: 0, depreciationAnnual: 0, servicingAnnual: 0, tyresAnnual: 0,
  fuelCostPerLitre: 0, averageFuelLitresPer100Km: 0, costPerHour: 0, costPerDay: 0, costPerKm: 0,
};

/** Current Work Packs reference the canonical Fleet ID while historical snapshots retain their embedded values. */
export function fleetAssetToDeploymentAsset(asset: FleetAsset): DeploymentAsset {
  return {
    id: asset.id,
    assetType: asset.assetType,
    registration: asset.registration || '',
    name: asset.assetIdentifier,
    manufacturer: asset.manufacturer || '',
    model: asset.model || '',
    year: asset.manufactureYear || new Date(asset.createdAt).getUTCFullYear(),
    vin: asset.vin || '',
    ownershipType: 'owned',
    operationalNotes: asset.notes,
    status: asset.status,
    costs: zeroCosts,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}
