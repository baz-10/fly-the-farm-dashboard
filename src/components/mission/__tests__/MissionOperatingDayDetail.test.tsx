import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissionOperatingDayDetail from '../MissionOperatingDayDetail';
import type { MissionOperatingDay } from '../../../types/missionOperations';

const missionId = '11111111-1111-4111-8111-111111111111';
const dayId = '88888888-8888-4888-8888-888888888888';
const packageId = '22222222-2222-4222-8222-222222222222';
const jsaId = '33333333-3333-4333-8333-333333333333';
const fieldId = '44444444-4444-4444-8444-444444444444';

const unreviewedDay: MissionOperatingDay = {
  id: dayId, missionId, workDate: '2026-09-05', timezone: 'Australia/Brisbane', packageRevisionId: packageId, jsaRevisionId: jsaId,
  state: 'READY', actualStartedAt: null, actualFinishedAt: null, notes: null, rowVersion: 1,
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', jsaReview: null, fieldActivities: [],
};

const api = {
  reviewJsa: jest.fn(), startDay: jest.fn(), saveFieldActivity: jest.fn(), completeDay: jest.fn(),
};

describe('MissionOperatingDayDetail', () => {
  beforeEach(() => jest.clearAllMocks());

  test('does not start until the effective JSA is reviewed', () => {
    render(<MissionOperatingDayDetail day={unreviewedDay} authorisedFields={[]} api={api} />);

    expect(screen.getByRole('button', { name: 'Start operating day' })).toBeDisabled();
    expect(screen.getByText('Review the effective JSA before starting this operating day.')).toBeVisible();
  });

  test('shows only authorised Fields and labels planned activity as Proposed before it is recorded', async () => {
    const user = userEvent.setup();
    render(<MissionOperatingDayDetail day={unreviewedDay} authorisedFields={[{ id: fieldId, name: 'North Paddock', sizeHa: 12.5 }]} api={api} />);

    expect(screen.getByText('Authorised Fields')).toBeVisible();
    await user.click(screen.getByRole('combobox', { name: 'Field' }));
    expect(screen.getByRole('option', { name: 'North Paddock' })).toBeVisible();
    expect(screen.getAllByText('Proposed')[0]).toBeVisible();
    expect(screen.getByText('Plan data remains Proposed until you record it below.')).toBeVisible();
  });
});
