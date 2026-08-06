import { missionOperatorRoles } from './operationalRouteRoles';

describe('mission operational route roles', () => {
  test('lets the dedicated acceptance operator exercise Mission workflows without administration access', () => {
    expect(missionOperatorRoles).toContain('production_beta_acceptance');
    expect(missionOperatorRoles).toContain('admin');
    expect(missionOperatorRoles).toContain('contractor');
    expect(missionOperatorRoles).not.toContain('platform');
    expect(missionOperatorRoles).not.toContain('client');
  });
});
