const fs=require('fs');const path=require('path');
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260804162000_production_beta_platform_identity_reconciliation.sql'),'utf8');
test('identity reconciliation fails closed and never creates tenant identity artefacts',()=>{
 expect(sql).toMatch(/PLATFORM_IDENTITY_AMBIGUOUS/);expect(sql).toMatch(/ORGANISATION_INTERNAL_IDENTITY_AMBIGUOUS/);expect(sql).toMatch(/PLATFORM_TENANT_CONTAMINATION_DETECTED/);
 expect(sql).toMatch(/reconcile_platform_identity/);expect(sql).not.toMatch(/insert\s+into\s+public\.(internal_users|memberships|internal_user_seat_assignments|membership_operating_location_assignments|personnel)/i);
});
