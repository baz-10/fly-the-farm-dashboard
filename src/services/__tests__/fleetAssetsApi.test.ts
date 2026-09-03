import { createOperationalApi, OperationalApiError } from '../operationalApi';

const locationId = '33333333-3333-4333-8333-333333333333';
const assetId = '44444444-4444-4444-8444-444444444444';

function response(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => 'correlation-fleet-1' } } as Response);
}

const record = {
  id: assetId, operatingLocationId: locationId, assetType: 'generator', assetIdentifier: 'GEN-003',
  serialNumber: 'SER-003', manufacturer: 'Honda', model: 'EU70', manufactureYear: 2025,
  status: 'available', notes: '', rowVersion: 1,
  createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z',
};

describe('Fleet asset operational client', () => {
  beforeEach(() => { global.fetch = jest.fn(); });

  test('maps authoritative Fleet assets and sends the exact current Base ID', async () => {
    (global.fetch as jest.Mock).mockReturnValue(response(201, { data: record }));
    const input = {
      operatingLocationId: locationId, assetType: 'generator' as const, assetIdentifier: 'GEN-003',
      serialNumber: 'SER-003', manufacturer: 'Honda', model: 'EU70', manufactureYear: 2025,
      status: 'available' as const, notes: '',
    };
    const created = await createOperationalApi().fleetAssets.create(input);
    expect(created).toEqual(record);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/fleet-assets', expect.objectContaining({
      method: 'POST', body: JSON.stringify(input), credentials: 'same-origin',
    }));
  });

  test('uses expectedVersion for updates and archive', async () => {
    (global.fetch as jest.Mock)
      .mockReturnValueOnce(response(200, { data: { ...record, rowVersion: 2 } }))
      .mockReturnValueOnce(response(200, { data: { ...record, rowVersion: 3 } }));
    await createOperationalApi().fleetAssets.update(assetId, { ...record, status: 'maintenance' }, 1);
    await createOperationalApi().fleetAssets.archive(assetId, 2);
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual(expect.objectContaining({ expectedVersion: 1, status: 'maintenance' }));
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body)).toEqual({ expectedVersion: 2 });
  });

  test('preserves safe row-version conflict diagnostics', async () => {
    (global.fetch as jest.Mock).mockReturnValue(response(409, { error: { code: 'VERSION_CONFLICT', message: 'This Fleet asset changed.', meta: { currentVersion: 4 } } }));
    await expect(createOperationalApi().fleetAssets.update(assetId, { ...record, status: 'maintenance' }, 1))
      .rejects.toEqual(expect.objectContaining<Partial<OperationalApiError>>({ code: 'VERSION_CONFLICT', currentVersion: 4 }));
  });

  test('fails closed on malformed Fleet records', async () => {
    (global.fetch as jest.Mock).mockReturnValue(response(200, { data: { ...record, operatingLocationId: '' } }));
    await expect(createOperationalApi().fleetAssets.get(assetId)).rejects.toEqual(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
  });
});
