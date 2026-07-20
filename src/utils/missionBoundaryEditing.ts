import { BoundaryCoordinate, MissionBoundaryPolygon } from '../types/missionBoundary';

function stablePolygonId(coordinates: BoundaryCoordinate[], index: number): string {
  const input = `${index}:${coordinates.map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`).join(';')}`;
  let hash = 0;
  for (let position = 0; position < input.length; position += 1) hash = ((hash << 5) - hash + input.charCodeAt(position)) | 0;
  return `boundary-${index + 1}-${Math.abs(hash).toString(36)}`;
}

export function normaliseBoundaryPolygons(polygons: BoundaryCoordinate[][] | MissionBoundaryPolygon[]): MissionBoundaryPolygon[] {
  return polygons.map((polygon, index) => Array.isArray(polygon)
    ? { id: stablePolygonId(polygon, index), coordinates: polygon, name: `Boundary ${index + 1}`, notes: '' }
    : { ...polygon, name: polygon.name || `Boundary ${index + 1}`, notes: polygon.notes || '' });
}

export function moveBoundaryVertex(polygons: MissionBoundaryPolygon[], polygonId: string, vertexIndex: number, coordinate: BoundaryCoordinate): MissionBoundaryPolygon[] {
  return polygons.map((polygon) => polygon.id === polygonId ? { ...polygon, coordinates: polygon.coordinates.map((value, index) => index === vertexIndex ? coordinate : value) } : polygon);
}

export function removeBoundaryVertex(polygons: MissionBoundaryPolygon[], polygonId: string, vertexIndex: number): { polygons: MissionBoundaryPolygon[]; requiresPolygonDeleteConfirmation?: boolean } {
  const target = polygons.find((polygon) => polygon.id === polygonId);
  if (!target || target.coordinates.length <= 3) return { polygons, requiresPolygonDeleteConfirmation: Boolean(target) };
  return { polygons: polygons.map((polygon) => polygon.id === polygonId ? { ...polygon, coordinates: polygon.coordinates.filter((_, index) => index !== vertexIndex) } : polygon) };
}

export function removeBoundaryPolygon(polygons: MissionBoundaryPolygon[], polygonId: string): MissionBoundaryPolygon[] {
  return polygons.filter((polygon) => polygon.id !== polygonId);
}
