import { createEquipmentKitsApiGateway } from '../equipmentKitsApi';

const kit = { id:'55555555-5555-4555-8555-555555555555',operatingLocationId:'33333333-3333-4333-8333-333333333333',name:'T100 Kit',type:'spray-system',description:'Kit',
  status:'available',specifications:{weight:10},components:[],operationalData:{status:'available'},financialData:{purchasePrice:1},compatibleAircraft:[],notes:'',rowVersion:1,createdAt:'2026-08-02',updatedAt:'2026-08-02' };

describe('Equipment Kits API gateway', () => {
  test('uses only the versioned production API for list/create/update/archive', async () => {
    const fetcher=jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({data:[kit]}),{status:200,headers:{'Content-Type':'application/json'}}))
      .mockResolvedValueOnce(new Response(JSON.stringify({data:kit}),{status:201,headers:{'Content-Type':'application/json'}}))
      .mockResolvedValueOnce(new Response(JSON.stringify({data:{...kit,rowVersion:2}}),{status:200,headers:{'Content-Type':'application/json'}}))
      .mockResolvedValueOnce(new Response(JSON.stringify({data:{...kit,rowVersion:3}}),{status:200,headers:{'Content-Type':'application/json'}}));
    const api=createEquipmentKitsApiGateway(fetcher as any);
    expect(await api.list()).toHaveLength(1);
    await api.create(kit as any); await api.update(kit.id,kit as any,1); await api.archive(kit.id,2);
    expect(fetcher.mock.calls.map(([url])=>url)).toEqual(['/api/v1/equipment-kits?page=1&pageSize=100','/api/v1/equipment-kits',`/api/v1/equipment-kits?id=${kit.id}`,`/api/v1/equipment-kits?id=${kit.id}`]);
    expect(fetcher.mock.calls.some(([url])=>String(url).includes('/api/store')||String(url).includes('ftf_aircraft_data'))).toBe(false);
  });
});
