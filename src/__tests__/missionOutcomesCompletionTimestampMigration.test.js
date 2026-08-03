const fs=require('fs'),path=require('path');
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260803131000_mission_outcomes_completion_timestamp.sql'),'utf8');
test('derives outcome timing from the authoritative Completion timestamp',()=>{expect(sql).toContain('c.completed_at');expect(sql).not.toContain('c.created_at');});
test('retains tenant, location, observer, audit and outbox protections',()=>{for(const token of['ftf_operational_location_allowed','observer_invalid','post_mission.mission.outcome_observed','audit_events','transactional_outbox'])expect(sql).toContain(token);});
