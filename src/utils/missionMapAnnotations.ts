import { MissionMapFeature } from '../types/missionMap';

const UNIQUE_TYPES = new Set<MissionMapFeature['type']>([
  'primary-landing-zone',
  'secondary-landing-zone',
]);

export function normaliseMapFeatures(features: MissionMapFeature[] | undefined): MissionMapFeature[] {
  if (!Array.isArray(features)) return [];
  return features.filter((feature) => feature && feature.id && feature.geometry).map((feature) => ({
    ...feature,
    name: feature.name?.trim() || feature.label || 'Map feature',
    notes: feature.notes || '',
  }));
}

export function upsertMapFeature(features: MissionMapFeature[], feature: MissionMapFeature): MissionMapFeature[] {
  const withoutSameId = features.filter((candidate) => candidate.id !== feature.id);
  const withoutUniqueType = UNIQUE_TYPES.has(feature.type)
    ? withoutSameId.filter((candidate) => candidate.type !== feature.type)
    : withoutSameId;
  return [...withoutUniqueType, feature];
}

export function removeMapFeature(features: MissionMapFeature[], id: string): MissionMapFeature[] {
  return features.filter((feature) => feature.id !== id);
}
