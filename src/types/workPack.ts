export type TruckStatus = 'available' | 'assigned' | 'maintenance' | 'retired';
export type TruckOwnershipType = 'owned' | 'financed' | 'leased';
export type CrewRole =
  | 'pilot'
  | 'driver'
  | 'field-supervisor'
  | 'loader-mixer'
  | 'spotter'
  | 'support';

export interface TruckOperatingCosts {
  purchasePrice: number;
  currentValue: number;
  financePaymentMonthly: number;
  registrationAnnual: number;
  insuranceAnnual: number;
  depreciationAnnual: number;
  servicingAnnual: number;
  tyresAnnual: number;
  fuelCostPerLitre: number;
  averageFuelLitresPer100Km: number;
  costPerHour: number;
  costPerDay: number;
  costPerKm: number;
}

export interface TruckProfile {
  id: string;
  registration: string;
  name: string;
  manufacturer: string;
  model: string;
  year: number;
  vin: string;
  ownershipType: TruckOwnershipType;
  payloadCapacityKg?: number;
  operationalNotes: string;
  status: TruckStatus;
  costs: TruckOperatingCosts;
  createdAt: string;
  updatedAt: string;
}

export type DeploymentAssetType = 'truck' | 'trailer';

export interface DeploymentAsset extends Omit<TruckProfile, 'id' | 'createdAt' | 'updatedAt'> {
  id: string;
  assetType: DeploymentAssetType;
  createdAt: string;
  updatedAt: string;
}

export interface WorkPackAircraftAssignment {
  id: string;
  aircraftId: string;
  kitId: string;
  label: string;
  carryingAssetId?: string;
}

export type MissionWorkPackAircraftAssignment = WorkPackAircraftAssignment;

export interface SupportingEquipmentAssignment {
  id: string;
  note: string;
  carryingAssetId?: string;
}

export interface UnavailableDeploymentAssetReference {
  sourceAssetId: string;
  label: string;
  reason: 'missing' | 'retired' | 'maintenance' | 'assigned';
}

export interface TowVehicleDetails {
  registration?: string;
  driver?: string;
  notes?: string;
}

export interface CrewRequirement {
  id: string;
  role: CrewRole;
  quantity: number;
  notes?: string;
}

export interface WorkPackTemplate {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  /** Selected deployment assets. Falls back to truckId for legacy templates. */
  assetIds?: string[];
  truckId: string;
  aircraftAssignments: WorkPackAircraftAssignment[];
  supportingEquipment?: SupportingEquipmentAssignment[];
  crewRequirements: CrewRequirement[];
  checklist: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkPackSnapshot {
  id: string;
  sourceTemplateId?: string;
  jobId?: string;
  name: string;
  description: string;
  assetIds?: string[];
  truckId: string;
  aircraftAssignments: WorkPackAircraftAssignment[];
  supportingEquipment?: SupportingEquipmentAssignment[];
  crewRequirements: CrewRequirement[];
  checklist: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface MissionDeploymentWorkPack {
  sourceTemplateId?: string;
  assets: DeploymentAsset[];
  towVehicle?: TowVehicleDetails;
  aircraftAssignments: MissionWorkPackAircraftAssignment[];
  supportingEquipment?: SupportingEquipmentAssignment[];
  unavailableAssetReferences?: UnavailableDeploymentAssetReference[];
  crewRequirements: CrewRequirement[];
  checklist: string[];
  notes: string;
  estimatedDeploymentCost?: number;
  costingComplete: boolean;
  createdAt: string;
}

export interface MissionWorkPackDraft {
  sourceTemplateId?: string;
  assets?: DeploymentAsset[];
  towVehicle?: TowVehicleDetails;
  aircraftAssignments?: MissionWorkPackAircraftAssignment[];
  supportingEquipment?: SupportingEquipmentAssignment[];
  unavailableAssetReferences?: UnavailableDeploymentAssetReference[];
  crewRequirements?: CrewRequirement[];
  checklist?: string[];
  notes?: string;
  estimatedDeploymentCost?: number;
  costingComplete?: boolean;
}

export type TruckProfileInput = Omit<TruckProfile, 'id' | 'createdAt' | 'updatedAt'>;
export type DeploymentAssetInput = Omit<DeploymentAsset, 'id' | 'createdAt' | 'updatedAt'>;
export type WorkPackTemplateInput = Omit<WorkPackTemplate, 'id' | 'createdAt' | 'updatedAt'>;
