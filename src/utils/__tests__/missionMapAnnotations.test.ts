import { MissionMapFeature } from '../../types/missionMap';
import { moveMapFeatureVertex, normaliseMapFeatures, removeMapFeature, upsertMapFeature } from '../missionMapAnnotations';

const point = (id: string, type: MissionMapFeature['type']): MissionMapFeature => ({
  id,
  type,
  label: id,
  geometry: { type: 'Point', coordinates: [153.1, -27.4] },
});

describe('mission map annotations', () => {
  test('keeps multiple ordinary features', () => {
    const features = upsertMapFeature([point('one', 'obstacle')], point('two', 'obstacle'));
    expect(features.map((feature) => feature.id)).toEqual(['one', 'two']);
  });

  test.each(['primary-landing-zone', 'secondary-landing-zone'] as const)('replaces the unique %s', (type) => {
    const features = upsertMapFeature([point('old', type), point('sign', 'signage')], point('new', type));
    expect(features.map((feature) => feature.id)).toEqual(['sign', 'new']);
  });

  test('supports building polygons and deletion', () => {
    const building: MissionMapFeature = { id: 'shed', type: 'building', label: 'Shed', geometry: { type: 'Polygon', coordinates: [[[153.1, -27.4], [153.2, -27.4], [153.2, -27.5], [153.1, -27.4]]] } };
    expect(removeMapFeature([building], 'shed')).toEqual([]);
  });

  test('defaults legacy missing feature data to an empty list', () => {
    expect(normaliseMapFeatures(undefined)).toEqual([]);
  });

  test('normalises legacy labels and notes and supports line geometry', () => {
    const legacy = point('gate', 'point-of-interest');
    const line: MissionMapFeature = { id: 'powerline', type: 'obstacle', label: 'Powerline', geometry: { type: 'LineString', coordinates: [[153.1, -27.4], [153.2, -27.5]] } };
    expect(normaliseMapFeatures([legacy, line])).toEqual([
      { ...legacy, name: 'gate', notes: '' },
      { ...line, name: 'Powerline', notes: '' },
    ]);
  });

  test('drops malformed stored geometry before it reaches the map', () => {
    const malformed = { ...point('bad', 'obstacle'), geometry: { type: 'LineString', coordinates: [[153.1, -27.4]] } } as MissionMapFeature;
    expect(normaliseMapFeatures([malformed])).toEqual([]);
  });

  test('keeps a polygon ring closed when either endpoint is dragged', () => {
    const building: MissionMapFeature = { id: 'shed', type: 'building', label: 'Shed', geometry: { type: 'Polygon', coordinates: [[[153.1, -27.4], [153.2, -27.4], [153.2, -27.5], [153.1, -27.4]]] } };
    const moved = moveMapFeatureVertex(building, 0, [154, -28]);
    expect(moved.geometry.type === 'Polygon' && moved.geometry.coordinates[0][0]).toEqual([154, -28]);
    expect(moved.geometry.type === 'Polygon' && moved.geometry.coordinates[0][moved.geometry.coordinates[0].length - 1]).toEqual([154, -28]);
  });
});
