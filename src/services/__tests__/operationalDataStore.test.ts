import { createOperationalDataStore, describeOperationalError, OperationalDataGateway, SAVED_CONFIRMATION_MS } from '../operationalDataStore';
import { OperationalJob } from '../operationalApi';
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
const job = (id: string, fieldIds = ['field-1']): OperationalJob => ({
  id, clientId: 'client-1', propertyId: 'property-1', fieldIds, reference: id, scope: 'Spray weeds', status: 'draft',
  notes: '', rowVersion: 1, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
});
const location = (id: string) => ({
  id, name: `${id} base`, address: '', timezone: 'Australia/Brisbane', rowVersion: 1,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
});
const mission = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: 'MSN-001',
  title: 'North block spray', description: 'Treat lantana', status: 'Planning',
  scheduledStartAt: '2026-08-10T08:30:00Z', rowVersion: 2,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', ...overrides,
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
    listOperatingLocations: jest.fn().mockResolvedValue([]),
    listJobs: jest.fn().mockResolvedValue([]),
    listMissions: jest.fn().mockResolvedValue([]),
    listFieldBoundaryVersions: jest.fn().mockResolvedValue([]),
    createClient: jest.fn(), updateClient: jest.fn(), archiveClient: jest.fn(),
    createProperty: jest.fn(), updateProperty: jest.fn(), archiveProperty: jest.fn(),
    createField: jest.fn(), updateField: jest.fn(), archiveField: jest.fn(),
    createJob: jest.fn(), updateJob: jest.fn(), archiveJob: jest.fn(),
    createMission: jest.fn(), updateMission: jest.fn(), archiveMission: jest.fn(),
    createFieldBoundaryVersion: jest.fn(),
    ...overrides,
  } as OperationalDataGateway;
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

  test('derives scope from an authoritative resolver and ignores a stale session response', async () => {
    const oldSession = deferred<string>();
    const store = createOperationalDataStore(gateway({ listClients: jest.fn().mockResolvedValue([client('current')]) }));
    const oldAuthentication = store.authenticate('user-1', () => oldSession.promise);
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ status: 'loading', clients: [] }));

    await store.authenticate('user-2', async () => 'org-2');
    oldSession.resolve('org-1');
    await oldAuthentication;

    expect(store.getSnapshot()).toEqual(expect.objectContaining({
      status: 'ready', clients: [expect.objectContaining({ id: 'current' })],
    }));
  });

  test.each([
    [401, 'UNAUTHENTICATED', 'unauthorised'],
    [503, 'NETWORK_ERROR', 'error'],
  ])('surfaces session resolution failure %s without loading operational data', async (status, code, expectedStatus) => {
    const data = gateway();
    const store = createOperationalDataStore(data);
    await store.authenticate('user-1', async () => {
      throw Object.assign(new Error('Session unavailable'), { status, code });
    });
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ status: expectedStatus, clients: [], error: expect.objectContaining({ code }) }));
    expect(data.listClients).not.toHaveBeenCalled();
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

  test('expires saved confirmation after the explicit confirmation duration', async () => {
    jest.useFakeTimers();
    try {
      const store = createOperationalDataStore(gateway({ createClient: jest.fn().mockResolvedValue(client('confirmed')) }));
      await store.setAuthenticatedUser('user-1');
      await store.createClient({ name: 'Confirmed', phone: '', email: '', notes: '', contractorUserId: '' });
      expect(store.getSnapshot().lastSaved).not.toBeNull();
      jest.advanceTimersByTime(SAVED_CONFIRMATION_MS);
      expect(store.getSnapshot().lastSaved).toBeNull();
      expect(store.getSnapshot().savedAt).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test('resets pending mutations when refresh invalidates their generation', async () => {
    const oldSave = deferred<Client>();
    const currentSave = deferred<Client>();
    const data = gateway({
      createClient: jest.fn().mockReturnValueOnce(oldSave.promise).mockReturnValueOnce(currentSave.promise),
    });
    const store = createOperationalDataStore(data);
    await store.setAuthenticatedUser('user-1');
    const stale = store.createClient({ name: 'Old', phone: '', email: '', notes: '', contractorUserId: '' });
    await store.refresh();
    const current = store.createClient({ name: 'Current', phone: '', email: '', notes: '', contractorUserId: '' });

    oldSave.resolve(client('old'));
    await expect(stale).rejects.toEqual(expect.objectContaining({ code: 'STALE_SCOPE' }));
    expect(store.getSnapshot().saving).toBe(true);
    currentSave.resolve(client('current'));
    await current;
    expect(store.getSnapshot().saving).toBe(false);
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

  test('loads authoritative jobs with their parent and field mappings and clears them on tenant reset', async () => {
    const data = gateway({
      listClients: jest.fn().mockResolvedValue([client('client-1')]),
      listProperties: jest.fn().mockResolvedValue([property('property-1', 'client-1')]),
      listFields: jest.fn().mockResolvedValue([field('field-1', 'property-1')]),
      listJobs: jest.fn().mockResolvedValue([job('job-1')]),
    });
    const store = createOperationalDataStore(data);
    await store.setAuthenticatedUser('user-1');
    expect(store.getSnapshot().jobs).toEqual([expect.objectContaining({ id: 'job-1', fieldIds: ['field-1'] })]);

    const resetting = store.setAuthenticatedUser('user-2');
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ jobs: [], operatingLocations: [], fieldBoundaryVersions: [] }));
    await resetting;
  });

  test('loads Planning missions only when their job and active operating location are authoritative', async () => {
    const store = createOperationalDataStore(gateway({
      listClients: jest.fn().mockResolvedValue([client('client-1')]),
      listProperties: jest.fn().mockResolvedValue([property('property-1', 'client-1')]),
      listFields: jest.fn().mockResolvedValue([field('field-1', 'property-1')]),
      listJobs: jest.fn().mockResolvedValue([job('job-1')]),
      listOperatingLocations: jest.fn().mockResolvedValue([location('location-1')]),
      listMissions: jest.fn().mockResolvedValue([mission('mission-1')]),
    } as any));
    await store.setAuthenticatedUser('user-1');
    expect(store.getSnapshot()).toEqual(expect.objectContaining({
      status: 'ready', missions: [expect.objectContaining({ id: 'mission-1', status: 'Planning' })],
    }));

    const invalidStore = createOperationalDataStore(gateway({
      listClients: jest.fn().mockResolvedValue([client('client-1')]),
      listProperties: jest.fn().mockResolvedValue([property('property-1', 'client-1')]),
      listFields: jest.fn().mockResolvedValue([field('field-1', 'property-1')]),
      listJobs: jest.fn().mockResolvedValue([job('job-1')]),
      listOperatingLocations: jest.fn().mockResolvedValue([location('location-1')]),
      listMissions: jest.fn().mockResolvedValue([mission('mission-2', { operatingLocationId: 'other-location' })]),
    } as any));
    await invalidStore.setAuthenticatedUser('user-1');
    expect(invalidStore.getSnapshot()).toEqual(expect.objectContaining({
      status: 'error', missions: [], error: expect.objectContaining({ code: 'MALFORMED_RESPONSE' }),
    }));
  });

  test('publishes create, update and archive mission changes only after server confirmation', async () => {
    const create = deferred<any>();
    const data = gateway({
      listClients: jest.fn().mockResolvedValue([client('client-1')]),
      listProperties: jest.fn().mockResolvedValue([property('property-1', 'client-1')]),
      listFields: jest.fn().mockResolvedValue([field('field-1', 'property-1')]),
      listJobs: jest.fn().mockResolvedValue([job('job-1')]),
      listOperatingLocations: jest.fn().mockResolvedValue([location('location-1')]),
      createMission: jest.fn().mockReturnValue(create.promise),
      updateMission: jest.fn().mockResolvedValue(mission('mission-1', { title: 'Confirmed edit', rowVersion: 2 })),
      archiveMission: jest.fn().mockResolvedValue(mission('mission-1', { rowVersion: 3 })),
    } as any);
    const store = createOperationalDataStore(data) as any;
    await store.setAuthenticatedUser('user-1');
    const pending = store.createMission({
      jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: 'MSN-001',
      title: 'Pending mission', description: '', status: 'Planning', scheduledStartAt: '2026-08-10T08:30:00Z',
    });
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ missions: [], saving: true, savedAt: null }));
    create.resolve(mission('mission-1', { title: 'Confirmed mission', rowVersion: 1 }));
    await pending;
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ missions: [expect.objectContaining({ title: 'Confirmed mission' })] }));

    await store.updateMission('mission-1', { title: 'Confirmed edit', status: 'Planning' });
    expect(data.updateMission).toHaveBeenCalledWith('mission-1', expect.objectContaining({ status: 'Planning' }), 1);
    expect(store.getSnapshot().missions[0]).toEqual(expect.objectContaining({ title: 'Confirmed edit', rowVersion: 2 }));

    await store.archiveMission('mission-1');
    expect(data.archiveMission).toHaveBeenCalledWith('mission-1', 2);
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ missions: [] }));
  });

  test('clears missions immediately across logout and tenant changes', async () => {
    const secondLoad = deferred<any[]>();
    const data = gateway({
      listClients: jest.fn().mockResolvedValue([]), listProperties: jest.fn().mockResolvedValue([]),
      listFields: jest.fn().mockResolvedValue([]), listJobs: jest.fn().mockResolvedValue([]),
      listOperatingLocations: jest.fn().mockResolvedValue([]),
      listMissions: jest.fn().mockResolvedValueOnce([]).mockReturnValueOnce(secondLoad.promise),
    } as any);
    const store = createOperationalDataStore(data) as any;
    await store.setAuthenticatedUser('user-1');
    const switching = store.setAuthenticatedUser('user-2');
    expect(store.getSnapshot().missions).toEqual([]);
    secondLoad.resolve([]);
    await switching;
    await store.setAuthenticatedUser(null);
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ status: 'idle', missions: [] }));
  });

  test('rejects a job whose server response does not match the loaded authoritative parent chain', async () => {
    const store = createOperationalDataStore(gateway({
      listClients: jest.fn().mockResolvedValue([client('client-1')]),
      listProperties: jest.fn().mockResolvedValue([property('property-1', 'client-1')]),
      listFields: jest.fn().mockResolvedValue([field('field-1', 'other-property')]),
      listJobs: jest.fn().mockResolvedValue([job('job-1')]),
    }));
    await store.setAuthenticatedUser('user-1');
    expect(store.getSnapshot()).toEqual(expect.objectContaining({ status: 'error', jobs: [], error: expect.objectContaining({ code: 'MALFORMED_RESPONSE' }) }));
  });

  test('publishes boundary geometry and the advanced field version only after server confirmation', async () => {
    const data = gateway({
      listClients: jest.fn().mockResolvedValue([client('client-1')]),
      listProperties: jest.fn().mockResolvedValue([property('property-1', 'client-1')]),
      listFields: jest.fn().mockResolvedValue([field('field-1', 'property-1')]),
      createFieldBoundaryVersion: jest.fn().mockResolvedValue({
        id: 'boundary-1', fieldId: 'field-1', propertyId: 'property-1', versionNumber: 1,
        boundaryGeojson: { type: 'Polygon', coordinates: [[[153, -27], [154, -27], [154, -28], [153, -27]]] },
        boundaryCoords: [[-27, 153], [-27, 154], [-28, 154]], fieldVersion: 2, rowVersion: 1,
        createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
      }),
    });
    const store = createOperationalDataStore(data);
    await store.setAuthenticatedUser('user-1');
    await store.createFieldBoundaryVersion('field-1', [[-27, 153], [-27, 154], [-28, 154]]);
    expect(store.getSnapshot().fields[0]).toEqual(expect.objectContaining({
      rowVersion: 2, fieldBoundaryVersionId: 'boundary-1', boundaryCoords: [[-27, 153], [-27, 154], [-28, 154]],
    }));
  });
});
