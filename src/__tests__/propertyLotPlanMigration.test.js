const fs = require('fs');
const path = require('path');

test('retains Property lot and plan references through repository-controlled trusted writes', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260806100000_property_lot_plan.sql'), 'utf8');
  expect(sql).toContain('add column lot_plan text');
  expect(sql).toContain('new.lot_plan');
  expect(sql).toContain("'lotPlan'");
  expect(sql).toContain('ftf.property.lot_plan');
  expect(sql).toContain('revoke all on function public.ftf_write_operational_resource_unlocked');
});
