import { describe, expect, test } from 'vitest';

import { moveBoundaryVertex, normaliseBoundaryPolygons, removeBoundaryPolygon, removeBoundaryVertex } from '../missionBoundaryEditing';

const coords = [[-27.4, 153.1], [-27.4, 153.2], [-27.5, 153.2], [-27.5, 153.1]] as Array<[number, number]>;

describe('mission boundary editing', () => {
  test('assigns stable ids and edits only the targeted polygon vertex', () => {
    const polygons = normaliseBoundaryPolygons([coords, coords.map(([lat, lng]) => [lat + 1, lng] as [number, number])]);
    const moved = moveBoundaryVertex(polygons, polygons[0].id, 1, [-27.45, 153.25]);
    expect(moved[0].coordinates[1]).toEqual([-27.45, 153.25]);
    expect(moved[1]).toEqual(polygons[1]);
  });

  test('removes a vertex only while a valid polygon remains', () => {
    const polygons = normaliseBoundaryPolygons([coords]);
    expect(removeBoundaryVertex(polygons, polygons[0].id, 0).polygons[0].coordinates).toHaveLength(3);
    const triangle = normaliseBoundaryPolygons([coords.slice(0, 3)]);
    expect(removeBoundaryVertex(triangle, triangle[0].id, 0)).toMatchObject({ polygons: triangle, requiresPolygonDeleteConfirmation: true });
  });

  test('removing the final polygon never touches unrelated mission data', () => {
    const mission = { id: 'mission-1', missionName: 'Keep me', polygons: normaliseBoundaryPolygons([coords]) };
    const updated = { ...mission, polygons: removeBoundaryPolygon(mission.polygons, mission.polygons[0].id) };
    expect(updated).toMatchObject({ id: 'mission-1', missionName: 'Keep me', polygons: [] });
  });
});
