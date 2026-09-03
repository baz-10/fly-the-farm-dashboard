export type FleetAssetType = 'truck' | 'trailer' | 'generator' | 'crane' | 'pump' | 'compressor' | 'other';
export type FleetAssetStatus = 'available' | 'assigned' | 'maintenance' | 'retired';

export interface FleetAsset {
  id: string;
  operatingLocationId: string;
  assetType: FleetAssetType;
  assetIdentifier: string;
  registration?: string;
  vin?: string;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  manufactureYear?: number;
  status: FleetAssetStatus;
  notes: string;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export type FleetAssetCreateInput = Omit<FleetAsset, 'id' | 'rowVersion' | 'createdAt' | 'updatedAt'>;
export type FleetAssetUpdateInput = FleetAssetCreateInput;
