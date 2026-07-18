import { MissionMapFeature } from '../types/missionMap';

const UNIQUE_TYPES = new Set<MissionMapFeature['type']>([
  'primary-landing-zone',
  'secondary-landing-zone',
]);

export function normaliseMapFeatures(features: MissionMapFeature[] | undefined): MissionMapFeature[] {
  if (!Array.isArray(features)) return [];
  return features.filter((feature) => {
    if (!feature?.id || !feature.geometry) return false;
    if (feature.geometry.type === 'Point') return feature.geometry.coordinates.length === 2 && feature.geometry.coordinates.every((value) => Number.isFinite(value));
    if (feature.geometry.type === 'LineString') return feature.geometry.coordinates.length >= 2 && feature.geometry.coordinates.every((value) => value.length === 2 && value.every((coordinate) => Number.isFinite(coordinate)));
    if (feature.geometry.coordinates.length === 0) return false;
    const ring = feature.geometry.coordinates[0];
    return ring.length >= 4 && ring.every((value) => value.length === 2 && value.every((coordinate) => Number.isFinite(coordinate)))
      && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  }).map((feature) => ({
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

export function moveMapFeatureVertex(feature: MissionMapFeature, vertexIndex: number, coordinate: [number, number]): MissionMapFeature {
  if (feature.geometry.type === 'Point') return { ...feature, geometry: { ...feature.geometry, coordinates: coordinate } };
  if (feature.geometry.type === 'LineString') return { ...feature, geometry: { ...feature.geometry, coordinates: feature.geometry.coordinates.map((value, index) => index === vertexIndex ? coordinate : value) } };
  const ring = feature.geometry.coordinates[0];
  const lastIndex = ring.length - 1;
  const pairedIndex = vertexIndex === 0 ? lastIndex : vertexIndex === lastIndex ? 0 : -1;
  return { ...feature, geometry: { ...feature.geometry, coordinates: [ring.map((value, index) => index === vertexIndex || index === pairedIndex ? coordinate : value)] } };
}
