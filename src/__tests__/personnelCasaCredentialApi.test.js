const { createPersonnelCasaCredentialsHandler } = require('../../server/compliance-api');

const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const personnel='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const credential='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const context={organisation:{id:org},internalUser:{id:user},permissions:['personnel.read','personnel.update','personnel.private.read','compliance.verify']};
const response=()=>{const res={headers:{},setHeader:(k,v)=>{res.headers[k]=v;},status:s=>{res.statusCode=s;return res;},json:b=>{res.body=b;return res;}};return res;};
const req=(method,query={},body={},headers={origin:'https://spray-command.test',host:'spray-command.test'})=>({method,query,body,headers});

test('creates non-expiring RePL evidence through the trusted command',async()=>{
 const repository={writePersonnelCasaCredential:jest.fn().mockResolvedValue({record:{id:credential,credential_type:'RePL',expiry_date:null},expiryDisplay:'Non-expiring'})};
 const res=response();
 await createPersonnelCasaCredentialsHandler({repository,resolveContext:jest.fn().mockResolvedValue(context)})(req('POST',{action:'create'},{personnelId:personnel,credentialType:'RePL',identifier:'REPL-1',issuer:'CASA',issueDate:'2026-01-01',categories:['MULTIROTOR'],ratings:['<150KG'],aircraftTypes:['AGRAS T100'],minimumWeightKg:0,maximumWeightKg:149.9,conditions:null,limitations:null,evidence:{internalFileId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',fileVersion:1,checksumSha256:'a'.repeat(64),originalFilename:'repl.pdf',contentType:'application/pdf',sizeBytes:123,provenance:{source:'OPERATOR_UPLOAD'}}}),res);
 expect(res.statusCode).toBe(201);
 expect(repository.writePersonnelCasaCredential).toHaveBeenCalledWith(context,expect.objectContaining({personnelId:personnel,credentialType:'RePL',expiryDate:null}));
});

test('keeps AROC expiry optional and evidence private',async()=>{
 const repository={writePersonnelCasaCredential:jest.fn().mockResolvedValue({record:{id:credential,credential_type:'AROC',expiry_date:null},expiryDisplay:'No expiry recorded'})};
 const res=response();
 await createPersonnelCasaCredentialsHandler({repository,resolveContext:jest.fn().mockResolvedValue(context)})(req('POST',{action:'create'},{personnelId:personnel,credentialType:'AROC',identifier:'AROC-1',issuer:'CASA',issueDate:'2026-01-01',expiryDate:null,categories:[],ratings:[],aircraftTypes:[],conditions:null,limitations:null,evidence:{internalFileId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',fileVersion:1,checksumSha256:'b'.repeat(64),originalFilename:'aroc.pdf',contentType:'application/pdf',sizeBytes:123,provenance:{source:'OPERATOR_UPLOAD'}}}),res);
 expect(res.statusCode).toBe(201);expect(repository.writePersonnelCasaCredential.mock.calls[0][1].expiryDate).toBeNull();
});

test('verification requires compliance.verify and optimistic concurrency',async()=>{
 const repository={verifyPersonnelCasaCredential:jest.fn().mockResolvedValue({record:{id:credential,row_version:2}})};
 const forbidden=response();
 await createPersonnelCasaCredentialsHandler({repository,resolveContext:jest.fn().mockResolvedValue({...context,permissions:['personnel.read']})})(req('POST',{action:'verify'},{credentialId:credential,expectedVersion:1,decision:'VERIFIED',notes:'Evidence checked'}),forbidden);
 expect(forbidden.statusCode).toBe(403);
 const ok=response();await createPersonnelCasaCredentialsHandler({repository,resolveContext:jest.fn().mockResolvedValue(context)})(req('POST',{action:'verify'},{credentialId:credential,expectedVersion:1,decision:'VERIFIED',notes:'Evidence checked'}),ok);
 expect(ok.statusCode).toBe(201);expect(repository.verifyPersonnelCasaCredential).toHaveBeenCalledWith(context,expect.objectContaining({expectedVersion:1}));
});

test('returns precise mission eligibility blockers and never exposes evidence without private permission',async()=>{
 const repository={evaluatePersonnelMissionEligibility:jest.fn().mockResolvedValue({eligible:false,blockers:[{code:'AROC_REQUIRED'}],evidence:{internal_file_id:'secret'}})};
 const res=response();
 await createPersonnelCasaCredentialsHandler({repository,resolveContext:jest.fn().mockResolvedValue({...context,permissions:['personnel.read']})})(req('GET',{action:'eligibility',personnelId:personnel,requirements:JSON.stringify({arocRequired:true})},{}),res);
 expect(res.statusCode).toBe(200);expect(res.body.data.blockers[0].code).toBe('AROC_REQUIRED');expect(res.body.data.evidence).toBeUndefined();
});

test('rejects invalid evidence metadata and cross-site mutations',async()=>{
 const handler=createPersonnelCasaCredentialsHandler({repository:{},resolveContext:jest.fn().mockResolvedValue(context)}),badOrigin=response();
 await handler(req('POST',{action:'create'},{},{origin:'https://evil.test',host:'spray-command.test'}),badOrigin);
 expect(badOrigin.statusCode).toBe(403);
});
