import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FleetMaintenanceSummary } from './FleetMaintenanceSummary';
import {
  MAINTENANCE_FIXTURE_AS_OF,
  MAINTENANCE_FIXTURE_BASE_ID,
  fleetMaintenancePageOne,
  fleetMaintenancePageTwo,
} from './__fixtures__/maintenanceDueFixtures';

const client = () => ({ readFleetDueSummary: jest.fn().mockResolvedValue(fleetMaintenancePageOne) });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
}

const bases = [
  { id: MAINTENANCE_FIXTURE_BASE_ID, name: 'Toowoomba Base' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Dalby Base' },
];

describe('FleetMaintenanceSummary', () => {
  test('renders a compact card summary with authoritative deep links and no giant table', async () => {
    render(<FleetMaintenanceSummary asOf={MAINTENANCE_FIXTURE_AS_OF} bases={bases} api={client()} pageSize={2} />);

    expect(screen.getByRole('heading', { name: 'Fleet maintenance' })).toBeVisible();
    const list = await screen.findByRole('list', { name: 'Fleet maintenance results' });
    expect(within(list).getByRole('link', { name: /FTF-11 maintenance/ })).toHaveAttribute('href', '/assets/fleet-asset/source-ftf-11/maintenance');
    expect(within(list).getByText('Overdue')).toBeVisible();
    expect(within(list).getByText(/1 attached asset/)).toBeVisible();
    expect(within(list).getByRole('link', { name: /GEN-003 maintenance/ })).toHaveAttribute('href', '/assets/fleet-asset/source-gen-003/maintenance');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/threshold|baseline evidence|requirement version/i)).not.toBeInTheDocument();
  });

  test('sends exact Base, asset type and maintenance state filters without merging due states', async () => {
    const api = client();
    api.readFleetDueSummary.mockImplementation((_asOf, filters) => Promise.resolve({
      ...fleetMaintenancePageOne,
      filters: {
        baseId: filters.baseId ?? null,
        assetType: filters.assetType ?? null,
        state: filters.state ?? null,
      },
      page: { ...fleetMaintenancePageOne.page, hasMore: false, nextCursor: null },
    }));
    const user = userEvent.setup();
    render(<FleetMaintenanceSummary asOf={MAINTENANCE_FIXTURE_AS_OF} bases={bases} api={api} pageSize={2} />);
    await screen.findByText('FTF-11');

    await user.click(screen.getByLabelText('Base'));
    await user.click(screen.getByRole('option', { name: 'Toowoomba Base' }));
    await waitFor(() => expect(api.readFleetDueSummary).toHaveBeenLastCalledWith(MAINTENANCE_FIXTURE_AS_OF, {
      baseId: MAINTENANCE_FIXTURE_BASE_ID,
      pageSize: 2,
    }));

    await user.click(screen.getByLabelText('Asset type'));
    await user.click(screen.getByRole('option', { name: 'Aircraft' }));
    await waitFor(() => expect(api.readFleetDueSummary).toHaveBeenLastCalledWith(MAINTENANCE_FIXTURE_AS_OF, {
      baseId: MAINTENANCE_FIXTURE_BASE_ID,
      assetType: 'aircraft',
      pageSize: 2,
    }));

    await user.click(screen.getByLabelText('Maintenance status'));
    await user.click(screen.getByRole('option', { name: 'Overdue' }));
    await waitFor(() => expect(api.readFleetDueSummary).toHaveBeenLastCalledWith(MAINTENANCE_FIXTURE_AS_OF, {
      baseId: MAINTENANCE_FIXTURE_BASE_ID,
      assetType: 'aircraft',
      state: 'OVERDUE',
      pageSize: 2,
    }));
    expect(screen.queryByRole('option', { name: 'Due now' })).not.toBeInTheDocument();
  });

  test('uses the opaque next cursor to append a bounded page', async () => {
    const api = client();
    api.readFleetDueSummary.mockResolvedValueOnce(fleetMaintenancePageOne).mockResolvedValueOnce(fleetMaintenancePageTwo);
    const user = userEvent.setup();
    render(<FleetMaintenanceSummary asOf={MAINTENANCE_FIXTURE_AS_OF} bases={bases} api={api} pageSize={2} />);
    await screen.findByText('FTF-11');
    await user.click(screen.getByRole('button', { name: 'Load more assets' }));

    expect(await screen.findByText('T100-002')).toBeVisible();
    expect(screen.getByText('FTF-11')).toBeVisible();
    expect(api.readFleetDueSummary).toHaveBeenLastCalledWith(MAINTENANCE_FIXTURE_AS_OF, {
      cursor: 'eyJ2IjoxfQ',
      pageSize: 2,
    });
    expect(screen.queryByRole('button', { name: 'Load more assets' })).not.toBeInTheDocument();
  });

  test('announces loading, fails closed, retries and presents an honest empty filter result', async () => {
    const pending = deferred<typeof fleetMaintenancePageOne>();
    const api = client();
    api.readFleetDueSummary
      .mockImplementationOnce(() => pending.promise)
      .mockRejectedValueOnce(new Error('Fleet maintenance could not be loaded.'))
      .mockResolvedValueOnce({
        ...fleetMaintenancePageOne,
        pageCounts: { CURRENT: 0, DUE_SOON: 0, DUE: 0, OVERDUE: 0, INSUFFICIENT_DATA: 0 },
        page: { pageSize: 2, hasMore: false, nextCursor: null, scannedCount: 0, returnedCount: 0 },
        rows: [],
      });
    const user = userEvent.setup();
    render(<FleetMaintenanceSummary asOf={MAINTENANCE_FIXTURE_AS_OF} bases={bases} api={api} pageSize={2} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading Fleet maintenance');
    pending.reject(new Error('Fleet maintenance could not be loaded.'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Fleet maintenance could not be loaded.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Fleet maintenance could not be loaded.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No assets match these maintenance filters.')).toBeVisible();
  });

  test('discards a stale page when filters change', async () => {
    const stale = deferred<typeof fleetMaintenancePageOne>();
    const api = client();
    api.readFleetDueSummary.mockImplementation((_asOf, filters) => {
      if (!filters.state) return stale.promise;
      return Promise.resolve({
        ...fleetMaintenancePageTwo,
        filters: { baseId: null, assetType: null, state: 'DUE_SOON' },
      });
    });
    const user = userEvent.setup();
    render(<FleetMaintenanceSummary asOf={MAINTENANCE_FIXTURE_AS_OF} bases={bases} api={api} pageSize={2} />);
    await user.click(screen.getByLabelText('Maintenance status'));
    await user.click(screen.getByRole('option', { name: 'Due soon' }));
    expect(await screen.findByText('T100-002')).toBeVisible();
    stale.resolve(fleetMaintenancePageOne);
    await waitFor(() => expect(screen.queryByText('FTF-11')).not.toBeInTheDocument());
  });

  test('never commits resolved rows under a new asOf scope before its page resolves', async () => {
    const next = deferred<typeof fleetMaintenancePageTwo>();
    const api = client();
    api.readFleetDueSummary.mockImplementation((asOf) => asOf === MAINTENANCE_FIXTURE_AS_OF
      ? Promise.resolve(fleetMaintenancePageOne)
      : next.promise);
    const commits: string[] = [];
    const view = render(
      <React.Profiler id="fleet-as-of-scope" onRender={() => { commits.push(document.body.textContent || ''); }}>
        <FleetMaintenanceSummary asOf={MAINTENANCE_FIXTURE_AS_OF} bases={bases} api={api} pageSize={2} />
      </React.Profiler>,
    );
    expect(await screen.findByText('FTF-11')).toBeVisible();

    commits.length = 0;
    view.rerender(
      <React.Profiler id="fleet-as-of-scope" onRender={() => { commits.push(document.body.textContent || ''); }}>
        <FleetMaintenanceSummary asOf="2026-08-21T02:30:00.000Z" bases={bases} api={api} pageSize={2} />
      </React.Profiler>,
    );

    expect(commits.some((text) => text.includes('FTF-11'))).toBe(false);
    expect(screen.queryByText('FTF-11')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading Fleet maintenance');
    next.resolve(fleetMaintenancePageTwo);
    expect(await screen.findByText('T100-002')).toBeVisible();
  });

  test('never commits resolved rows under a new authenticated authority scope at the same instant', async () => {
    const next = deferred<typeof fleetMaintenancePageTwo>();
    const api = client();
    api.readFleetDueSummary.mockResolvedValueOnce(fleetMaintenancePageOne).mockImplementation(() => next.promise);
    const commits: string[] = [];
    const view = render(
      <React.Profiler id="fleet-session-scope" onRender={() => { commits.push(document.body.textContent || ''); }}>
        <FleetMaintenanceSummary authorityScopeKey="session-a" asOf={MAINTENANCE_FIXTURE_AS_OF} bases={bases} api={api} pageSize={2} />
      </React.Profiler>,
    );
    expect(await screen.findByText('FTF-11')).toBeVisible();

    commits.length = 0;
    view.rerender(
      <React.Profiler id="fleet-session-scope" onRender={() => { commits.push(document.body.textContent || ''); }}>
        <FleetMaintenanceSummary authorityScopeKey="session-b" asOf={MAINTENANCE_FIXTURE_AS_OF} bases={bases} api={api} pageSize={2} />
      </React.Profiler>,
    );

    expect(commits.some((text) => text.includes('FTF-11'))).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('Loading Fleet maintenance');
    next.resolve(fleetMaintenancePageTwo);
    expect(await screen.findByText('T100-002')).toBeVisible();
  });

  test('never commits resolved rows under a newly selected filter before its page resolves', async () => {
    const filtered = deferred<typeof fleetMaintenancePageTwo>();
    const api = client();
    api.readFleetDueSummary.mockImplementation((_asOf, filters) => filters.state === 'DUE_SOON'
      ? filtered.promise
      : Promise.resolve(fleetMaintenancePageOne));
    const commits: Array<{ filter: string; text: string }> = [];
    const user = userEvent.setup();
    render(
      <React.Profiler id="fleet-filter-scope" onRender={() => {
        const label = Array.from(document.querySelectorAll('label'))
          .find((candidate) => candidate.textContent === 'Maintenance status');
        commits.push({
          filter: label instanceof HTMLLabelElement
            ? document.getElementById(label.htmlFor)?.textContent || ''
            : '',
          text: document.body.textContent || '',
        });
      }}>
        <FleetMaintenanceSummary asOf={MAINTENANCE_FIXTURE_AS_OF} bases={bases} api={api} pageSize={2} />
      </React.Profiler>,
    );
    expect(await screen.findByText('FTF-11')).toBeVisible();
    await user.click(screen.getByLabelText('Maintenance status'));

    commits.length = 0;
    await user.click(screen.getByRole('option', { name: 'Due soon' }));

    expect(commits.some(({ filter, text }) => filter.includes('Due soon') && text.includes('FTF-11'))).toBe(false);
    expect(screen.queryByText('FTF-11')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading Fleet maintenance');
    filtered.resolve(fleetMaintenancePageTwo);
    expect(await screen.findByText('T100-002')).toBeVisible();
  });
});
