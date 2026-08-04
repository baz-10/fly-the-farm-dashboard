const fs=require('fs');const path=require('path');
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260804060000_organisation_reference_sequences.sql'),'utf8').toLowerCase();
test('owns prefixes and collision-safe job and mission counters in PostgreSQL',()=>{
 expect(sql).toContain('reference_prefix');
 expect(sql).toContain('organisation_reference_sequences');
 expect(sql).toContain("resource_type in ('job','mission')");
 expect(sql).toContain('for update');
 expect(sql).toContain("then'job'else'mis'");
 expect(sql).toContain("v_prefix||'-'||v_marker||'-'");
 expect(sql).toContain("lpad(v_next::text,6,'0')");
 expect(sql).toContain('auto_generate_reference');
 expect(sql).toContain('ftf_write_operational_resource_before_reference_sequences');
});
