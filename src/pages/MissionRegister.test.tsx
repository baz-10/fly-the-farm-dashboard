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
      { id: 'flying-1', missionName: 'Eastern flight', missionNumber: 'MSN-004', status: 'Flying', scheduledDate: '2026-07-18T08:00:00.000Z', updatedAt: '2026-07-18T11:00:00.000Z', location: { name: 'Eastern field' } },
      { id: 'completed-1', missionName: 'Western boundary', missionNumber: 'MSN-003', status: 'Completed', scheduledDate: '2026-07-15T08:00:00.000Z', updatedAt: '2026-07-18T10:00:00.000Z', location: { name: 'Western boundary' } },
    ],
    isLoading: false,
    error: null,
  }),
}));

describe('MissionRegister', () => {
  beforeEach(() => mockNavigate.mockReset());

  test('shows four distinct sections in operational order with counts', () => {
    render(<MissionRegister />);

    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(['In Progress', 'Authorised', 'Planning', 'Completed']);
    expect(screen.getByText('Eastern flight')).toBeInTheDocument();
    expect(screen.getByText('North block spray')).toBeInTheDocument();
    expect(screen.getByText('Creek paddock')).toBeInTheDocument();
    expect(screen.queryByText('Western boundary')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument();
  });

  test('expands completed missions on request', async () => {
    const user = userEvent.setup();
    render(<MissionRegister />);

    await user.click(screen.getByRole('button', { name: 'Completed, 1 mission, collapsed' }));
    expect(screen.getByText('Western boundary')).toBeInTheDocument();
    expect(screen.getByText('Review completed mission')).toBeInTheDocument();
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
