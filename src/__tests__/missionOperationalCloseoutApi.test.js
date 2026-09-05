const { strToU8, zipSync } = require('fflate');
const { createMissionOperationalCloseoutHandler } = require('../../server/operational-api');
const { OperationalRepository } = require('../../server/operational-repository');

const org = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const location = '33333333-3333-4333-8333-333333333333';
const mission = '44444444-4444-4444-8444-444444444444';
const response = () => ({ statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } });
const request = (method, body = {}, query = {}) => ({ method, body, query: { missionId: mission, ...query }, headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } });
const context = (permissions) => ({ organisation: { id: org }, internalUser: { id: actor }, permissions, operatingLocationIds: [location] });
const repository = { get: jest.fn(), readMissionOperationalCloseout: jest.fn(), createMissionOperationalImport: jest.fn(), saveMissionActualResources: jest.fn(), saveMissionActualChemicals: jest.fn(), saveMissionOperationalEvents: jest.fn(), submitMissionOperationalEvidence: jest.fn(), completeMission: jest.fn() };
const validKml = '<kml><Document><Placemark><LineString><coordinates>151,-27,0 151.001,-27.001,0</coordinates></LineString></Placemark></Document></kml>';
const kmz = (entries = { 'doc.kml': strToU8(validKml) }) => Buffer.from(zipSync(entries));
const forgeAdvertisedUncompressedSize = (archive, advertisedSize) => {
  const forged = Buffer.from(archive);
  const localHeader = forged.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const centralHeader = forged.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  if (localHeader < 0 || centralHeader < 0) throw new Error('ZIP fixture headers are missing.');
  forged.writeUInt32LE(advertisedSize, localHeader + 22);
  forged.writeUInt32LE(advertisedSize, centralHeader + 24);
  return forged;
};
const forgeAdvertisedCrc = (archive, advertisedCrc) => {
  const forged = Buffer.from(archive);
  const localHeader = forged.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const centralHeader = forged.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  if (localHeader < 0 || centralHeader < 0) throw new Error('ZIP fixture headers are missing.');
  forged.writeUInt32LE(advertisedCrc, localHeader + 14);
  forged.writeUInt32LE(advertisedCrc, centralHeader + 16);
  return forged;
};

beforeEach(() => {
  jest.clearAllMocks();
  repository.get.mockResolvedValue({ id: mission, operating_location_id: location });
  repository.readMissionOperationalCloseout.mockResolvedValue({ authorisation: { id: '55555555-5555-4555-8555-555555555555' }, imports: [] });
});

test('reads authoritative closeout and records resources through trusted commands', async () => {
  const handler = createMissionOperationalCloseoutHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context(['mission.operational.read', 'mission.operational.write'])) });
  let res = response();
  await handler(request('GET'), res);
  expect(res.statusCode).toBe(200);
  res = response();
  await handler(request('POST', { expectedVersion: 0, aircraftIds: ['66666666-6666-4666-8666-666666666666'], equipmentKitIds: [], personnelIds: [], batteries: [], reloads: [], refills: [] }, { action: 'resources' }), res);
  expect(repository.saveMissionActualResources).toHaveBeenCalledWith(expect.anything(), mission, expect.objectContaining({ expectedVersion: 0 }));
});

test('imports final KML through authoritative storage with server-derived flight statistics', async () => {
  repository.createMissionOperationalImport.mockResolvedValue({ record: { id: '88888888-8888-4888-8888-888888888888', derived_statistics: { flightLineCount: 1 } } });
  const handler = createMissionOperationalCloseoutHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context(['mission.operational.write'])) });
  const res = response();
  await handler(request('POST', { expectedVersion: 0, fileName: 'flight.kml', fileType: 'kml', evidenceType: 'FINAL_KML', sizeBytes: Buffer.byteLength(validKml), dataUrl: `data:application/vnd.google-earth.kml+xml;base64,${Buffer.from(validKml).toString('base64')}` }, { action: 'import' }), res);
  expect(res.statusCode).toBe(201);
  expect(repository.createMissionOperationalImport).toHaveBeenCalledWith(expect.anything(), mission, expect.objectContaining({ derivedStatistics: expect.objectContaining({ flightLineCount: 1 }) }));
});

test('keeps one flight-line artefact with multiple explicit day and aircraft attributions', async () => {
  repository.createMissionOperationalImport.mockResolvedValue({ record: { id: '88888888-8888-4888-8888-888888888888' } });
  const handler = createMissionOperationalCloseoutHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context(['mission.operational.write'])) });
  const attributions = [
    { operatingDayId: '99999999-9999-4999-8999-999999999999', aircraftId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', confidence: 'OPERATOR_CONFIRMED' },
    { operatingDayId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', aircraftId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', confidence: 'SOURCE_METADATA' },
  ];
  const res = response();
  await handler(request('POST', { expectedVersion: 0, fileName: 'multi-aircraft.kml', fileType: 'kml', evidenceType: 'FLIGHT_LINES', sizeBytes: Buffer.byteLength(validKml), dataUrl: `data:application/vnd.google-earth.kml+xml;base64,${Buffer.from(validKml).toString('base64')}`, attributions }, { action: 'import' }), res);
  expect(res.statusCode).toBe(201);
  expect(repository.createMissionOperationalImport).toHaveBeenCalledTimes(1);
  expect(repository.createMissionOperationalImport).toHaveBeenCalledWith(expect.anything(), mission, expect.objectContaining({ attributions, derivedStatistics: expect.not.objectContaining({ flightHours: expect.anything() }) }));
});

test('retains a structurally valid KMZ unchanged without deriving regulatory time', async () => {
  repository.createMissionOperationalImport.mockResolvedValue({ record: { id: '88888888-8888-4888-8888-888888888888' } });
  const handler = createMissionOperationalCloseoutHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context(['mission.operational.write'])) });
  const bytes = kmz();
  const res = response();
  await handler(request('POST', { expectedVersion: 0, fileName: 'flight-lines.kmz', fileType: 'kmz', evidenceType: 'FLIGHT_LINES', sizeBytes: bytes.length, dataUrl: `data:application/vnd.google-earth.kmz;base64,${bytes.toString('base64')}`, attributions: [] }, { action: 'import' }), res);
  expect(res.statusCode).toBe(201);
  expect(repository.createMissionOperationalImport).toHaveBeenCalledWith(expect.anything(), mission, expect.objectContaining({ fileType: 'kmz', parseStatus: 'RETAINED', derivedStatistics: {}, bytes }));
});

test.each([
  ['extension mismatch', 'flight-lines.kml', 'kmz', 'application/vnd.google-earth.kmz', kmz()],
  ['MIME mismatch', 'flight-lines.kmz', 'kmz', 'application/vnd.google-earth.kml+xml', kmz()],
  ['fake ZIP signature', 'flight-lines.kmz', 'kmz', 'application/vnd.google-earth.kmz', Buffer.from('PK retained opaque kmz evidence')],
  ['missing KML member', 'flight-lines.kmz', 'kmz', 'application/vnd.google-earth.kmz', kmz({ 'notes.txt': strToU8('opaque') })],
  ['unsafe ZIP member', 'flight-lines.kmz', 'kmz', 'application/vnd.google-earth.kmz', kmz({ '../doc.kml': strToU8(validKml) })],
  ['excess ZIP members', 'flight-lines.kmz', 'kmz', 'application/vnd.google-earth.kmz', kmz(Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`entry-${index}.kml`, strToU8(validKml)])))],
  ['forged expansion metadata', 'flight-lines.kmz', 'kmz', 'application/vnd.google-earth.kmz', forgeAdvertisedUncompressedSize(
    kmz({ 'doc.kml': strToU8(`<kml></kml>${'A'.repeat(3 * 1024 * 1024 + 1)}`) }),
    Buffer.byteLength('<kml></kml>'),
  )],
  ['forged checksum metadata', 'flight-lines.kmz', 'kmz', 'application/vnd.google-earth.kmz', forgeAdvertisedCrc(kmz(), 0)],
])('rejects %s before immutable storage', async (_name, fileName, fileType, mime, bytes) => {
  const handler = createMissionOperationalCloseoutHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context(['mission.operational.write'])) });
  const res = response();
  await handler(request('POST', { expectedVersion: 0, fileName, fileType, evidenceType: 'FLIGHT_LINES', sizeBytes: bytes.length, dataUrl: `data:${mime};base64,${bytes.toString('base64')}`, attributions: [] }, { action: 'import' }), res);
  expect(res.statusCode).toBe(400);
  expect(repository.createMissionOperationalImport).not.toHaveBeenCalled();
});

test('rejects malformed flight-line attribution before storing the immutable original', async () => {
  const handler = createMissionOperationalCloseoutHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context(['mission.operational.write'])) });
  const bytes = kmz();
  const res = response();
  await handler(request('POST', { expectedVersion: 0, fileName: 'flight-lines.kmz', fileType: 'kmz', evidenceType: 'FLIGHT_LINES', sizeBytes: bytes.length, dataUrl: `data:application/vnd.google-earth.kmz;base64,${bytes.toString('base64')}`, attributions: [{ operatingDayId: null, aircraftId: null, confidence: 'GUESSED' }] }, { action: 'import' }), res);
  expect(res.statusCode).toBe(400);
  expect(repository.createMissionOperationalImport).not.toHaveBeenCalled();
});

test('completion enforces explicit permission and optimistic conflicts', async () => {
  repository.completeMission.mockResolvedValueOnce({ conflict: true, currentVersion: 1 });
  const handler = createMissionOperationalCloseoutHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context(['mission.completion.complete'])) });
  const res = response();
  await handler(request('POST', { expectedVersion: 0, operationalRevisionId: '77777777-7777-4777-8777-777777777777', declaration: 'Actual evidence checked.' }, { action: 'complete' }), res);
  expect(res.statusCode).toBe(409);
  expect(res.body.error.code).toBe('VERSION_CONFLICT');
});

test('completion reports operating-day reconciliation failures', async () => {
  expect(new OperationalRepository().mapMissionCloseoutResult({ aircraft_days_incomplete: true }))
    .toEqual({ aircraftDaysIncomplete: true });
  repository.completeMission.mockResolvedValueOnce({ aircraftDaysIncomplete: true });
  const handler = createMissionOperationalCloseoutHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context(['mission.completion.complete'])) });
  const res = response();
  await handler(request('POST', { expectedVersion: 0, operationalRevisionId: '77777777-7777-4777-8777-777777777777', declaration: 'Actual evidence checked.' }, { action: 'complete' }), res);
  expect(res.statusCode).toBe(409);
  expect(res.body.error.code).toBe('AIRCRAFT_DAYS_INCOMPLETE');
});

test('permissions, location scope and unsupported actions fail visibly', async () => {
  let handler = createMissionOperationalCloseoutHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context([])) });
  let res = response();
  await handler(request('GET'), res);
  expect(res.statusCode).toBe(403);
  repository.get.mockResolvedValueOnce(null);
  handler = createMissionOperationalCloseoutHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context(['mission.operational.read'])) });
  res = response();
  await handler(request('GET'), res);
  expect(res.statusCode).toBe(404);
  res = response();
  await handler(request('POST', { expectedVersion: 0 }, { action: 'unknown' }), res);
  expect(res.body.error.code).toBe('UNSUPPORTED_ACTION');
});
