import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PartsFluidsWorkspace } from './PartsFluidsWorkspace';
import {
  TECHNICAL_FIXTURE_AS_OF,
  foreignTenantPreferences,
  ftf11Catalogue,
  ftf11Preferences,
  ftf11ServiceTemplate,
  gen003Catalogue,
  t100Catalogue,
} from './__fixtures__/technicalCatalogueFixtures';

function client(catalogue = ftf11Catalogue, preferences = ftf11Preferences) {
  return {
    resolveAssetRoute: jest.fn().mockImplementation((source: string, sourceRecordId: string) => Promise.resolve({ registryId: `registry-${sourceRecordId}`, source, sourceRecordId, identity: sourceRecordId })),
    lookupAsset: jest.fn().mockResolvedValue(catalogue),
    readPreferences: jest.fn().mockResolvedValue(preferences),
    readServiceTemplateVersion: jest.fn().mockResolvedValue(ftf11ServiceTemplate),
  };
}

function renderWorkspace(api = client(), sourceRecordId = 'source-ftf-11') {
  return render(
    <PartsFluidsWorkspace
      assetSource="fleet-asset"
      sourceRecordId={sourceRecordId}
      asOf={TECHNICAL_FIXTURE_AS_OF}
      api={api as any}
    />,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
}

describe('PartsFluidsWorkspace', () => {
  test('keeps a compact system index and expands exactly one technical section at a time', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    expect(await screen.findByRole('heading', { name: 'Parts & Fluids' })).toBeVisible();
    const engine = screen.getByRole('button', { name: /Engine · 4 specifications/ });
    const rearDifferential = screen.getByRole('button', { name: /Rear differential · 1 specification/ });
    expect(engine).toHaveAttribute('aria-expanded', 'false');
    expect(rearDifferential).toHaveAttribute('aria-expanded', 'false');
    expect(within(engine).getByText('3 parts · 1 fluid')).toBeVisible();
    expect(screen.queryByText('8-98037577-0')).not.toBeInTheDocument();

    await user.click(engine);
    expect(engine).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('region', { name: 'Technical requirement' })).getByText(/8-98037577-0/)).toBeVisible();
    await user.click(rearDifferential);
    expect(rearDifferential).toHaveAttribute('aria-expanded', 'true');
    expect(engine).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('8-98037577-0')).not.toBeInTheDocument();
    expect(screen.getByText('SAE 80W-90')).toBeVisible();
  });

  test('separates authoritative requirements from tenant-private preferences with exact authority and evidence', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole('button', { name: /Engine · 4 specifications/ }));

    const requirementLayer = screen.getByRole('region', { name: 'Technical requirement' });
    const preferenceLayer = screen.getByRole('region', { name: 'Our preference' });
    expect(within(requirementLayer).getAllByText('Manufacturer').length).toBeGreaterThan(0);
    expect(within(requirementLayer).getByText('Isuzu FSS550 workshop manual · LUB-01 · page 4-18')).toBeVisible();
    expect(within(requirementLayer).getByText('SAE 15W-40')).toBeVisible();
    expect(within(requirementLayer).getByText('API CK-4')).toBeVisible();
    expect(within(requirementLayer).getByText('12.8 L · Service fill')).toBeVisible();
    expect(within(preferenceLayer).getByText('Fleet Parts Toowoomba')).toBeVisible();
    expect(within(preferenceLayer).getByText('Delo 400 SLK')).toBeVisible();
    expect(within(preferenceLayer).getByText('20 L package')).toBeVisible();
    expect(within(requirementLayer).queryByText('Fleet Parts Toowoomba')).not.toBeInTheDocument();
  });

  test('answers FTF-11 filter and fluid questions without mounting another tenant preference response', async () => {
    const api = client();
    const user = userEvent.setup();
    renderWorkspace(api);
    await user.click(await screen.findByRole('button', { name: /Engine · 4 specifications/ }));
    const engineRequirements = screen.getByRole('region', { name: 'Technical requirement' });
    expect(within(engineRequirements).getByText(/8-98037577-0/)).toBeVisible();
    expect(within(engineRequirements).getByText(/8-98159412-0/)).toBeVisible();
    expect(within(engineRequirements).getByText(/8-98036654-0/)).toBeVisible();
    expect(within(engineRequirements).getByText('12.8 L · Service fill')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Rear differential · 1 specification/ }));
    expect(screen.getByText('SAE 80W-90')).toBeVisible();
    expect(screen.getByText('2.8 L · Service fill')).toBeVisible();
    expect(api.readPreferences).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Other Tenant Secret/)).not.toBeInTheDocument();
  });

  test('deep-links the authoritative GEN-003 attachment and its own fixture answers oil and filter questions', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWorkspace();
    const link = await screen.findByRole('link', { name: /GEN-003 · Service information/ });
    expect(link).toHaveAttribute('href', '/assets/fleet-asset/source-gen-003/parts-fluids');
    unmount();

    renderWorkspace(client(gen003Catalogue, { parts: [], fluids: [] }), 'source-gen-003');
    await user.click(await screen.findByRole('button', { name: /Engine · 2 specifications/ }));
    expect(screen.getByText('SAE 10W-30')).toBeVisible();
    expect(screen.getByText('1.1 L · Refill after filter replacement')).toBeVisible();
    expect(screen.getByText(/15400-RTA-003/)).toBeVisible();
  });

  test('shows versioned Service Kits progressively and distinguishes manufacturer from organisation authority', async () => {
    const api = client();
    const user = userEvent.setup();
    renderWorkspace(api);

    expect(await screen.findByRole('heading', { name: 'Service Kits' })).toBeVisible();
    const manufacturerKit = screen.getByRole('button', { name: /FSS550 — 10,000 km service · Manufacturer/ });
    const organisationKit = screen.getByRole('button', { name: /Fly The Farm vehicle arrival check · Organisation standard/ });
    expect(manufacturerKit).toHaveAttribute('aria-expanded', 'false');
    expect(organisationKit).toHaveAttribute('aria-expanded', 'false');

    await user.click(manufacturerKit);
    expect(api.readServiceTemplateVersion).toHaveBeenCalledWith('registry-source-ftf-11', 'template-version-ftf11-10k-v3', TECHNICAL_FIXTURE_AS_OF);
    expect(await screen.findByText('Version 3 · Effective')).toBeVisible();
    expect(screen.getByText('Isuzu FSS550 maintenance schedule · SVC-10K · page 3-02')).toBeVisible();
    expect(screen.getByText(/Change engine oil/)).toBeVisible();
    expect(screen.getByText(/Inspect air filter/)).toBeVisible();
    expect(screen.getByText(/Inspect drive belts/)).toBeVisible();
    expect(screen.getByText(/12.8 L · Required/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Applicability' })).toBeVisible();
    expect(screen.getByText('Isuzu · FSS550 · Engine')).toBeVisible();
    expect(screen.getByText('Isuzu FSS550 maintenance schedule · SVC-10K-SCOPE · page 3-01')).toBeVisible();
    expect(screen.getByText('Replace only when the restriction indicator is red.')).toBeVisible();
    expect(screen.getByText('Air filter inspection record · AIR-FILTER-CHECK · page 1')).toBeVisible();
    expect(screen.getByText('Use the current approved equivalent only.')).toBeVisible();
    expect(screen.getByText('Photo required')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Requirement links' })).toBeVisible();
    expect(screen.getByText('maintenance-requirement-fss550-10k-v2')).toBeVisible();
    expect(screen.getByText('Reference only; scheduling remains authoritative elsewhere.')).toBeVisible();
    expect(screen.getByText(/links this recipe to an authoritative maintenance requirement version; it does not schedule or decide when work is due/i)).toBeVisible();
  });

  test('does not let a stale catalogue request from asset A overwrite asset B', async () => {
    const staleCatalogue = deferred<typeof ftf11Catalogue>();
    const api = client();
    api.lookupAsset.mockImplementation((registryId: string) => registryId === 'registry-source-a' ? staleCatalogue.promise : Promise.resolve(t100Catalogue));
    api.readPreferences.mockResolvedValue({ parts: [], fluids: [] });
    const view = render(
      <PartsFluidsWorkspace assetSource="fleet-asset" sourceRecordId="source-a" asOf={TECHNICAL_FIXTURE_AS_OF} api={api as any} />,
    );
    await waitFor(() => expect(api.lookupAsset).toHaveBeenCalledWith('registry-source-a', TECHNICAL_FIXTURE_AS_OF));

    view.rerender(
      <PartsFluidsWorkspace assetSource="aircraft" sourceRecordId="source-b" asOf={TECHNICAL_FIXTURE_AS_OF} api={api as any} />,
    );
    expect(await screen.findByRole('button', { name: /Propulsion · 3 specifications/ })).toBeVisible();
    await act(async () => { staleCatalogue.resolve(ftf11Catalogue); await staleCatalogue.promise; });
    await waitFor(() => expect(screen.getByRole('button', { name: /Propulsion · 3 specifications/ })).toBeVisible());
    expect(screen.queryByRole('button', { name: /Engine · 4 specifications/ })).not.toBeInTheDocument();
  });

  test('clears and rejects a stale Service Kit aggregate when the asset scope changes', async () => {
    const staleKit = deferred<typeof ftf11ServiceTemplate>();
    const assetBKit = {
      ...ftf11ServiceTemplate,
      version: { ...ftf11ServiceTemplate.version, description: 'Asset B service recipe.' },
      actions: [{ ...ftf11ServiceTemplate.actions[0], description: 'Asset B-only service action' }],
    };
    const api = client();
    api.readServiceTemplateVersion
      .mockImplementationOnce(() => staleKit.promise)
      .mockResolvedValueOnce(assetBKit);
    const user = userEvent.setup();
    const view = render(
      <PartsFluidsWorkspace assetSource="fleet-asset" sourceRecordId="source-a" asOf={TECHNICAL_FIXTURE_AS_OF} api={api as any} view="service-kits" />,
    );
    await user.click(await screen.findByRole('button', { name: /FSS550 — 10,000 km service · Manufacturer/ }));
    await waitFor(() => expect(api.readServiceTemplateVersion).toHaveBeenCalledTimes(1));

    view.rerender(
      <PartsFluidsWorkspace assetSource="fleet-asset" sourceRecordId="source-b" asOf={TECHNICAL_FIXTURE_AS_OF} api={api as any} view="service-kits" />,
    );
    const assetBButton = await screen.findByRole('button', { name: /FSS550 — 10,000 km service · Manufacturer/ });
    await waitFor(() => expect(assetBButton).toHaveAttribute('aria-expanded', 'false'));
    await act(async () => { staleKit.resolve(ftf11ServiceTemplate); await staleKit.promise; });
    await user.click(assetBButton);
    expect(await screen.findByText('Asset B-only service action · Required')).toBeVisible();
    expect(screen.queryByText('Change engine oil · Required')).not.toBeInTheDocument();
    expect(api.readServiceTemplateVersion).toHaveBeenCalledTimes(2);
  });

  test('keeps a failed Service Kit closed to invented detail and retries only its authoritative aggregate', async () => {
    const api = client();
    api.readServiceTemplateVersion.mockRejectedValueOnce(new Error('Service Kit could not be loaded.'));
    const user = userEvent.setup();
    renderWorkspace(api);
    await user.click(await screen.findByRole('button', { name: /FSS550 — 10,000 km service · Manufacturer/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Service Kit could not be loaded.');
    expect(screen.queryByText('Change engine oil')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry Service Kit' }));
    expect(await screen.findByText(/Change engine oil/)).toBeVisible();
    expect(api.readServiceTemplateVersion).toHaveBeenCalledTimes(2);
  });

  test('supports T100 model positions and canonical blade, bolt and shim applicability without components', async () => {
    const user = userEvent.setup();
    renderWorkspace(client(t100Catalogue, { parts: [], fluids: [] }), 'source-t100');
    await user.click(await screen.findByRole('button', { name: /Propulsion · 3 specifications/ }));
    expect(screen.getAllByText('Motor 1').length).toBeGreaterThan(0);
    expect(screen.getByText('CW blade')).toBeVisible();
    expect(screen.getByText(/WB37-014/)).toBeVisible();
    expect(screen.getByText('Propeller shim')).toBeVisible();
    expect(screen.getByRole('button', { name: /DJI T100 — 50 h propulsion inspection · Manufacturer/ })).toBeVisible();
    expect(screen.queryByText(/tracked component/i)).not.toBeInTheDocument();
  });

  test('announces loading, fails closed on error and retries the authoritative reads', async () => {
    const api = client();
    api.lookupAsset.mockRejectedValueOnce(new Error('Technical catalogue could not be loaded.'));
    const user = userEvent.setup();
    renderWorkspace(api);

    expect(screen.getByRole('status')).toHaveTextContent('Loading authoritative technical information');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Technical catalogue could not be loaded.');
    expect(screen.queryByText('FTF-FLT-001')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /Engine · 4 specifications/ })).toBeVisible();
    expect(api.lookupAsset).toHaveBeenCalledTimes(2);
  });

  test('fails the whole preference layer instead of displaying stale or partial private data', async () => {
    const api = client(ftf11Catalogue, foreignTenantPreferences);
    api.readPreferences.mockRejectedValue(new Error('Technical preferences could not be loaded.'));
    renderWorkspace(api);
    expect(await screen.findByRole('alert')).toHaveTextContent('Technical preferences could not be loaded.');
    expect(screen.queryByText('Other Tenant Secret Supplier')).not.toBeInTheDocument();
    await waitFor(() => expect(api.lookupAsset).toHaveBeenCalledTimes(1));
  });
});
