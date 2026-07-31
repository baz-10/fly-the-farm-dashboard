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

  test('offers password recovery from login and exposes it as a public route', async () => {
    localStorage.clear();
    window.history.replaceState({}, '', '/login');

    const { unmount } = render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    expect(await screen.findByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
    unmount();
    window.history.replaceState({}, '', '/forgot-password');

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeVisible();
  });
});
