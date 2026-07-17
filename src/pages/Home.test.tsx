import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from './Home';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}), { virtual: true });

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

jest.mock('../contexts/MissionContext', () => ({
  useMission: () => ({
    missions: [],
    isLoading: false,
    error: null,
    loadData: jest.fn(),
  }),
}));

jest.mock('../contexts/AircraftContext', () => ({
  useAircraft: () => ({
    aircraft: [],
    isLoading: false,
    error: null,
    loadData: jest.fn(),
  }),
}));

jest.mock('../services/fieldManagementStore', () => ({ getClients: () => [] }));
jest.mock('../services/quoteStore', () => ({ getQuotes: () => [] }));
jest.mock('../services/financialsStore', () => ({
  getFinancialsSummary: () => ({ revenue: 0, costs: 0, profit: 0, hasActuals: false }),
}));

function renderHome() {
  return render(<Home />);
}

describe('Operations schedule navigation', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  test('View Schedule opens the mission register instead of job history', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('button', { name: 'View Schedule' }));

    expect(mockNavigate).toHaveBeenCalledWith('/missions');
    expect(mockNavigate).not.toHaveBeenCalledWith('/jobs/history');
  });

  test("Today's Spray Schedule View all opens the mission register", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('button', { name: 'View all' }));

    expect(mockNavigate).toHaveBeenCalledWith('/missions');
  });
});
