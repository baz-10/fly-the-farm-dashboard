import { fireEvent, render, screen } from '@testing-library/react';
import AircraftForm, { reconcileNativeAircraftDates } from '../AircraftForm';

jest.mock('../../contexts/AircraftContext', () => ({
  useAircraft: () => ({ createAircraft: jest.fn(), updateAircraft: jest.fn(), getAircraftById: jest.fn(), error: null }),
}));
jest.mock('../../contexts/OperationalDataContext', () => ({
  useOperationalData: () => ({
    mode: 'remote', status: 'ready', operatingLocations: [
      { id: '33333333-3333-4333-8333-333333333333', name: 'Dalby Base' },
      { id: '44444444-4444-4444-8444-444444444444', name: 'Emerald Base' },
    ],
  }),
}));

test('offers only authoritative assigned operating locations on the preserved Aircraft form', () => {
  render(<AircraftForm aircraftId={null} onSave={jest.fn()} onCancel={jest.fn()} />);

  const location = screen.getByLabelText(/Operating location/i);
  expect(location).toBeInTheDocument();
  fireEvent.mouseDown(location);
  expect(screen.getByText('Dalby Base')).toBeInTheDocument();
  expect(screen.getByText('Emerald Base')).toBeInTheDocument();
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
