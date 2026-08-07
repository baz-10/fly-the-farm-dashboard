const fs=require('fs'),path=require('path');
const migration=path.resolve(__dirname,'../../supabase/migrations/20260808181500_operating_authority_register.sql');

test('defines the repository-controlled operating authority catalogue and protected pending uploads',()=>{
 const sql=fs.readFileSync(migration,'utf8');
 for(const code of['REOC_CERTIFICATE','REOC_VARIATION','INSTRUMENT','SPECIAL_APPROVAL','EXEMPTION','OTHER_CASA_AUTHORITY'])expect(sql).toContain(`'${code}'`);
 expect(sql).toContain('compliance_pending_uploads');
 expect(sql).toContain('enable row level security');
 expect(sql).toContain('evidence_role');
 expect(sql).toContain('authority_row_version');
});

test('uses trusted atomic authority commands with audit and outbox',()=>{
 const sql=fs.readFileSync(migration,'utf8');
 for(const fn of['ftf_read_operating_authority_register','ftf_authorise_compliance_upload','ftf_finalize_operating_authority','ftf_append_operating_authority_evidence'])expect(sql).toContain(fn);
 expect(sql).toContain('transactional_outbox');
 expect(sql).toContain('audit_events');
 expect(sql).toContain('from public,anon,authenticated');
 expect(sql).toContain('to service_role');
 expect(sql).toMatch(/authority_type_code='REOC_CERTIFICATE'.*instrument_type='REOC'/s);
});
