import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissionOperatingDays from '../MissionOperatingDays';
import type { MissionOperatingDay } from '../../../types/missionOperations';

const missionId = '11111111-1111-4111-8111-111111111111';
const packageId = '22222222-2222-4222-8222-222222222222';
const jsaId = '33333333-3333-4333-8333-333333333333';

function day(workDate: string, state: MissionOperatingDay['state'] = 'READY'): MissionOperatingDay {
  return {
    id: `${workDate}-day`, missionId, workDate, timezone: 'Australia/Brisbane', packageRevisionId: packageId, jsaRevisionId: jsaId,
    state, actualStartedAt: null, actualFinishedAt: null, notes: null, rowVersion: 1,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    jsaReview: null, fieldActivities: [],
  };
}

describe('MissionOperatingDays', () => {
  test('shows compact day summaries and opens one day workspace', async () => {
    const user = userEvent.setup();
    render(<MissionOperatingDays missionId={missionId} days={[day('2026-09-05'), day('2026-09-06')]} authorisedFields={[]} />);

    expect(screen.getAllByRole('button', { name: /Open operating day/ })).toHaveLength(2);
    expect(screen.queryByLabelText('Aircraft flight hours')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open operating day 5 September' }));
    expect(screen.getByRole('heading', { name: '5 September 2026' })).toBeVisible();
  });

  test('keeps cards in a responsive grid without rendering their detailed controls', () => {
    render(<MissionOperatingDays missionId={missionId} days={[day('2026-09-05', 'IN_PROGRESS')]} authorisedFields={[]} />);

    expect(screen.getByTestId('operating-day-card-grid')).toHaveStyle({ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' });
    expect(screen.queryByRole('button', { name: 'Start operating day' })).not.toBeInTheDocument();
  });

  test('keeps proposed hectares out of the actual card total', () => {
    const proposed = { id: 'planned', operatingDayId: day('2026-09-05').id, missionId, fieldId: 'field-a', hectaresAttempted: '9.000000', hectaresCompleted: '9.000000', startedAt: null, finishedAt: null, status: 'PLANNED' as const, notes: null, rowVersion: 1, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
    const recorded = { ...proposed, id: 'actual', status: 'COMPLETED' as const, hectaresAttempted: '3.000000', hectaresCompleted: '2.000000' };
    render(<MissionOperatingDays missionId={missionId} days={[{ ...day('2026-09-05'), fieldActivities: [proposed, recorded] }]} authorisedFields={[]} />);

    expect(screen.getByText('Actual: 2.0 ha completed of 3.0 ha attempted')).toBeVisible();
  });
});
