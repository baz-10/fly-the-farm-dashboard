const fs = require('fs');
const path = require('path');

const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260803000000_authoritative_mission_chemicals.sql'), 'utf8');

test('separates Mission evidence, organisation register and platform intelligence', () => {
  for (const table of ['platform_chemical_products', 'platform_chemical_product_versions', 'organisation_chemical_register', 'mission_chemical_plan_revisions', 'mission_chemical_plan_lines', 'chemical_intelligence_reviews', 'chemical_intelligence_review_history']) {
    expect(migration).toContain(`create table public.${table}`);
  }
});

test('trusted chemical planning is versioned, calculated, tenant/location scoped, audited and evented', () => {
  for (const token of ['ftf_save_mission_chemical_plan', 'p_expected_version', 'location_forbidden', 'current_version', 'total_spray_volume_l', 'total_product_quantity', 'water_required_l', 'batch_count', 'audit_events', 'transactional_outbox']) {
    expect(migration).toContain(token);
  }
  expect(migration).toContain("'mission.chemicals.plan'");
  expect(migration).toContain("'chemical.review.research'");
  expect(migration).toContain("'chemical.review.approve'");
});

test('unmatched review is automatic and approval cannot rewrite Mission evidence', () => {
  expect(migration).toContain('ftf_normalise_chemical_name');
  expect(migration).toContain("'NEW'");
  expect(migration).toContain("'READY_FOR_APPROVAL'");
  expect(migration).toContain('ftf_transition_chemical_review');
  const transition = migration.slice(migration.indexOf('create function public.ftf_transition_chemical_review'));
  expect(transition).not.toMatch(/update\s+public\.mission_chemical_plan_(revisions|lines)/i);
});

test('all authoritative chemical tables enforce RLS and reject direct authenticated writes', () => {
  expect((migration.match(/enable row level security/g) || []).length).toBeGreaterThanOrEqual(7);
  expect(migration).toContain('revoke all on table public.platform_chemical_products from public,anon,authenticated');
  expect(migration).toContain('revoke all on table public.mission_chemical_plan_lines from public,anon,authenticated');
});
