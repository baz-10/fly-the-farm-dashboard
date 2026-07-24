import { expect, test } from 'vitest';

import { canReleaseRpas, canViewMaintenanceFinancials } from '../maintenancePermissions';

test('only authorised maintenance personnel release RPAS',()=>{
  expect(canReleaseRpas({role:'contractor',maintenanceAuthority:'pic'})).toBe(false);
  expect(canReleaseRpas({role:'admin',maintenanceAuthority:'maintenance-controller'})).toBe(true);
});
test('financial maintenance is company admin only',()=>{
  expect(canViewMaintenanceFinancials({role:'contractor'})).toBe(false);
  expect(canViewMaintenanceFinancials({role:'admin'})).toBe(true);
});
