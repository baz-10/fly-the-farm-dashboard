const fs=require('fs');
const path=require('path');

const migrationPath=path.join(__dirname,'../../supabase/migrations/20260804030000_generated_report_storage.sql');

test('provisions the generated report bucket as private PDF-only storage',()=>{
 expect(fs.existsSync(migrationPath)).toBe(true);
 const sql=fs.readFileSync(migrationPath,'utf8');
 expect(sql).toContain("'generated-reports'");
 expect(sql).toMatch(/public\s*,\s*file_size_limit\s*,\s*allowed_mime_types/i);
 expect(sql).toMatch(/false\s*,\s*10485760\s*,\s*array\['application\/pdf'\]/i);
 expect(sql).toContain('on conflict(id)do update');
});
