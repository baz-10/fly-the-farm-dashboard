import { ComplianceApiError, createComplianceApi } from '../complianceApi';

const response = (status: number, body: string, contentType = 'text/plain') => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? contentType : null },
  text: jest.fn().mockResolvedValue(body),
}) as unknown as Response;

test('explains an oversized compliance upload rejected before the API handler', async () => {
  const fetcher = jest.fn().mockResolvedValue(response(413, 'FUNCTION_PAYLOAD_TOO_LARGE')) as unknown as typeof fetch;

  await expect(createComplianceApi(fetcher).overview()).rejects.toMatchObject({
    name: 'Error',
    code: 'FUNCTION_PAYLOAD_TOO_LARGE',
    status: 413,
    message: 'The compliance file is too large for the old upload route. Use the secure file upload and try again.',
  });
});

test('preserves safe API error code and correlation reference', async () => {
  const fetcher = jest.fn().mockResolvedValue(response(409, JSON.stringify({
    error: { code: 'VERSION_CONFLICT', message: 'The authority changed before save.', correlationId: 'corr-safe-123' },
  }), 'application/json')) as unknown as typeof fetch;

  let caught: unknown;
  try { await createComplianceApi(fetcher).overview(); } catch (error) { caught = error; }

  expect(caught).toBeInstanceOf(ComplianceApiError);
  expect(caught).toMatchObject({ code: 'VERSION_CONFLICT', status: 409, correlationId: 'corr-safe-123' });
});

test('authorises and directly uploads multiple authority files before finalisation', async () => {
  const fetcher = jest.fn()
    .mockResolvedValueOnce(response(201, JSON.stringify({data:{uploadId:'11111111-1111-4111-8111-111111111111',uploadUrl:'https://storage.example/one'}}),'application/json'))
    .mockResolvedValueOnce(response(201, JSON.stringify({data:{uploadId:'22222222-2222-4222-8222-222222222222',uploadUrl:'https://storage.example/two'}}),'application/json'))
    .mockResolvedValueOnce(response(201, JSON.stringify({data:{record:{id:'authority-1'}}}),'application/json')) as unknown as typeof fetch;
  const opened:string[]=[];
  class Xhr { status=200; upload={addEventListener:jest.fn()}; onload:()=>void=()=>{}; onerror:()=>void=()=>{}; open(_method:string,url:string){opened.push(url);} setRequestHeader(){} send(){this.onload();} }
  const previous=global.XMLHttpRequest;(global as any).XMLHttpRequest=Xhr;
  try{
    const api=createComplianceApi(fetcher),files=[new File(['one'],'one.pdf',{type:'application/pdf'}),new File(['two'],'two.pdf',{type:'application/pdf'})];
    const uploads=await api.uploadAuthorityFiles(files.map(file=>({file,evidenceRole:'DOCUMENT',description:''})));
    await api.createAuthority({authorityTypeCode:'INSTRUMENT',authorityNumber:'CASA.INST.1'},uploads);
    expect(opened).toEqual(['https://storage.example/one','https://storage.example/two']);
    expect(JSON.parse(String((fetcher as jest.Mock).mock.calls[2][1].body)).uploads).toEqual([{uploadId:'11111111-1111-4111-8111-111111111111'},{uploadId:'22222222-2222-4222-8222-222222222222'}]);
  }finally{global.XMLHttpRequest=previous;}
});
