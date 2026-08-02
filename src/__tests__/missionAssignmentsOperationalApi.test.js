const { createOperationalHandler } = require('../../server/operational-api');

const organisationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const locationId = '33333333-3333-4333-8333-333333333333';
const jobId = '44444444-4444-4444-8444-444444444444';
const aircraftId = '55555555-5555-4555-8555-555555555555';
const kitId = '66666666-6666-4666-8666-666666666666';

function response() {
  return { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn(), end: jest.fn() };
}

function request(body) {
  return { method: 'POST', query: {}, body, headers: { origin: 'https://app.test', host: 'app.test' } };
}

test('persists authoritative Mission Aircraft and Equipment assignments through the Mission command', async () => {
  const record = {
    id: '77777777-7777-4777-8777-777777777777', job_id: jobId, operating_location_id: locationId,
    mission_number: 'MSN-1', title: 'First draft', description: '', status: 'planning', scheduled_start_at: null,
    aircraft_ids: [aircraftId], equipment_kit_ids: [kitId], row_version: 1,
  };
  const repository = {
    relationshipExists: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue({ record }),
  };
  const handler = createOperationalHandler('missions', {
    repository,
    resolveContext: jest.fn().mockResolvedValue({
      organisation: { id: organisationId }, internalUser: { id: userId },
      permissions: ['missions.create'], operatingLocationIds: [locationId],
    }),
  });
  const res = response();

  await handler(request({
    jobId, operatingLocationId: locationId, missionNumber: 'MSN-1', title: 'First draft', description: '',
    status: 'Planning', scheduledStartAt: null, aircraftIds: [aircraftId], equipmentKitIds: [kitId],
  }), res);

  expect(repository.relationshipExists).toHaveBeenCalledWith('aircraft', expect.anything(), aircraftId, {
    operating_location_id: locationId, status: 'operational', mission_ready: true,
  });
  expect(repository.relationshipExists).toHaveBeenCalledWith('equipment-kits', expect.anything(), kitId, {
    operating_location_id: locationId, status: 'available',
  });
  expect(repository.create).toHaveBeenCalledWith('missions', expect.anything(), expect.objectContaining({
    aircraft_ids: [aircraftId], equipment_kit_ids: [kitId],
  }));
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith({ data: expect.objectContaining({ aircraftIds: [aircraftId], equipmentKitIds: [kitId] }) });
});

test('rejects duplicate Mission assignment IDs before repository writes', async () => {
  const repository = { relationshipExists: jest.fn().mockResolvedValue(true), create: jest.fn() };
  const handler = createOperationalHandler('missions', {
    repository,
    resolveContext: jest.fn().mockResolvedValue({
      organisation: { id: organisationId }, internalUser: { id: userId },
      permissions: ['missions.create'], operatingLocationIds: [locationId],
    }),
  });
  const res = response();
  await handler(request({
    jobId, operatingLocationId: locationId, missionNumber: 'MSN-1', title: 'First draft', status: 'Planning',
    aircraftIds: [aircraftId, aircraftId], equipmentKitIds: [],
  }), res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(repository.create).not.toHaveBeenCalled();
});
