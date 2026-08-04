const fs=require('fs');
const path=require('path');

test('makes the commercial report layout template version 2 for new immutable artefacts',()=>{
 const file=path.join(__dirname,'../../supabase/migrations/20260804020000_commercial_report_template_v2.sql');
 expect(fs.existsSync(file)).toBe(true);
 const sql=fs.readFileSync(file,'utf8');
 expect(sql).toContain('alter column template_version set default 2');
 expect(sql).not.toMatch(/update\s+public\.report_artefacts/i);
});
