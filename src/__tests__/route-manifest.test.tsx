import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { AuthProvider } from '../contexts/AuthContext';
import App from '../App';
import theme from '../theme/theme';

const ADMIN_SESSION = {
  id: 'route-test-admin',
  email: 'route-test@example.com',
  name: 'Route Test Admin',
  role: 'admin',
  tier: 'pro',
};

function renderApplicationAt(path: string) {
  window.history.replaceState({}, '', path);
  localStorage.setItem('ftf_session', JSON.stringify(ADMIN_SESSION));

  return render(
    <ThemeProvider theme={theme}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

it.each([
  '/',
  '/missions',
  '/missions/new',
  '/missions/mission-1',
  '/jobs',
  '/jobs/import',
  '/jobs/history',
  '/jobs/client/client-1',
  '/jobs/client/client-1/property/property-1',
  '/jobs/client/client-1/property/property-1/field/field-1',
  '/jobs/client/client-1/property/property-1/field/field-1/new-job',
  '/jobs/client/client-1/property/property-1/field/field-1/job/job-1',
  '/aircraft',
  '/maintenance',
  '/compliance',
  '/compliance/safety',
  '/compliance/safety-plans',
  '/compliance/safety-plans/template',
])('declares and renders route %s without a router module error', async (path) => {
  renderApplicationAt(path);

  expect(await screen.findByTestId('application-shell')).toBeInTheDocument();
});

it('redirects the legacy mission-planning route to the mission register', async () => {
  renderApplicationAt('/mission-planning');

  await waitFor(() => {
    expect(window.location.pathname).toBe('/missions');
  });
  expect(screen.getByTestId('application-shell')).toBeInTheDocument();
});

it('preserves the mission and section when redirecting a legacy mission link', async () => {
  renderApplicationAt('/mission-planning?mission=mission%201&section=safety%20checks');

  await waitFor(() => {
    expect(window.location.pathname).toBe('/missions/mission%201');
    expect(new URLSearchParams(window.location.search).get('section')).toBe('safety checks');
  });
  expect(screen.getByTestId('application-shell')).toBeInTheDocument();
});
