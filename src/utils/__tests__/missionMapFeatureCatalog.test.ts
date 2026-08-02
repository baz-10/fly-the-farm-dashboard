import { createMissionMapFeatureAt, missionMapFeatureRole, missionMapFeatureTypeForRole, MISSION_MAP_FEATURE_DEFINITIONS } from '../missionMapFeatureCatalog';

describe('Mission map operational feature catalogue', () => {
  test('exposes every Production Beta operational planning role', () => {
    expect(Object.keys(MISSION_MAP_FEATURE_DEFINITIONS)).toEqual(expect.arrayContaining([
      'obstacle', 'exclusion-zone', 'restricted-area', 'access-point', 'access-route', 'staging-area',
      'launch-point', 'landing-point', 'water-point', 'point-annotation', 'line-annotation',
      'polygon-annotation', 'imported-source-geometry', 'railway-corridor',
    ]));
  });

  test.each([
    ['obstacle', 'Point'], ['exclusion-zone', 'Polygon'], ['restricted-area', 'Polygon'],
    ['access-route', 'LineString'], ['staging-area', 'Polygon'], ['launch-point', 'Point'],
  ] as const)('creates %s with governed %s geometry', (role, geometryType) => {
    const feature = createMissionMapFeatureAt(role, -27, 153, 'feature-id');
    expect(feature).toEqual(expect.objectContaining({ id: 'feature-id', type: role, geometry: expect.objectContaining({ type: geometryType }) }));
  });

  test.each([
    ['exclusion-zone','exclusion_zone'],['restricted-area','no_fly_zone'],['access-route','access_route'],
    ['launch-point','launch_point'],['landing-point','landing_point'],['water-point','water_point'],
    ['railway-corridor','corridor'],
  ] as const)('round-trips UI type %s through authoritative role %s', (type,role) => {
    expect(missionMapFeatureRole(type)).toBe(role);
    expect(missionMapFeatureTypeForRole(role)).toBe(type);
  });
});
