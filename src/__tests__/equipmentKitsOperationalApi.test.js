const { createOperationalHandler } = require('../../server/operational-api');

const locationId = '33333333-3333-4333-8333-333333333333';
const aircraftId = '44444444-4444-4444-8444-444444444444';
const kitId = '55555555-5555-4555-8555-555555555555';
const response = () => ({ statusCode: 200, body: undefined, headers: {}, status(code) { this.statusCode=code; return this; }, json(body) { this.body=body; return this; }, end() { return this; }, setHeader(name,value) { this.headers[name.toLowerCase()]=value; } });
const request = (method, body={}, query={}) => ({ method,body,query,headers:{ host:'localhost:3001',origin:'http://localhost:3001' } });
const context = (permissions, locations=[locationId]) => ({ user:{id:'auth'},organisation:{id:'11111111-1111-4111-8111-111111111111'},internalUser:{id:'22222222-2222-4222-8222-222222222222'},permissions,operatingLocationIds:locations,entitlement:{seatActive:true} });
const fixture = (overrides={}) => ({ operatingLocationId:locationId,name:'T100 Broadcast Kit',type:'spray',description:'Operational kit',status:'available',
  specifications:{capacity:100},components:[{id:'pump-1',name:'Pump'}],operationalData:{setupTime:15},financialData:{purchasePrice:25000},compatibleAircraft:[aircraftId],notes:'Ready',...overrides });
const record = (overrides={}) => ({ id:kitId,operating_location_id:locationId,name:'T100 Broadcast Kit',kit_type:'spray',description:'Operational kit',status:'available',
  specifications:{capacity:100},components:[{id:'pump-1',name:'Pump'}],operational_data:{setupTime:15},financial_data:{purchasePrice:25000},compatible_aircraft_ids:[aircraftId],notes:'Ready',row_version:1,created_at:'2026-08-02T00:00:00Z',updated_at:'2026-08-02T00:00:00Z',...overrides });
const handler = (repository, permissions=['equipment_kits.read','equipment_kits.create','equipment_kits.update','equipment_kits.archive']) =>
  createOperationalHandler('equipment-kits',{repository,resolveContext:jest.fn().mockResolvedValue(context(permissions))});

describe('authoritative Equipment Kits API', () => {
  test('preserves the complete Equipment Kit contract on create', async () => {
    const repository={create:jest.fn().mockResolvedValue({record:record()})}; const res=response();
    await handler(repository)(request('POST',fixture()),res);
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toEqual(expect.objectContaining({...fixture(),id:kitId,rowVersion:1}));
    expect(repository.create).toHaveBeenCalledWith('equipment-kits',expect.anything(),expect.objectContaining({operating_location_id:locationId,kit_type:'spray',compatible_aircraft_ids:[aircraftId]}));
  });

  test('enforces location scope and optimistic archive controls', async () => {
    const repository={get:jest.fn().mockResolvedValue(record()),hasActiveDependencies:jest.fn().mockResolvedValue(false),archive:jest.fn().mockResolvedValue({record:record({archived_at:'2026-08-02T01:00:00Z',row_version:2})})};
    const outside=response();
    await handler(repository)(request('POST',fixture({operatingLocationId:'66666666-6666-4666-8666-666666666666'})),outside);
    expect(outside.body.error.code).toBe('LOCATION_FORBIDDEN');
    const archived=response(); await handler(repository)(request('DELETE',{expectedVersion:1},{id:kitId}),archived);
    expect(archived.statusCode).toBe(200);
    expect(repository.archive).toHaveBeenCalledWith('equipment-kits',expect.anything(),kitId,1);
  });

  test('rejects malformed compatibility and unexpected fields', async () => {
    const repository={create:jest.fn()};
    const malformed=response(); await handler(repository)(request('POST',fixture({compatibleAircraft:['not-a-uuid']})),malformed);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
    const unexpected=response(); await handler(repository)(request('POST',{...fixture(),legacyStorageKey:'x'}),unexpected);
    expect(unexpected.body.error.code).toBe('VALIDATION_ERROR');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('dispatches controlled aircraft assignment with assign permission', async () => {
    const assignment={id:'77777777-7777-4777-8777-777777777777',aircraft_id:aircraftId,equipment_kit_id:kitId,row_version:1};
    const repository={get:jest.fn().mockResolvedValue(record()),assignEquipmentKit:jest.fn().mockResolvedValue({record:assignment})};
    const res=response();
    await handler(repository,['equipment_kits.assign'])(request('POST',{aircraftId,configurationName:'Operational T100',configurationData:{weightAndBalance:{withinLimits:true}}},{id:kitId,action:'assign'}),res);
    expect(res.statusCode).toBe(201);
    expect(repository.assignEquipmentKit).toHaveBeenCalledWith(expect.anything(),kitId,aircraftId,'Operational T100',expect.any(Object));
  });
});
