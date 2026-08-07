const path=require('path'),{execFileSync}=require('child_process');
test('exercises multi-record multi-file authority persistence in PostgreSQL',()=>{
 expect(()=>execFileSync(process.execPath,[path.resolve(__dirname,'../../scripts/verifyOperatingAuthorityRegister.mjs')],{stdio:'pipe'})).not.toThrow();
});
