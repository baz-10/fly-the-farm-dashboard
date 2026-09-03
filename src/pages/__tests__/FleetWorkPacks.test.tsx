import { render, screen } from '@testing-library/react';
import FleetWorkPacks from '../FleetWorkPacks';

let mockPermissions: string[] = [];
let mockTenantId = 'organisation-1';
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1', tenantId: mockTenantId, role: 'contractor', permissions: mockPermissions } }) }));
jest.mock('../../contexts/AircraftContext', () => ({ useAircraft: () => ({ aircraft: [], equipmentKits: [] }) }));
jest.mock('../../contexts/OperationalDataContext', () => ({ useOperationalData: () => ({ operatingLocations: [{ id: 'base-1', name: 'Base One' }], status: 'ready' }) }));
jest.mock('../../contexts/WorkPackContext', () => ({ useWorkPacks: () => ({ templates: [], createTemplate: jest.fn(), updateTemplate: jest.fn(), duplicateTemplate: jest.fn() }) }));
jest.mock('../../contexts/FleetAssetContext', () => ({ useFleetAssets: () => ({
  assets: [{ id: 'asset-1', operatingLocationId: 'base-1', assetType: 'generator', assetIdentifier: 'GEN-001', status: 'available', notes: '', rowVersion: 1, createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z' }],
  loading: false, error: undefined, createAsset: jest.fn(), updateAsset: jest.fn(), archiveAsset: jest.fn(), reload: jest.fn(),
}) }));
jest.mock('../../components/maintenance/FleetMaintenanceSummary', () => ({ FleetMaintenanceSummary: ({ asOf, bases }: { asOf: string; bases: Array<{ id: string; name: string }> }) => <div data-testid="fleet-maintenance" data-as-of={asOf}>{bases.map((base) => base.name).join(', ')}</div> }));

beforeEach(() => {
  mockPermissions = [];
  mockTenantId = 'organisation-1';
});

test('a read-only operator sees Fleet records without mutation controls', () => {
  mockPermissions = ['fleet_assets.read'];
  render(<FleetWorkPacks />);
  expect(screen.getByText('GEN-001')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Add Fleet asset' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit GEN-001' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Archive GEN-001' })).not.toBeInTheDocument();
});

test('Fleet controls follow independent create, update and archive permissions', () => {
  mockPermissions = ['fleet_assets.read', 'fleet_assets.create', 'fleet_assets.update'];
  render(<FleetWorkPacks />);
  expect(screen.getByRole('button', { name: 'Add Fleet asset' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Edit GEN-001' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Archive GEN-001' })).not.toBeInTheDocument();
});

test('mounts compact Fleet maintenance only for the independent read permission', () => {
  mockPermissions = ['fleet_assets.read'];
  const view = render(<FleetWorkPacks />);
  expect(screen.queryByTestId('fleet-maintenance')).not.toBeInTheDocument();
  mockPermissions = ['fleet_assets.read', 'maintenance_requirements.read'];
  view.rerender(<FleetWorkPacks />);
  expect(screen.getByTestId('fleet-maintenance')).toHaveTextContent('Base One');
});

test('keeps one Fleet maintenance instant for the session scope and resets it for organisation scope', () => {
  jest.useFakeTimers();
  try {
    mockPermissions = ['fleet_assets.read', 'maintenance_requirements.read'];
    jest.setSystemTime(new Date('2026-08-21T01:00:00.000Z'));
    const view = render(<FleetWorkPacks />);
    expect(screen.getByTestId('fleet-maintenance')).toHaveAttribute('data-as-of', '2026-08-21T01:00:00.000Z');
    jest.setSystemTime(new Date('2026-08-21T02:00:00.000Z'));
    view.rerender(<FleetWorkPacks />);
    expect(screen.getByTestId('fleet-maintenance')).toHaveAttribute('data-as-of', '2026-08-21T01:00:00.000Z');
    mockTenantId = 'organisation-2';
    view.rerender(<FleetWorkPacks />);
    expect(screen.getByTestId('fleet-maintenance')).toHaveAttribute('data-as-of', '2026-08-21T02:00:00.000Z');
  } finally {
    jest.useRealTimers();
  }
});
