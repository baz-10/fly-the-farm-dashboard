import { AustralianState } from './chemical';

// ─── Client / Property ───────────────────────────────────────

export interface ClientAddress {
  label: string;       // e.g. "Home", "Office", "Farm"
  address: string;     // Full street address
  locality: string;    // Town / suburb
  state: AustralianState;
  postcode: string;
  lat?: number;
  lng?: number;
}

export type PropertyAddressSource = 'GEOCODED' | 'MANUAL';

export interface Client {
  id: string;
  contractorUserId: string;  // The contractor user who owns this client
  linkedUserId?: string;     // If this client has registered a user account
  name: string;
  contactName?: string;
  phone: string;
  email: string;
  addresses?: ClientAddress[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** Authoritative API optimistic-concurrency token in remote mode. */
  rowVersion?: number;
}

export interface Property {
  id: string;
  clientId: string;
  name: string;
  address: string;
  state: AustralianState;
  locality: string;
  lotPlan: string;
  lat?: number;
  lng?: number;
  addressSource?: PropertyAddressSource;
  notes: string;
  primaryContactName?: string;
  accessNotes?: string;
  createdAt: string;
  updatedAt: string;
  /** Authoritative API optimistic-concurrency token in remote mode. */
  rowVersion?: number;
}

// ─── Field / Paddock ─────────────────────────────────────────

export interface BoundaryFileRef {
  fileName: string;
  fileType: 'kml' | 'shp' | 'kmz';
  sizeBytes: number;
  dataUrl: string;
  sourceCrs?: string | null;
  boundingBox?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  uploadedAt: string;
}

export type LatLng = [number, number]; // [lat, lng]

export interface Field {
  id: string;
  propertyId: string;
  name: string;
  sizeHa: number;
  boundary: BoundaryFileRef | null;
  boundaryCoords?: LatLng[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** Authoritative API optimistic-concurrency token in remote mode. */
  rowVersion?: number;
  /** Server-managed reference to the active immutable boundary version. */
  fieldBoundaryVersionId?: string;
}

// ─── Chemical Entry ──────────────────────────────────────────

export interface ChemicalEntry {
  product: string;
  activeIngredient: string;
  ratePerHa: string;
  treatmentId: string | null;
}

// ─── Job Record ──────────────────────────────────────────────

export interface WeatherConditions {
  tempC: number | null;
  windSpeedKmh: number | null;
  windDirection: string;
  humidity: number | null;
  deltaT: number | null;
}

export interface WeatherLogEntry {
  time: string;          // ISO 8601
  tempC: number;
  humidity: number;
  dewpointC: number;
  deltaT: number;
  windSpeedKmh: number;
  windGustsKmh: number;
  windDirection: string; // compass e.g. "NE"
}

export interface SprayRecFileRef {
  fileName: string;
  sizeBytes: number;
  dataUrl: string;
  uploadedAt: string;
}

export interface BatchChemicalBreakdown {
  name: string;
  unit: 'L' | 'g';
  ratePerHa: number;
  perBatch: number;
  totalJob: number;
}

export interface BatchInfo {
  hectares: number;
  applicationRateLHa: number;
  tankSizeL: number;
  totalSprayVolumeL: number;
  totalBatches: number;
  hectaresPerBatch: number;
  waterPerBatchL: number;
  chemicalBreakdown: BatchChemicalBreakdown[];
}

export interface JobRecord {
  id: string;
  fieldId: string;
  propertyId: string;
  clientId: string;

  weedTarget: string;
  chemicals: ChemicalEntry[];
  waterRateLHa: string;
  adjuvants: string;

  /** @deprecated Use chemicals array instead */
  treatmentId?: string | null;
  /** @deprecated Use chemicals array instead */
  chemicalUsed?: string;
  /** @deprecated Use chemicals array instead */
  activeIngredient?: string;
  /** @deprecated Use chemicals array instead */
  sprayRateLHa?: string;

  dateSprayed: string;
  weather: WeatherConditions;
  weatherLog?: WeatherLogEntry[];
  sprayConditions?: WeatherLogEntry[];

  sprayRec: SprayRecFileRef | null;
  batchInfo?: BatchInfo;

  droneModel: string;
  applicatorName: string;

  notes: string;
  quoteId?: string;  // Linked quote if created from/for this job
  createdAt: string;
  updatedAt: string;
}

// ─── Job Outcome ─────────────────────────────────────────────

export type EfficacyRating = 1 | 2 | 3 | 4 | 5;

export interface PhotoRef {
  fileName: string;
  dataUrl: string;
  caption: string;
  takenAt: string;
  type: 'before' | 'after';
}

export interface JobOutcome {
  id: string;
  jobId: string;
  followUpDate: string;
  efficacyRating: EfficacyRating;
  regrowthObserved: boolean;
  followUpRequired: boolean;
  photos: PhotoRef[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}
