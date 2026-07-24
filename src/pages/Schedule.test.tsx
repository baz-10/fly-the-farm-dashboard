import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Schedule from './Schedule';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
vi.mock('../contexts/MissionContext', () => ({
  useMission: () => ({ missions: [{ id: 'm1', missionName: 'North Paddock', missionNumber: 'MSN-1', scheduledDate: new Date().toISOString(), status: 'Planning', location: { name: 'Dalby Farm' }, aircraftConfiguration: { aircraftIds: ['a1', 'a2'] } }], isLoading: false, error: null }),
}));

describe('Schedule', () => {
  beforeEach(() => mockNavigate.mockReset());

  test('defaults to a seven-day week and opens mission bookings', async () => {
    const user = userEvent.setup();
    render(<Schedule />);
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByTestId('schedule-day')).toHaveLength(7);
    await user.click(screen.getByRole('button', { name: /Open North Paddock/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/missions/m1');
  });

  test('switches between Day, Week, and Month and creates a mission', async () => {
    const user = userEvent.setup();
    render(<Schedule />);
    await user.click(screen.getByRole('button', { name: 'Day' }));
    expect(screen.getAllByTestId('schedule-day')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Month' }));
    expect(screen.getAllByTestId('schedule-day').length).toBeGreaterThanOrEqual(28);
    await user.click(screen.getByRole('button', { name: 'New Mission' }));
    expect(mockNavigate).toHaveBeenCalledWith('/missions/new');
  });
});
