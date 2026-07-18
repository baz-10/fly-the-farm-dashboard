import { MissionMapFeature } from '../types/missionMap';

export type DrawingMode = 'point' | 'line' | 'shape';
export type MapVertex = [number, number];

export const appendDraftVertex = (vertices: MapVertex[], vertex: MapVertex): MapVertex[] => [...vertices, vertex];
export const cancelDrawing = (): MapVertex[] => [];

export function canFinishDrawing(mode: DrawingMode, vertices: MapVertex[]): boolean {
  return vertices.length >= (mode === 'point' ? 1 : mode === 'line' ? 2 : 3);
}

export function finishDrawing(mode: DrawingMode, vertices: MapVertex[]): MissionMapFeature['geometry'] | null {
  if (!canFinishDrawing(mode, vertices)) return null;
  if (mode === 'point') return { type: 'Point', coordinates: vertices[0] };
  if (mode === 'line') return { type: 'LineString', coordinates: vertices };
  return { type: 'Polygon', coordinates: [[...vertices, vertices[0]]] };
}
