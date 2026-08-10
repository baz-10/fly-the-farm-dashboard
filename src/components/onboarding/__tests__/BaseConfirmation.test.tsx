import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BaseConfirmation from '../BaseConfirmation';

jest.mock('../../AddressLocationMap', () => (props: any) => (
  <button type="button" onClick={() => props.onLocationChange(-27.5002, 153.1003)}>Move pin</button>
));

const base = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Dalby Base',
  address: '1 Airstrip Road, Dalby QLD 4405',
  timezone: 'Australia/Brisbane',
  latitude: -27.1817,
  longitude: 151.2621,
  addressSource: 'ADDRESS_SEARCH' as const,
  locationConfirmedAt: '2026-08-09T00:00:00.000Z',
  rowVersion: 4,
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
};

test('confirms the authoritative Base with provenance and optimistic concurrency', async () => {
  const updateOperatingLocation = jest.fn().mockResolvedValue({ ...base, rowVersion: 5 });
  const onSaved = jest.fn();
  render(<BaseConfirmation base={base} updateOperatingLocation={updateOperatingLocation} onSaved={onSaved} />);

  expect(screen.getByRole('heading', { name: 'Confirm your Base' })).toBeVisible();
  expect(screen.getAllByText('Location confirmed')[0]).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Save confirmed Base' }));

  await waitFor(() => expect(updateOperatingLocation).toHaveBeenCalledWith(
    base.id,
    base.rowVersion,
    expect.objectContaining({
      address: base.address,
      latitude: base.latitude,
      longitude: base.longitude,
      addressSource: 'ADDRESS_SEARCH',
      locationConfirmed: true,
      locationConfirmedAt: base.locationConfirmedAt,
    }),
  ));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ rowVersion: 5 })));
  expect(await screen.findByRole('button', { name: 'Return to Getting Started' })).toBeVisible();
});

test('marks a moved pin unconfirmed and keeps entered map state after a failed save', async () => {
  const updateOperatingLocation = jest.fn().mockRejectedValue(new Error('Base changed before your update.'));
  render(<BaseConfirmation base={base} updateOperatingLocation={updateOperatingLocation} />);

  fireEvent.click(await screen.findByRole('button', { name: 'Move pin' }));
  expect(screen.getByText('Location not confirmed')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Save confirmed Base' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm location' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save confirmed Base' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Base changed before your update.');
  expect(screen.getByRole('button', { name: 'Location confirmed' })).toBeVisible();
  expect(updateOperatingLocation).toHaveBeenCalledWith(base.id, base.rowVersion, expect.objectContaining({
    latitude: -27.5002,
    longitude: 153.1003,
    addressSource: 'MANUALLY_ADJUSTED',
  }));
});
