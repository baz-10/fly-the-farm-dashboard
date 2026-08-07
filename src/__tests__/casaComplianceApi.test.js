const { createComplianceHandler } = require('../../server/compliance-api');

const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const context={organisation:{id:org},internalUser:{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},permissions:['compliance.read'],operatingLocationIds:[]};
const response=()=>{const res={headers:{},setHeader:(k,v)=>{res.headers[k]=v;},status:s=>{res.statusCode=s;return res;},json:b=>{res.body=b;return res;}};return res;};

test('returns the authoritative tenant compliance overview',async()=>{
 const repository={readOverview:jest.fn().mockResolvedValue({reoc:{instrument_number:'CASA.REOC.001'},warnings:{missingEvidence:1}})};const res=response();
 await createComplianceHandler({repository,resolveContext:jest.fn().mockResolvedValue(context)})({method:'GET',query:{action:'overview'},headers:{}},res);
 expect(res.statusCode).toBe(200);expect(repository.readOverview).toHaveBeenCalledWith(context);expect(res.body.data.reoc.instrument_number).toBe('CASA.REOC.001');
});

test('fails closed without compliance.read',async()=>{
 const res=response();await createComplianceHandler({repository:{},resolveContext:jest.fn().mockResolvedValue({...context,permissions:[]})})({method:'GET',query:{action:'overview'},headers:{}},res);
 expect(res.statusCode).toBe(403);expect(res.body.error.code).toBe('FORBIDDEN');
});

test('rejects unsupported actions and methods',async()=>{
 const handler=createComplianceHandler({repository:{},resolveContext:jest.fn().mockResolvedValue(context)}),unsupported=response(),method=response();
 await handler({method:'GET',query:{action:'unknown'},headers:{}},unsupported);expect(unsupported.statusCode).toBe(400);expect(unsupported.body.error.code).toBe('UNSUPPORTED_ACTION');
 await handler({method:'DELETE',query:{action:'overview'},headers:{}},method);expect(method.statusCode).toBe(405);
});

test('authorises a narrowly scoped compliance upload for a manager',async()=>{
 const repository={authoriseComplianceUpload:jest.fn().mockResolvedValue({uploadId:'11111111-1111-4111-8111-111111111111',internalFileId:'22222222-2222-4222-8222-222222222222',uploadUrl:'https://storage.example/signed',expiresAt:'2026-08-08T02:00:00Z'})},res=response();
 await createComplianceHandler({repository,resolveContext:jest.fn().mockResolvedValue({...context,permissions:['compliance.manage']})})({method:'POST',query:{action:'upload-authorise'},headers:{origin:'https://spray.example',host:'spray.example'},body:{originalFilename:'instrument.pdf',contentType:'application/pdf',sizeBytes:500,evidenceRole:'INSTRUMENT'}},res);
 expect(res.statusCode).toBe(201);expect(repository.authoriseComplianceUpload).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({originalFilename:'instrument.pdf',sizeBytes:500}));expect(res.body.data.uploadUrl).toContain('signed');
});

test.each([
 [{originalFilename:'../escape.pdf',contentType:'application/pdf',sizeBytes:500},'VALIDATION_ERROR'],
 [{originalFilename:'file.exe',contentType:'application/octet-stream',sizeBytes:500},'VALIDATION_ERROR'],
 [{originalFilename:'huge.pdf',contentType:'application/pdf',sizeBytes:20971521},'VALIDATION_ERROR'],
])('rejects unsafe compliance upload metadata',async(body,code)=>{
 const res=response();await createComplianceHandler({repository:{},resolveContext:jest.fn().mockResolvedValue({...context,permissions:['compliance.manage']})})({method:'POST',query:{action:'upload-authorise'},headers:{},body},res);expect(res.statusCode).toBe(400);expect(res.body.error.code).toBe(code);
});

test('verifies uploads before atomically creating an authority',async()=>{
 const repository={verifyComplianceUpload:jest.fn().mockResolvedValue({uploadId:'11111111-1111-4111-8111-111111111111',checksumSha256:'a'.repeat(64)}),finalizeOperatingAuthority:jest.fn().mockResolvedValue({record:{id:'33333333-3333-4333-8333-333333333333'},evidence:[{id:'44444444-4444-4444-8444-444444444444'}]})},res=response();
 await createComplianceHandler({repository,resolveContext:jest.fn().mockResolvedValue({...context,permissions:['compliance.manage']})})({method:'POST',query:{action:'authority-create'},headers:{},body:{authorityTypeCode:'SPECIAL_APPROVAL',authorityNumber:'CASA.APP.1',issueDate:'2026-08-08',uploads:[{uploadId:'11111111-1111-4111-8111-111111111111'}]}},res);
 expect(repository.verifyComplianceUpload).toHaveBeenCalledTimes(1);expect(repository.finalizeOperatingAuthority).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({uploads:[expect.objectContaining({checksumSha256:'a'.repeat(64)})]}));expect(res.statusCode).toBe(201);
});

test('reads the authority register without exposing a write path',async()=>{
 const repository={readOperatingAuthorityRegister:jest.fn().mockResolvedValue({authorities:[],authorityTypes:[]})},res=response();
 await createComplianceHandler({repository,resolveContext:jest.fn().mockResolvedValue(context)})({method:'GET',query:{action:'register'},headers:{}},res);expect(res.statusCode).toBe(200);expect(res.body.data.authorities).toEqual([]);
});
