export type BoundaryCoordinate = [number, number];

export interface MissionBoundaryPolygon {
  id: string;
  coordinates: BoundaryCoordinate[];
  name: string;
  notes: string;
  sourceFileId?: string;
}
