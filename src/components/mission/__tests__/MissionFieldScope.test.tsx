import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissionFieldScope from '../MissionFieldScope';

const fieldA = '11111111-1111-4111-8111-111111111111';
const fieldB = '22222222-2222-4222-8222-222222222222';
const foreignField = '33333333-3333-4333-8333-333333333333';

describe('MissionFieldScope', () => {
  test('only offers Fields already authorised on the Job', () => {
    render(<MissionFieldScope
      jobFieldIds={[fieldA, fieldB]}
      selectedFieldIds={[fieldA]}
      fieldsByProperty={[
        { propertyId: 'property-a', propertyName: 'North Farm', fields: [{ id: fieldA, name: 'Field A' }, { id: fieldB, name: 'Field B' }] },
        { propertyId: 'property-b', propertyName: 'Other Farm', fields: [{ id: foreignField, name: 'Foreign Field' }] },
      ]}
      onSelectedFieldIdsChange={() => undefined}
    />);

    expect(screen.getByRole('checkbox', { name: 'Field A' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Field B' })).not.toBeChecked();
    expect(screen.queryByText('Foreign Field')).not.toBeInTheDocument();
  });

  test('does not allow the final Job Field to be removed', async () => {
    const user = userEvent.setup();
    const onSelectedFieldIdsChange = jest.fn();
    render(<MissionFieldScope
      jobFieldIds={[fieldA]}
      selectedFieldIds={[fieldA]}
      fieldsByProperty={[{ propertyId: 'property-a', propertyName: 'North Farm', fields: [{ id: fieldA, name: 'Field A' }] }]}
      onSelectedFieldIdsChange={onSelectedFieldIdsChange}
    />);

    await user.click(screen.getByRole('checkbox', { name: 'Field A' }));
    expect(onSelectedFieldIdsChange).not.toHaveBeenCalled();
    expect(screen.getByText('Select at least one Job Field for this Mission.')).toBeVisible();
  });
});
