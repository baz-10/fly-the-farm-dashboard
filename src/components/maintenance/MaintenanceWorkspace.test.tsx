import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { normalizeMaintenanceDueResult } from '../../domain/maintenance/dueState';
import { MaintenanceWorkspace } from './MaintenanceWorkspace';
import {
  FTF11_REGISTRY_ID,
  MAINTENANCE_FIXTURE_AS_OF,
  ftf11CalendarControlsDueState,
  ftf11DueState,
  gen003DueState,
  maintenanceFixtureRoutes,
  t100DueState,
} from './__fixtures__/maintenanceDueFixtures';

const client = (dueState = ftf11DueState) => ({
  resolveAssetRoute: jest.fn().mockResolvedValue(maintenanceFixtureRoutes['source-ftf-11']),
  readDueState: jest.fn().mockResolvedValue(dueState),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
}

function renderWorkspace(api = client(), sourceRecordId = 'source-ftf-11') {
  return render(
    <MaintenanceWorkspace
      assetSource="fleet-asset"
      sourceRecordId={sourceRecordId}
      asOf={MAINTENANCE_FIXTURE_AS_OF}
      routeApi={api}
      api={api}
    />,
  );
}

describe('MaintenanceWorkspace', () => {
  test.each([ftf11DueState, gen003DueState, t100DueState])('keeps browser fixtures inside the production due-state boundary', (fixture) => {
    expect(normalizeMaintenanceDueResult(fixture)).toEqual(fixture);
  });

  test('keeps authoritative states compact and opens one group and requirement at a time', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    expect(await screen.findByRole('heading', { name: 'Maintenance' })).toBeVisible();
    const dueNow = screen.getByRole('button', { name: /Due now · 2 requirements/ });
    const dueSoon = screen.getByRole('button', { name: /Due soon · 1 requirement/ });
    const current = screen.getByRole('button', { name: /Current · 1 requirement/ });
    const attention = screen.getByRole('button', { name: /Needs attention · 1 requirement/ });
    expect(dueNow).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Brake system inspection')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upcoming/i })).not.toBeInTheDocument();

    await user.click(dueNow);
    expect(dueNow).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Brake system inspection · Due$/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Pump calibration · Overdue$/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Pump calibration · Overdue$/ }));
    expect(screen.getByRole('region', { name: 'Pump calibration details' })).toBeVisible();

    await user.click(dueSoon);
    expect(dueSoon).toHaveAttribute('aria-expanded', 'true');
    expect(dueNow).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Brake system inspection')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pump calibration details' })).not.toBeInTheDocument();
    expect(current).toHaveAttribute('aria-expanded', 'false');
    expect(attention).toHaveAttribute('aria-expanded', 'false');
  });

  test('explains controlling evidence and keeps authority and optional Service Kits distinct', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole('button', { name: /Due soon · 1 requirement/ }));
    await user.click(screen.getByRole('button', { name: /10,000 km service · Due soon/ }));

    const detail = screen.getByRole('region', { name: '10,000 km service details' });
    expect(within(detail).getByRole('heading', { name: 'Due in 1,420 km' })).toBeVisible();
    expect(within(detail).getByText('Organisation standard')).toBeVisible();
    expect(within(detail).getByText('Odometer')).toBeVisible();
    expect(within(detail).getByText('8,580 km')).toBeVisible();
    expect(within(detail).getByText('10,000 km')).toBeVisible();
    expect(within(detail).getByText('1,500 km')).toBeVisible();
    expect(within(detail).getByText('Fly The Farm maintenance standard')).toBeVisible();
    expect(within(detail).getByRole('link', { name: 'Open linked Service Kit' })).toHaveAttribute('href', '/assets/fleet-asset/source-ftf-11/service-kits');

    await user.click(screen.getByRole('button', { name: /Current · 1 requirement/ }));
    await user.click(screen.getByRole('button', { name: /Annual body inspection · Current/ }));
    const currentDetail = screen.getByRole('region', { name: 'Annual body inspection details' });
    expect(within(currentDetail).getByText('Manufacturer requirement')).toBeVisible();
    expect(within(currentDetail).getByText('No Service Kit linked')).toBeVisible();
  });

  test('shows attached equipment attention separately without contaminating parent group counts', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const dueSoon = await screen.findByRole('button', { name: /Due soon · 1 requirement/ });
    expect(dueSoon).toBeVisible();
    const attached = screen.getByRole('region', { name: 'Attached equipment maintenance' });
    expect(within(attached).getByText('Attached equipment requires attention')).toBeVisible();
    expect(within(attached).getByText('GEN-003 500 h service')).toBeVisible();
    expect(within(attached).getByText('Due soon')).toBeVisible();

    await user.click(dueSoon);
    expect(within(screen.getByRole('region', { name: 'Due soon requirements' })).queryByText('GEN-003 500 h service')).not.toBeInTheDocument();
  });

  test('preserves aircraft-compatible hours and visually distinguishes organisation from manufacturer authority', async () => {
    const api = client(t100DueState);
    api.resolveAssetRoute.mockResolvedValue(maintenanceFixtureRoutes['source-t100-002']);
    const user = userEvent.setup();
    render(
      <MaintenanceWorkspace assetSource="aircraft" sourceRecordId="source-t100-002" asOf={MAINTENANCE_FIXTURE_AS_OF} routeApi={api} api={api} />,
    );

    await user.click(await screen.findByRole('button', { name: /Due soon · 1 requirement/ }));
    await user.click(screen.getByRole('button', { name: /50 h propulsion inspection · Due soon/ }));
    const organisation = screen.getByRole('region', { name: '50 h propulsion inspection details' });
    expect(within(organisation).getByText('46.3 h')).toBeVisible();
    expect(within(organisation).getByText('50 h')).toBeVisible();
    expect(within(organisation).getByRole('heading', { name: 'Due in 3.7 h' })).toBeVisible();
    expect(within(organisation).getByText('Organisation standard')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Current · 1 requirement/ }));
    await user.click(screen.getByRole('button', { name: /DJI 100 h service · Current/ }));
    expect(within(screen.getByRole('region', { name: 'DJI 100 h service details' })).getByText('Manufacturer requirement')).toBeVisible();
  });

  test('renders the authoritative controlling-threshold change without comparing thresholds in the browser', async () => {
    const user = userEvent.setup();
    renderWorkspace(client(ftf11CalendarControlsDueState));
    await user.click(await screen.findByRole('button', { name: /Due soon · 1 requirement/ }));
    await user.click(screen.getByRole('button', { name: /10,000 km service · Due soon/ }));
    const detail = screen.getByRole('region', { name: '10,000 km service details' });
    expect(within(detail).getByText('Calendar')).toBeVisible();
    expect(within(detail).getByRole('heading', { name: 'Due in 20 days' })).toBeVisible();
    expect(within(detail).getByText('10 Sept 2026')).toBeVisible();
  });

  test('announces loading, fails closed, retries exact route resolution and supports an honest empty result', async () => {
    const pending = deferred<typeof ftf11DueState>();
    const api = client();
    api.readDueState.mockImplementationOnce(() => pending.promise).mockRejectedValueOnce(new Error('Maintenance projection could not be loaded.')).mockResolvedValueOnce({
      ...ftf11DueState,
      requirements: [],
      attachedAssetSummaries: [],
    });
    const user = userEvent.setup();
    renderWorkspace(api);
    expect(screen.getByRole('status')).toHaveTextContent('Loading authoritative maintenance');
    pending.reject(new Error('Maintenance projection could not be loaded.'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Maintenance projection could not be loaded.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Maintenance projection could not be loaded.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No maintenance requirements apply at this time.')).toBeVisible();
    expect(api.resolveAssetRoute).toHaveBeenCalledWith('fleet-asset', 'source-ftf-11');
    expect(api.readDueState).toHaveBeenCalledWith(FTF11_REGISTRY_ID, MAINTENANCE_FIXTURE_AS_OF);
  });

  test('discards a stale asset response and exposes no availability or serviceability controls', async () => {
    const user = userEvent.setup();
    const stale = deferred<typeof ftf11DueState>();
    const api = client(t100DueState);
    api.resolveAssetRoute.mockImplementation((_source: string, sourceRecordId: string) => Promise.resolve(maintenanceFixtureRoutes[sourceRecordId]));
    api.readDueState.mockImplementation((registryId: string) => registryId === FTF11_REGISTRY_ID ? stale.promise : Promise.resolve(t100DueState));
    const view = renderWorkspace(api);
    view.rerender(
      <MaintenanceWorkspace assetSource="aircraft" sourceRecordId="source-t100-002" asOf={MAINTENANCE_FIXTURE_AS_OF} routeApi={api} api={api} />,
    );
    await user.click(await screen.findByRole('button', { name: /Due soon · 1 requirement/ }));
    expect(screen.getByRole('button', { name: /50 h propulsion inspection · Due soon/ })).toBeVisible();
    stale.resolve(ftf11DueState);
    await waitFor(() => expect(screen.queryByText('Pump calibration')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /ground|serviceability|availability|mission ready/i })).not.toBeInTheDocument();
  });

  test('never commits a resolved asset under a new asset and asOf scope before the next projection resolves', async () => {
    const next = deferred<typeof t100DueState>();
    const api = client();
    api.resolveAssetRoute.mockImplementation((_source: string, sourceRecordId: string) => Promise.resolve(maintenanceFixtureRoutes[sourceRecordId]));
    api.readDueState.mockImplementation((registryId: string) => registryId === FTF11_REGISTRY_ID
      ? Promise.resolve(ftf11DueState)
      : next.promise);
    const commits: string[] = [];
    const view = render(
      <React.Profiler id="maintenance-scope" onRender={() => { commits.push(document.body.textContent || ''); }}>
        <MaintenanceWorkspace assetSource="fleet-asset" sourceRecordId="source-ftf-11" asOf={MAINTENANCE_FIXTURE_AS_OF} routeApi={api} api={api} />
      </React.Profiler>,
    );
    expect(await screen.findByText('GEN-003 500 h service')).toBeVisible();

    commits.length = 0;
    view.rerender(
      <React.Profiler id="maintenance-scope" onRender={() => { commits.push(document.body.textContent || ''); }}>
        <MaintenanceWorkspace assetSource="aircraft" sourceRecordId="source-t100-002" asOf="2026-08-21T01:31:00.000Z" routeApi={api} api={api} />
      </React.Profiler>,
    );

    expect(commits.some((text) => text.includes('GEN-003 500 h service'))).toBe(false);
    expect(screen.queryByText('GEN-003 500 h service')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading authoritative maintenance');
    next.resolve(t100DueState);
    expect(await screen.findByRole('button', { name: /Due soon · 1 requirement/ })).toBeVisible();
  });

  test('never commits resolved data under a new authenticated authority scope at the same route instant', async () => {
    const next = deferred<typeof ftf11DueState>();
    const api = client();
    api.readDueState.mockResolvedValueOnce(ftf11DueState).mockImplementation(() => next.promise);
    const commits: string[] = [];
    const view = render(
      <React.Profiler id="maintenance-session-scope" onRender={() => { commits.push(document.body.textContent || ''); }}>
        <MaintenanceWorkspace authorityScopeKey="session-a" assetSource="fleet-asset" sourceRecordId="source-ftf-11" asOf={MAINTENANCE_FIXTURE_AS_OF} routeApi={api} api={api} />
      </React.Profiler>,
    );
    expect(await screen.findByText('GEN-003 500 h service')).toBeVisible();

    commits.length = 0;
    view.rerender(
      <React.Profiler id="maintenance-session-scope" onRender={() => { commits.push(document.body.textContent || ''); }}>
        <MaintenanceWorkspace authorityScopeKey="session-b" assetSource="fleet-asset" sourceRecordId="source-ftf-11" asOf={MAINTENANCE_FIXTURE_AS_OF} routeApi={api} api={api} />
      </React.Profiler>,
    );

    expect(commits.some((text) => text.includes('GEN-003 500 h service'))).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('Loading authoritative maintenance');
    next.resolve(ftf11DueState);
    expect(await screen.findByText('GEN-003 500 h service')).toBeVisible();
  });
});
