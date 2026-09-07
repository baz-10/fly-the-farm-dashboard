import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const activity = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', operatingDayId: dayId, missionId, fieldId, hectaresAttempted: '3.000000', hectaresCompleted: '2.000000',
  startedAt: null, finishedAt: null, status: 'COMPLETED' as const, notes: 'Recorded on site.', rowVersion: 7,
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
};

async function recordActivity(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Hectares attempted'), '3');
  await user.type(screen.getByLabelText('Hectares completed'), '2');
  expect(screen.getByLabelText('Hectares attempted')).toHaveValue('3');
  expect(screen.getByLabelText('Hectares completed')).toHaveValue('2');
  expect(screen.getByRole('button', { name: 'Record Field activity' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Record Field activity' }));
}

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

  test('sends zero as the expected version when creating a Field activity', async () => {
    const user = userEvent.setup();
    const saveFieldActivity = jest.fn().mockResolvedValue(unreviewedDay);
    render(<MissionOperatingDayDetail day={unreviewedDay} authorisedFields={[{ id: fieldId, name: 'North Paddock' }]} api={{ ...api, saveFieldActivity }} />);

    await recordActivity(user);
    await waitFor(() => expect(saveFieldActivity).toHaveBeenCalledWith(missionId, dayId, null, 0, expect.objectContaining({ fieldId, hectaresAttempted: '3.000000', hectaresCompleted: '2.000000' })));
  });

  test('sends the selected activity row version when updating an existing Field activity', async () => {
    const user = userEvent.setup();
    const existingDay = { ...unreviewedDay, fieldActivities: [activity] };
    const saveFieldActivity = jest.fn().mockResolvedValue(existingDay);
    render(<MissionOperatingDayDetail day={existingDay} authorisedFields={[{ id: fieldId, name: 'North Paddock' }]} api={{ ...api, saveFieldActivity }} />);

    await user.click(screen.getByRole('button', { name: 'Edit North Paddock activity' }));
    await user.click(screen.getByRole('button', { name: 'Update Field activity' }));
    await waitFor(() => expect(saveFieldActivity).toHaveBeenCalledWith(missionId, dayId, activity.id, 7, expect.objectContaining({ fieldId })));
  });

  test('reloads the exact day after a canonical version conflict and retries with the refreshed version', async () => {
    const user = userEvent.setup();
    const refreshedDay = { ...unreviewedDay, rowVersion: 8 };
    const onReloadDay = jest.fn().mockResolvedValue(refreshedDay);
    api.reviewJsa.mockRejectedValueOnce(Object.assign(new Error('Changed elsewhere.'), { code: 'MISSION_OPERATING_DAY_VERSION_CONFLICT' })).mockResolvedValueOnce(refreshedDay);
    function Harness() {
      const [day, setDay] = React.useState(unreviewedDay);
      return <MissionOperatingDayDetail day={day} authorisedFields={[{ id: fieldId, name: 'North Paddock' }]} api={api} onReloadDay={onReloadDay} onDayChanged={setDay} />;
    }
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Confirm conditions covered' }));
    expect(await screen.findByRole('button', { name: 'Reload operating day' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reload operating day' }));
    await waitFor(() => expect(onReloadDay).toHaveBeenCalledWith(dayId));
    await user.click(screen.getByRole('button', { name: 'Confirm conditions covered' }));
    await waitFor(() => expect(api.reviewJsa).toHaveBeenLastCalledWith(missionId, dayId, 8, 'CONDITIONS_COVERED', null));
  });
});
