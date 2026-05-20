export type VegetationDataset = 'pmav' | 'rvm';
export type VegetationCategory = 'A' | 'B' | 'C' | 'R' | 'X' | 'Unknown';

export interface VegetationFeatureProperties {
  pmav_no?: string;
  pmav_stat?: string;
  pmav_cat?: string;
  rvm_cat?: string;
  vm_cat?: string;
  category?: string;
  lotplan?: string;
  objectid?: number;
  [key: string]: unknown;
}

export interface VegetationFeature {
  type: 'Feature';
  geometry: any;
  properties: VegetationFeatureProperties;
}

export interface VegetationFeatureCollection {
  type: 'FeatureCollection';
  features: VegetationFeature[];
}

export interface VegetationSummary {
  dataset: VegetationDataset;
  lotPlan: string;
  searchTerm: string;
  featureCount: number;
  propertyCount: number;
  categories: Record<VegetationCategory, number>;
  pmavNumber?: string;
  pmavStatus?: string;
  checkedAt: string;
  sourceLabel: string;
  headline: string;
  interpretation: string;
}

export interface VegetationLookupResult {
  summary: VegetationSummary;
  data: VegetationFeatureCollection;
}

export interface SavedVegetationCheck extends VegetationSummary {
  id: string;
  propertyId?: string;
  fieldId?: string;
}
