export type MissionMapFeatureType =
  | 'building'
  | 'obstacle'
  | 'point-of-interest'
  | 'primary-landing-zone'
  | 'secondary-landing-zone'
  | 'signage'
  | 'exclusion-zone'
  | 'restricted-area'
  | 'access-point'
  | 'access-route'
  | 'staging-area'
  | 'launch-point'
  | 'landing-point'
  | 'water-point'
  | 'point-annotation'
  | 'line-annotation'
  | 'polygon-annotation'
  | 'imported-source-geometry'
  | 'railway-corridor';

export interface MissionMapPointGeometry {
  type: 'Point';
  coordinates: [number, number];
}

export interface MissionMapPolygonGeometry {
  type: 'Polygon';
  coordinates: Array<Array<[number, number]>>;
}

export interface MissionMapLineGeometry {
  type: 'LineString';
  coordinates: Array<[number, number]>;
}

export interface MissionMapFeature {
  id: string;
  type: MissionMapFeatureType;
  label: string;
  notes?: string;
  geometry: MissionMapPointGeometry | MissionMapPolygonGeometry | MissionMapLineGeometry;
}
