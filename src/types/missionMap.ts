export type MissionMapFeatureType =
  | 'building'
  | 'obstacle'
  | 'point-of-interest'
  | 'primary-landing-zone'
  | 'secondary-landing-zone'
  | 'signage';

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
  name?: string;
  notes?: string;
  geometry: MissionMapPointGeometry | MissionMapLineGeometry | MissionMapPolygonGeometry;
}
