import { render, screen } from '@testing-library/react';

import { AuthProvider } from './contexts/AuthContext';
import App from './App';

vi.mock('./contexts/SafetyPlanContext', () => ({
  SafetyPlanProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="safety-plan-provider">{children}</div>
  ),
}));

describe('App Safety Plan provider', () => {
  test('registers Safety Plan state for authenticated operator routes', async () => {
    localStorage.clear();
    localStorage.setItem('ftf_session', JSON.stringify({
      id: 'operator-1',
      email: 'operator@example.com',
      name: 'Operator',
      role: 'contractor',
      tenantId: 'tenant-1',
      tier: 'free',
      safetyPlanAuthority: false,
    }));
    window.history.replaceState({}, '', '/compliance/safety');

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    expect(await screen.findByTestId('safety-plan-provider')).toBeInTheDocument();
  });
});
