import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from './Home';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

vi.mock('../contexts/MissionContext', () => ({
  useMission: () => ({
    missions: [],
    isLoading: false,
    error: null,
    loadData: vi.fn(),
  }),
}));

vi.mock('../contexts/AircraftContext', () => ({
  useAircraft: () => ({
    aircraft: [],
    isLoading: false,
    error: null,
    loadData: vi.fn(),
  }),
}));

vi.mock('../services/fieldManagementStore', () => ({ getClients: () => [] }));
vi.mock('../services/quoteStore', () => ({ getQuotes: () => [] }));
vi.mock('../services/financialsStore', () => ({
  getFinancialsSummary: () => ({ revenue: 0, costs: 0, profit: 0, hasActuals: false }),
}));
vi.mock('../hooks/useOperationalWeather', () => ({ useOperationalWeather: () => ({ location: null, forecast: null, status: 'idle', error: '', recent: [], searchLocation: vi.fn(), useDeviceLocation: vi.fn(), refresh: vi.fn(), selectRecent: vi.fn() }) }));

function renderHome() {
  return render(<Home />);
}

describe('Operations schedule navigation', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  test('View Schedule opens the calendar schedule', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('button', { name: 'View Schedule' }));

    expect(mockNavigate).toHaveBeenCalledWith('/schedule');
    expect(mockNavigate).not.toHaveBeenCalledWith('/jobs/history');
  });

  test("Today and upcoming View all opens the calendar schedule", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('button', { name: 'View all' }));

    expect(mockNavigate).toHaveBeenCalledWith('/schedule');
  });

  test('uses one locked desktop height for primary panels', () => {
    renderHome();
    expect(screen.getAllByTestId('operations-panel').length).toBeGreaterThan(3);
    screen.getAllByTestId('operations-panel').forEach((panel) => expect(panel).toHaveAttribute('data-desktop-height', '300'));
  });
});
