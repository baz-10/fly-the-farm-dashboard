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
