import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissionRegister from './MissionRegister';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}), { virtual: true });

jest.mock('../contexts/MissionContext', () => ({
  useMission: () => ({
    missions: [
      { id: 'planning-1', missionName: 'North block spray', missionNumber: 'MSN-001', status: 'Planning', scheduledDate: '2026-07-20T08:00:00.000Z', updatedAt: '2026-07-18T08:00:00.000Z', location: { name: 'North block' } },
      { id: 'approved-1', missionName: 'Creek paddock', missionNumber: 'MSN-002', status: 'Approved', scheduledDate: '2026-07-21T08:00:00.000Z', updatedAt: '2026-07-18T09:00:00.000Z', location: { name: 'Creek paddock' } },
      { id: 'completed-1', missionName: 'Western boundary', missionNumber: 'MSN-003', status: 'Completed', scheduledDate: '2026-07-15T08:00:00.000Z', updatedAt: '2026-07-18T10:00:00.000Z', location: { name: 'Western boundary' } },
    ],
    isLoading: false,
    error: null,
  }),
}));

describe('MissionRegister', () => {
  beforeEach(() => mockNavigate.mockReset());

  test('shows planning, authorised and completed missions', () => {
    render(<MissionRegister />);

    expect(screen.getByText('North block spray')).toBeInTheDocument();
    expect(screen.getByText('Creek paddock')).toBeInTheDocument();
    expect(screen.getByText('Western boundary')).toBeInTheDocument();
    expect(screen.getByText('Authorised')).toBeInTheDocument();
  });

  test('starts a clean mission from the New Mission action', async () => {
    const user = userEvent.setup();
    render(<MissionRegister />);

    await user.click(screen.getByRole('button', { name: 'New Mission' }));
    expect(mockNavigate).toHaveBeenCalledWith('/missions/new');
  });

  test('opens the selected mission', async () => {
    const user = userEvent.setup();
    render(<MissionRegister />);

    await user.click(screen.getByRole('button', { name: 'Open North block spray' }));
    expect(mockNavigate).toHaveBeenCalledWith('/missions/planning-1');
  });
});
