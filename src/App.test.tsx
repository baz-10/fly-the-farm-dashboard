import { render, screen } from '@testing-library/react';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';

describe('App', () => {
  test('redirects a signed-out user from a protected route to login', async () => {
    localStorage.clear();
    window.history.replaceState({}, '', '/missions');

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    expect(await screen.findByText('Sign in to access your account')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });
});
