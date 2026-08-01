import { createOperationalDataStore, describeOperationalError, OperationalDataGateway } from '../operationalDataStore';
import { Client, Field, Property } from '../../types/fieldManagement';

const client = (id: string, name = id): Client => ({
  id, contractorUserId: '', name, phone: '', email: '', notes: '', rowVersion: 1,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
});
const property = (id: string, clientId: string): Property => ({
  id, clientId, name: id, address: '', state: 'NSW', locality: '', lotPlan: '', notes: '', rowVersion: 1,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
});
const field = (id: string, propertyId: string): Field => ({
  id, propertyId, name: id, sizeHa: 1, boundary: null, notes: '', rowVersion: 1,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function gateway(overrides: Partial<OperationalDataGateway> = {}): OperationalDataGateway {
  return {
    resolveOrganisation: jest.fn().mockResolvedValue('org-1'),
    listClients: jest.fn().mockResolvedValue([]),
    listProperties: jest.fn().mockResolvedValue([]),
    listFields: jest.fn().mockResolvedValue([]),
    createClient: jest.fn(), updateClient: jest.fn(), archiveClient: jest.fn(),
    createProperty: jest.fn(), updateProperty: jest.fn(), archiveProperty: jest.fn(),
    createField: jest.fn(), updateField: jest.fn(), archiveField: jest.fn(),
    ...overrides,
  };
}

describe('operational data store', () => {
  test('describes validation, archive and current-version conflicts for workflow screens', () => {
    expect(describeOperationalError({ message: 'Changed', code: 'VERSION_CONFLICT', status: 409, currentVersion: 5 }))
      .toBe('This record changed on the server. Reload and try again. Current version: 5.');
    expect(describeOperationalError({ message: 'Dependants', code: 'ARCHIVE_CONFLICT', status: 409 }))
      .toBe('This record cannot be archived while active dependent records remain.');
    expect(describeOperationalError({ message: 'Name is required', code: 'VALIDATION_ERROR', status: 400 }))
      .toBe('Name is required');
  });

  test('clears the previous tenant immediately before the next authenticated scope loads', async () => {
    const secondLoad = deferred<Client[]>();
    const data = gateway({
      resolveOrganisation: jest.fn().mockResolvedValueOnce('org-1').mockResolvedValueOnce('org-2'),
      listClients: jest.fn().mockResolvedValueOnce([client('one')]).mockReturnValueOnce(secondLoad.promise),
    });
    const store = createOperationalDataStore(data);
    await store.setAuthenticatedUser('user-1');
    expect(store.getSnapshot().clients).toHaveLength(1);

    const loading = store.setAuthenticatedUser('user-2');
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ clients: [], properties: [], fields: [], status: 'loading' }));
    secondLoad.resolve([client('two')]);
    await loading;
    expect(store.getSnapshot().clients.map((record) => record.id)).toEqual(['two']);
  });

  test('clears before reloading when the same user changes authoritative tenant identity', async () => {
    const secondLoad = deferred<Client[]>();
    const data = gateway({
      resolveOrganisation: jest.fn().mockResolvedValueOnce('org-1').mockResolvedValueOnce('org-2'),
      listClients: jest.fn().mockResolvedValueOnce([client('one')]).mockReturnValueOnce(secondLoad.promise),
    });
    const store = createOperationalDataStore(data);
    await store.setAuthenticatedUser('user-1', 'tenant-1');

    const loading = store.setAuthenticatedUser('user-1', 'tenant-2');
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ clients: [], status: 'loading' }));
    secondLoad.resolve([client('two')]);
    await loading;
    expect(store.getSnapshot().clients.map((record) => record.id)).toEqual(['two']);
  });

  test('distinguishes a failed load from a valid empty result', async () => {
    const store = createOperationalDataStore(gateway({ listClients: jest.fn().mockRejectedValue(Object.assign(new Error('Offline'), { code: 'NETWORK_ERROR' })) }));
    await store.setAuthenticatedUser('user-1');
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ status: 'error', clients: [], error: expect.objectContaining({ code: 'NETWORK_ERROR' }) }));

    const emptyStore = createOperationalDataStore(gateway());
    await emptyStore.setAuthenticatedUser('user-1');
    expect(emptyStore.getSnapshot()).toEqual(expect.objectContaining({ status: 'ready', clients: [], error: null }));
  });

  test('does not publish a created record or saved state until the server confirms it', async () => {
    const save = deferred<Client>();
    const store = createOperationalDataStore(gateway({ createClient: jest.fn().mockReturnValue(save.promise) }));
    await store.setAuthenticatedUser('user-1');

    const pending = store.createClient({ name: 'Pending', phone: '', email: '', notes: '', contractorUserId: '' });
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ clients: [], saving: true, savedAt: null }));
    save.resolve(client('confirmed', 'Pending'));
    await pending;
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ clients: [expect.objectContaining({ id: 'confirmed' })], saving: false }));
    expect(store.getSnapshot().savedAt).not.toBeNull();
  });

  test('keeps saving true until every overlapping mutation settles', async () => {
    const first = deferred<Client>();
    const second = deferred<Client>();
    const store = createOperationalDataStore(gateway({
      createClient: jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    }));
    await store.setAuthenticatedUser('user-1');

    const firstPending = store.createClient({ name: 'First', phone: '', email: '', notes: '', contractorUserId: '' });
    const secondPending = store.createClient({ name: 'Second', phone: '', email: '', notes: '', contractorUserId: '' });
    first.resolve(client('first'));
    await firstPending;
    expect(store.getSnapshot().saving).toBe(true);
    second.resolve(client('second'));
    await secondPending;
    expect(store.getSnapshot().saving).toBe(false);
  });

  test('scopes saved confirmation to the confirmed resource and record', async () => {
    const store = createOperationalDataStore(gateway({ createClient: jest.fn().mockResolvedValue(client('confirmed')) }));
    await store.setAuthenticatedUser('user-1');
    await store.createClient({ name: 'Confirmed', phone: '', email: '', notes: '', contractorUserId: '' });
    expect(store.getSnapshot().lastSaved).toEqual({
      resource: 'client', recordId: 'confirmed', at: expect.any(String),
    });
  });

  test('discards an in-flight mutation when authentication changes before confirmation', async () => {
    const save = deferred<Client>();
    const store = createOperationalDataStore(gateway({ createClient: jest.fn().mockReturnValue(save.promise) }));
    await store.setAuthenticatedUser('user-1');
    const pending = store.createClient({ name: 'Old tenant', phone: '', email: '', notes: '', contractorUserId: '' });
    await store.setAuthenticatedUser(null);
    save.resolve(client('stale'));

    await expect(pending).rejects.toEqual(expect.objectContaining({ code: 'STALE_SCOPE' }));
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ status: 'idle', clients: [], savedAt: null }));
  });

  test.each([
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
  ])('marks HTTP %s loads unauthorised and keeps detail records cleared', async (status, code) => {
    const store = createOperationalDataStore(gateway({
      listClients: jest.fn().mockRejectedValue(Object.assign(new Error('No access'), { status, code })),
    }));
    await store.setAuthenticatedUser('user-1');
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ status: 'unauthorised', clients: [], properties: [], fields: [] }));
  });

  test('retains version and archive conflict details while leaving confirmed records unchanged', async () => {
    const conflict = Object.assign(new Error('Changed'), { status: 409, code: 'VERSION_CONFLICT', currentVersion: 5, details: { currentVersion: 5 } });
    const data = gateway({
      listClients: jest.fn().mockResolvedValue([client('client-1')]),
      updateClient: jest.fn().mockRejectedValue(conflict),
      archiveClient: jest.fn().mockRejectedValue(Object.assign(new Error('Dependants'), { status: 409, code: 'ARCHIVE_CONFLICT' })),
    });
    const store = createOperationalDataStore(data);
    await store.setAuthenticatedUser('user-1');

    await expect(store.updateClient('client-1', { name: 'Lost edit' })).rejects.toBe(conflict);
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ clients: [expect.objectContaining({ name: 'client-1' })], error: expect.objectContaining({ code: 'VERSION_CONFLICT', currentVersion: 5 }) }));
    await expect(store.archiveClient('client-1')).rejects.toEqual(expect.objectContaining({ code: 'ARCHIVE_CONFLICT' }));
    expect(store.getSnapshot().clients).toHaveLength(1);
  });

  test('refresh always reloads authoritative records instead of treating memory as persistence', async () => {
    const data = gateway({ listClients: jest.fn().mockResolvedValueOnce([client('one')]).mockResolvedValueOnce([client('two')]) });
    const store = createOperationalDataStore(data);
    await store.setAuthenticatedUser('user-1');
    await store.refresh();
    expect(data.listClients).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().clients.map((record) => record.id)).toEqual(['two']);
  });

  test('clears all operational data synchronously on logout', async () => {
    const store = createOperationalDataStore(gateway({
      listClients: jest.fn().mockResolvedValue([client('client-1')]),
      listProperties: jest.fn().mockResolvedValue([property('property-1', 'client-1')]),
      listFields: jest.fn().mockResolvedValue([field('field-1', 'property-1')]),
    }));
    await store.setAuthenticatedUser('user-1');
    await store.setAuthenticatedUser(null);
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ status: 'idle', clients: [], properties: [], fields: [] }));
  });
});
