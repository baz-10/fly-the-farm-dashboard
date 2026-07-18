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
  truckId: string;
  aircraftAssignments: WorkPackAircraftAssignment[];
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
  truckId: string;
  aircraftAssignments: WorkPackAircraftAssignment[];
  crewRequirements: CrewRequirement[];
  checklist: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type TruckProfileInput = Omit<TruckProfile, 'id' | 'createdAt' | 'updatedAt'>;
export type DeploymentAssetInput = Omit<DeploymentAsset, 'id' | 'createdAt' | 'updatedAt'>;
export type WorkPackTemplateInput = Omit<WorkPackTemplate, 'id' | 'createdAt' | 'updatedAt'>;
