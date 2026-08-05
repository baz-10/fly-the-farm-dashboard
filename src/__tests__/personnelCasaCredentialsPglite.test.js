const fs=require('fs');const path=require('path');const{execFileSync}=require('child_process');
const runner=path.resolve(__dirname,'../../scripts/verifyCasaComplianceMigration.mjs');
test('exercises non-expiring RePL, evidence-driven AROC and eligibility in PostgreSQL',()=>{
 const source=fs.readFileSync(runner,'utf8');expect(source).toContain('NON_EXPIRING');expect(source).toContain('No expiry recorded');expect(source).toContain('AROC_REQUIRED');
 expect(()=>execFileSync(process.execPath,[runner],{stdio:'pipe'})).not.toThrow();
});
