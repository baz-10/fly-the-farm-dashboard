const fs = require('fs');
const path = require('path');

const sql = () => fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260803210000_authoritative_customer_acceptance.sql'), 'utf8');

test('models immutable Customer Acceptance evidence and bounded secure links', () => {
  const migration = sql();
  for (const table of ['customer_acceptance_states','customer_acceptance_methods','customer_acceptance_records','customer_acceptance_files','customer_acceptance_links']) {
    expect(migration).toContain(`create table public.${table}`);
  }
  for (const token of ['completion_revision_id','supersedes_acceptance_id','token_hash','signature_file_id','reject_append_only_mutation','enable row level security','force row level security']) expect(migration).toContain(token);
  expect(migration).not.toContain('update public.customer_acceptance_records');
});

test('defines repository-controlled states, permissions and atomic evidence events', () => {
  const migration = sql();
  for (const value of ['ACCEPTED','ACCEPTED_WITH_COMMENTS','DISPUTED','DECLINED','PHONE','VERBAL','IN_PERSON','WRITTEN','SECURE_LINK']) expect(migration).toContain(value);
  for (const permission of ['mission.customer_acceptance.read','mission.customer_acceptance.record','mission.customer_acceptance.link.issue','mission.customer_acceptance.link.revoke','mission.customer_acceptance.attachment.upload']) expect(migration).toContain(permission);
  for (const fn of ['ftf_read_customer_acceptance','ftf_create_customer_acceptance','ftf_issue_customer_acceptance_link','ftf_revoke_customer_acceptance_link','ftf_resolve_customer_acceptance_link','ftf_submit_customer_acceptance_link']) expect(migration).toContain(fn);
  for (const topic of ['post_mission.customer_acceptance.recorded','post_mission.customer_acceptance.link_issued','post_mission.customer_acceptance.link_revoked','post_mission.customer_acceptance.customer_submitted']) expect(migration).toContain(topic);
});

test('keeps Customer Acceptance optional and preserves existing lifecycle evidence', () => {
  const migration = sql();
  expect(migration).toContain('mission_completion_revisions');
  expect(migration).not.toContain('update public.mission_completion_revisions');
  expect(migration).not.toContain('update public.mission_outcome_observations');
  expect(migration).not.toContain('PENDING');
});
