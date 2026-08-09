import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommercialApplication from '../CommercialApplication';
import { submitCommercialApplication } from '../../services/commercialOnboardingApi';

jest.mock('../../services/commercialOnboardingApi', () => ({ submitCommercialApplication: jest.fn() }));
jest.mock('../../components/AddressAutocomplete', () => (props: any) => <div>
  <label htmlFor="base-address">{props.label}</label>
  <input id="base-address" value={props.initialValue || ''} onChange={(event) => props.onInputChange?.(event.target.value)} />
  <button type="button" onClick={() => props.onSelect({
    address: '1 Farm Road, Dalby QLD 4405', displayName: '1 Farm Road, Dalby QLD 4405',
    locality: 'Dalby', state: 'QLD', postcode: '4405', lat: -27.1817, lng: 151.2621,
    coordinateSource: 'GEOCODED', locationConfirmedAt: '2026-08-09T00:00:00.000Z',
  })}>Choose and confirm Base address</button>
</div>);

const submit = submitCommercialApplication as jest.MockedFunction<typeof submitCommercialApplication>;

beforeEach(() => {
  submit.mockReset();
  submit.mockResolvedValue({ submitted: true, applicationReference: 'SC-APP-A1B2C3D4E5F6' });
});

async function completeApplication() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^Business name/), 'Western Downs Aerial Application');
  await user.type(screen.getByLabelText(/^Your name/), 'Alex Morgan');
  await user.type(screen.getByLabelText(/^Email/), 'alex@example.com');
  await user.type(screen.getByLabelText(/^Phone/), '07 4000 0000');
  await user.type(screen.getByLabelText(/^Base name/), 'Dalby Base');
  await user.click(screen.getByRole('button', { name: 'Choose and confirm Base address' }));
  await user.type(screen.getByLabelText('Application notes'), 'We operate across the Western Downs.');
  await user.click(screen.getByRole('checkbox', { name: /confirm these details/i }));
  return user;
}

test('uses the approved public application structure and Base terminology', () => {
  render(<CommercialApplication />);
  expect(screen.getByRole('heading', { name: 'Apply for Spray Command' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Your business' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Your administrator' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Your Base' })).toBeVisible();
  expect(screen.getByLabelText('Base address')).toBeVisible();
  expect(screen.queryByText(/Operating Location/i)).not.toBeInTheDocument();
});

test('submits confirmed coordinates and provenance then explains review before invitation', async () => {
  render(<CommercialApplication />);
  const user = await completeApplication();
  await user.click(screen.getByRole('button', { name: 'Send application' }));

  await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({
    businessName: 'Western Downs Aerial Application', administratorName: 'Alex Morgan',
    administratorEmail: 'alex@example.com', administratorPhone: '07 4000 0000',
    base: expect.objectContaining({ name: 'Dalby Base', address: '1 Farm Road, Dalby QLD 4405', latitude: -27.1817, longitude: 151.2621, timezone: 'Australia/Brisbane', addressSource: 'GEOCODED', locationConfirmedAt: '2026-08-09T00:00:00.000Z' }),
  })));
  expect(await screen.findByText('SC-APP-A1B2C3D4E5F6')).toBeVisible();
  expect(screen.getByText(/review occurs before any invitation is sent/i)).toBeVisible();
});

test('preserves entered work after a validation response', async () => {
  submit.mockRejectedValueOnce(new Error('Check the application details and confirm the Base location.'));
  render(<CommercialApplication />);
  const user = await completeApplication();
  await user.click(screen.getByRole('button', { name: 'Send application' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Check the application details');
  expect(screen.getByLabelText(/^Business name/)).toHaveValue('Western Downs Aerial Application');
  expect(screen.getByLabelText(/^Email/)).toHaveValue('alex@example.com');
  expect(screen.getByLabelText(/^Base name/)).toHaveValue('Dalby Base');
});
