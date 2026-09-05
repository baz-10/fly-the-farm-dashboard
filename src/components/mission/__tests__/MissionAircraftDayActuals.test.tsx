import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissionAircraftDayActuals from '../MissionAircraftDayActuals';
import type { MissionAircraftDayActualsRecord } from '../../../types/missionOperations';

const missionId = '11111111-1111-4111-8111-111111111111';
const dayId = '22222222-2222-4222-8222-222222222222';
const packageRevisionId = '33333333-3333-4333-8333-333333333333';
const aircraftA = { id: '44444444-4444-4444-8444-444444444444', label: 'FTF-T100-001' };
const aircraftB = { id: '55555555-5555-4555-8555-555555555555', label: 'FTF-T100-002' };

describe('MissionAircraftDayActuals', () => {
  test('records two aircraft totals without requiring individual flights', async () => {
    const user = userEvent.setup();
    const api = { saveAircraftActuals: jest.fn().mockResolvedValue({}) };
    render(<MissionAircraftDayActuals missionId={missionId} dayId={dayId} packageRevisionId={packageRevisionId} dayVersion={4} aircraft={[aircraftA, aircraftB]} api={api} />);

    await user.type(screen.getByLabelText('FTF-T100-001 flight hours'), '10.0000');
    await user.type(screen.getByLabelText('FTF-T100-002 flight hours'), '10.0000');
    await user.click(screen.getByRole('button', { name: 'Save aircraft totals' }));

    await waitFor(() => expect(api.saveAircraftActuals).toHaveBeenCalledWith(dayId, expect.objectContaining({
      missionId,
      expectedVersion: 4,
      totalAircraftHours: '20.0000',
      aircraftTotals: [
        { aircraftId: aircraftA.id, totalFlightHours: '10.0000' },
        { aircraftId: aircraftB.id, totalFlightHours: '10.0000' },
      ],
      flights: [],
    })));
  });

  test('shows a mismatch and marks the day not ready for sign-off when optional flights disagree', () => {
    const actual: MissionAircraftDayActualsRecord = {
      missionId,
      operatingDayId: dayId,
      packageRevisionId,
      dayVersion: 4,
      totalAircraftHours: '10.0000',
      readyForSignOff: false,
      actuals: [{
        id: '66666666-6666-4666-8666-666666666666',
        missionId,
        operatingDayId: dayId,
        packageRevisionId,
        aircraftId: aircraftA.id,
        missionAircraftAssignmentId: '77777777-7777-4777-8777-777777777777',
        declaredTotalHours: '10.0000',
        totalFlightHours: '10.0000',
        flightsTotalHours: '9.5000',
        totalSource: 'DECLARED',
        reconciliationStatus: 'MISMATCH',
        rowVersion: 1,
        signedOffAt: null,
        signedOffByInternalUserId: null,
        flights: [{
          id: '88888888-8888-4888-8888-888888888888',
          aircraftDayActualId: '66666666-6666-4666-8666-666666666666',
          missionId,
          operatingDayId: dayId,
          aircraftId: aircraftA.id,
          flightIndex: 1,
          durationHours: '9.5000',
          startedAt: null,
          finishedAt: null,
          fieldId: null,
          sourceImportId: null,
        }],
      }],
    };

    render(<MissionAircraftDayActuals missionId={missionId} dayId={dayId} packageRevisionId={packageRevisionId} dayVersion={4} aircraft={[aircraftA]} actual={actual} api={{ saveAircraftActuals: jest.fn() }} />);

    expect(screen.getByText('Flight details total 9.5000 h; declared total is 10.0000 h.')).toBeVisible();
    expect(screen.getByText('Aircraft actuals are not ready for sign-off.')).toBeVisible();
  });

  test('rejects excess precision instead of silently truncating it', async () => {
    const user = userEvent.setup();
    const api = { saveAircraftActuals: jest.fn() };
    render(<MissionAircraftDayActuals missionId={missionId} dayId={dayId} packageRevisionId={packageRevisionId} dayVersion={4} aircraft={[aircraftA]} api={api} />);

    await user.type(screen.getByLabelText('FTF-T100-001 flight hours'), '1.00001');
    await user.click(screen.getByRole('button', { name: 'Save aircraft totals' }));

    expect(await screen.findByText('Enter flight hours with exactly four decimal places.')).toBeVisible();
    expect(api.saveAircraftActuals).not.toHaveBeenCalled();
  });
});
