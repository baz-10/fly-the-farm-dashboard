import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobFieldScopeSelector from '../JobFieldScopeSelector';

const clientId = 'client-north';
const secondClientId = 'client-south';
const north40Id = 'field-north-40';
const riverBlockId = 'field-river-block';
const onScopeChange = jest.fn();

const fixture = {
  clients: [
    { id: clientId, name: 'North Farm' },
    { id: secondClientId, name: 'South Farm' },
  ],
  properties: [
    { id: 'property-home', clientId, name: 'Home Block' },
    { id: 'property-river', clientId, name: 'River Flats' },
    { id: 'property-south', clientId: secondClientId, name: 'South Block' },
  ],
  fields: [
    { id: north40Id, propertyId: 'property-home', name: 'North 40', sizeHa: 20.5 },
    { id: riverBlockId, propertyId: 'property-river', name: 'River Block', sizeHa: 32.2 },
    { id: 'field-south', propertyId: 'property-south', name: 'South Field', sizeHa: 10 },
  ],
  selectedClientId: clientId,
  selectedFieldIds: [] as string[],
  onScopeChange,
};

beforeEach(() => jest.clearAllMocks());

test('selects Fields across two Properties of the same Client', async () => {
  const user = userEvent.setup();
  render(<JobFieldScopeSelector {...fixture} />);

  await user.click(screen.getByRole('checkbox', { name: 'North 40' }));
  await user.click(screen.getByRole('button', { name: 'Add fields from another Property' }));
  await user.click(screen.getByRole('checkbox', { name: 'River Block' }));

  expect(onScopeChange).toHaveBeenLastCalledWith({ clientId, fieldIds: [north40Id, riverBlockId] });
  expect(screen.getByText('2 Properties · 2 Fields · 52.7000 ha')).toBeVisible();
});

test('clears all selected Fields when Client changes', async () => {
  const user = userEvent.setup();
  render(<JobFieldScopeSelector {...fixture} selectedFieldIds={[north40Id]} />);

  await user.selectOptions(screen.getByRole('combobox', { name: 'Client' }), secondClientId);

  expect(onScopeChange).toHaveBeenLastCalledWith({ clientId: secondClientId, fieldIds: [] });
});
