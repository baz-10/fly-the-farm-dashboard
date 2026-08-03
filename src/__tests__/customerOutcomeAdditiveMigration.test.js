const fs=require('fs');const path=require('path');
const migrationPath=path.join(__dirname,'../../supabase/migrations/20260804000000_customer_outcome_additive_evolution.sql');
const sql=()=>fs.readFileSync(migrationPath,'utf8');

test('adds first-class Customer Outcome fields without rewriting historical evidence',()=>{const migration=sql();for(const token of['customer_outcome_satisfaction_levels','outcome_summary','satisfaction_code','follow_up_requested','follow_up_date','correction_reason'])expect(migration).toContain(token);for(const code of['VERY_SATISFIED','SATISFIED','NEUTRAL','DISSATISFIED','VERY_DISSATISFIED'])expect(migration).toContain(code);expect(migration).not.toMatch(/update\s+public\.customer_acceptance_records/i);});

test('validates conditional follow-up and keeps signature optional',()=>{const migration=sql();expect(migration).toContain('customer_outcome_follow_up_date_required');expect(migration).toContain('not follow_up_requested or follow_up_date is not null');expect(migration).not.toContain("signature_file_id is not null" );expect(migration).toContain('outcome_summary is null or');});

test('extends immutable evidence file provenance and preserves stable contracts',()=>{const migration=sql();for(const token of['OUTCOME_PHOTO','capture_timestamp','caption','access_classification','sha256_checksum','reject_append_only_mutation'])expect(migration).toContain(token);for(const fn of['ftf_create_customer_acceptance','ftf_submit_customer_acceptance_link','ftf_read_customer_acceptance'])expect(migration).toContain(`public.${fn}`);for(const topic of['post_mission.customer_outcome.recorded','post_mission.customer_outcome.customer_submitted'])expect(migration).toContain(topic);});

test('preserves Mission Completion, Mission Outcomes, RLS, audit and outbox',()=>{const migration=sql();expect(migration).not.toMatch(/update\s+public\.mission_completion_revisions/i);expect(migration).not.toMatch(/update\s+public\.mission_outcome_observations/i);for(const token of['audit_events','transactional_outbox','current_user_has_organisation_access','force row level security'])expect(migration).toContain(token);});
