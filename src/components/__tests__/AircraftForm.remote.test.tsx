import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AircraftForm, { reconcileNativeAircraftDates } from '../AircraftForm';
import { AircraftApiError } from '../../services/aircraftApi';

const locationOne = { id: '33333333-3333-4333-8333-333333333333', name: 'Dalby Base' };
const locationTwo = { id: '44444444-4444-4444-8444-444444444444', name: 'Emerald Base' };
const mockCreateAircraft = jest.fn();
let mockAircraftError: string | null = null;
let mockOperationalState: {
  mode: 'remote';
  status: 'loading' | 'ready';
  operatingLocations: Array<{ id: string; name: string }>;
  operatingLocationIds: string[];
};

jest.mock('../../contexts/AircraftContext', () => ({
  useAircraft: () => ({ createAircraft: mockCreateAircraft, updateAircraft: jest.fn(), getAircraftById: jest.fn(), error: mockAircraftError }),
}));
jest.mock('../../contexts/OperationalDataContext', () => ({
  useOperationalData: () => mockOperationalState,
}));

beforeEach(() => {
  mockCreateAircraft.mockReset();
  mockAircraftError = null;
  mockOperationalState = {
    mode: 'remote', status: 'ready', operatingLocations: [locationOne, locationTwo],
    operatingLocationIds: [locationOne.id, locationTwo.id],
  };
});

test('offers only authoritative assigned operating locations on the preserved Aircraft form', () => {
  render(<AircraftForm aircraftId={null} onSave={jest.fn()} onCancel={jest.fn()} />);

  const location = screen.getByLabelText(/Operating location/i);
  expect(location).toBeInTheDocument();
  fireEvent.mouseDown(location);
  expect(screen.getByText('Dalby Base')).toBeInTheDocument();
  expect(screen.getByText('Emerald Base')).toBeInTheDocument();
});

test('keeps a new Aircraft non-submittable until authoritative Base hydration completes', async () => {
  mockOperationalState = { mode: 'remote', status: 'loading', operatingLocations: [], operatingLocationIds: [] };
  const view = render(<AircraftForm aircraftId={null} onSave={jest.fn()} onCancel={jest.fn()} />);

  expect(screen.getByLabelText(/Operating location/i)).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('button', { name: 'Create Aircraft' })).toBeDisabled();
  expect(screen.getByText(/Loading authorised Bases/i)).toBeVisible();

  mockOperationalState = {
    mode: 'remote', status: 'ready', operatingLocations: [locationOne], operatingLocationIds: [locationOne.id],
  };
  view.rerender(<AircraftForm aircraftId={null} onSave={jest.fn()} onCancel={jest.fn()} />);

  await waitFor(() => expect(screen.getByLabelText(/Operating location/i)).toHaveTextContent('Dalby Base'));
  expect(screen.getByLabelText(/Operating location/i)).not.toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('button', { name: 'Create Aircraft' })).toBeEnabled();
});

test('clears a stale Base when the authenticated operating-location scope changes', async () => {
  mockOperationalState = {
    mode: 'remote', status: 'ready', operatingLocations: [locationOne], operatingLocationIds: [locationOne.id],
  };
  const view = render(<AircraftForm aircraftId={null} onSave={jest.fn()} onCancel={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText(/Operating location/i)).toHaveTextContent('Dalby Base'));

  mockOperationalState = {
    mode: 'remote', status: 'ready', operatingLocations: [locationTwo], operatingLocationIds: [locationTwo.id],
  };
  view.rerender(<AircraftForm aircraftId={null} onSave={jest.fn()} onCancel={jest.fn()} />);

  await waitFor(() => expect(screen.getByLabelText(/Operating location/i)).toHaveTextContent('Emerald Base'));
  expect(screen.getByLabelText(/Operating location/i)).not.toHaveTextContent('Dalby Base');
});

test('renders one effective submission error when form and Aircraft context both hold a failure', async () => {
  mockOperationalState = {
    mode: 'remote', status: 'ready', operatingLocations: [locationOne], operatingLocationIds: [locationOne.id],
  };
  const view = render(<AircraftForm aircraftId={null} onSave={jest.fn()} onCancel={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText(/Operating location/i)).toHaveTextContent('Dalby Base'));
  fireEvent.click(screen.getByRole('button', { name: 'Create Aircraft' }));
  expect(await screen.findByText(/Some required aircraft details/i)).toBeVisible();

  mockAircraftError = 'Aircraft request failed.';
  view.rerender(<AircraftForm aircraftId={null} onSave={jest.fn()} onCancel={jest.fn()} />);

  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(screen.queryByText('Aircraft request failed.')).not.toBeInTheDocument();
});

test('uses native date control values when the browser has not emitted a React change event', () => {
  const form = document.createElement('form');
  const date = document.createElement('input');
  date.name = 'lastInspection';
  date.type = 'date';
  date.value = '2026-08-01';
  form.appendChild(date);

  expect(reconcileNativeAircraftDates(form, { lastInspection: '' })).toEqual({
    lastInspection: '2026-08-01',
  });
});

test('formats safe API diagnostics for a failed aircraft submission', () => {
  const error = new AircraftApiError(422, 'AIRCRAFT_INVALID', 'Review the aircraft details.', undefined, 'request-safe-123');
  expect(error.userMessage).toBe('Review the aircraft details. Code: AIRCRAFT_INVALID. Reference: request-safe-123.');
});
