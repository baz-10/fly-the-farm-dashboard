const fs=require('fs');const path=require('path');
const migrationPath=path.join(__dirname,'../../supabase/migrations/20260805130000_personnel_casa_credentials.sql');

test('extends authoritative Personnel rather than creating a duplicate person model',()=>{
 expect(fs.existsSync(migrationPath)).toBe(true);const sql=fs.readFileSync(migrationPath,'utf8');
 expect(sql).toContain('alter table public.personnel');expect(sql).not.toContain('create table public.casa_personnel');
 for(const field of['arn','lifecycle_type','categories','ratings','aircraft_types','minimum_weight_kg','maximum_weight_kg','conditions','limitations','verified_by_internal_user_id','verified_at'])expect(sql).toContain(field);
});

test('models non-expiring RePL and evidence-driven AROC with immutable evidence',()=>{
 const sql=fs.readFileSync(migrationPath,'utf8');expect(sql).toContain("'NON_EXPIRING'");expect(sql).toContain("'EVIDENCE_DRIVEN'");expect(sql).toContain('No expiry recorded');
 expect(sql).toContain('personnel_evidence_immutable');expect(sql).toContain('supersedes_credential_id');
});

test('provides precise evidence-backed Mission eligibility',()=>{
 const sql=fs.readFileSync(migrationPath,'utf8');for(const code of['CERTIFICATE_MISSING','EVIDENCE_UNVERIFIED','CREDENTIAL_SUSPENDED','CREDENTIAL_CANCELLED','CATEGORY_INELIGIBLE','RATING_INELIGIBLE','AIRCRAFT_TYPE_INELIGIBLE','WEIGHT_INELIGIBLE','AROC_REQUIRED','CREDENTIAL_EXPIRED'])expect(sql).toContain(`'${code}'`);
 for(const rpc of['ftf_write_personnel_casa_credential','ftf_verify_personnel_credential','ftf_evaluate_personnel_mission_eligibility'])expect(sql).toContain(`function public.${rpc}`);
 expect(sql).toContain('audit_events');expect(sql).toContain('transactional_outbox');
});
