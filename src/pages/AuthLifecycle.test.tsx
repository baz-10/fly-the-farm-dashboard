import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme/theme';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import AuthCallback from './AuthCallback';

const mockRequestPasswordReset = jest.fn();
const mockResetPassword = jest.fn();
const mockCompleteSession = jest.fn();

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    requestPasswordReset: mockRequestPasswordReset,
    resetPassword: mockResetPassword,
    completeSession: mockCompleteSession,
  }),
}));

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => jest.fn(),
}), { virtual: true });

function renderPage(element: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{element}</ThemeProvider>);
}

describe('deployed authentication lifecycle pages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });

  test('forgot password returns the same safe response for any submitted email', async () => {
    mockRequestPasswordReset.mockResolvedValue({ success: true });
    renderPage(<ForgotPassword />);

    await userEvent.type(screen.getByLabelText(/Email/), 'unknown@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    expect(mockRequestPasswordReset).toHaveBeenCalledWith('unknown@example.com');
    expect(await screen.findByText('If an account exists for that email, a password reset link has been sent.')).toBeInTheDocument();
  });

  test('confirmation callback rejects an incomplete callback without creating a session', async () => {
    window.history.replaceState({}, '', '/auth/callback#error_description=Link%20expired');
    renderPage(<AuthCallback />);

    expect(await screen.findByText('Link expired')).toBeInTheDocument();
    expect(mockCompleteSession).not.toHaveBeenCalled();
  });

  test('confirmation callback completes the server session from Supabase callback tokens', async () => {
    mockCompleteSession.mockResolvedValue({ success: true });
    window.history.replaceState({}, '', '/auth/callback#access_token=access&refresh_token=refresh&expires_in=3600&type=signup');
    renderPage(<AuthCallback />);

    expect(await screen.findByText('Your email is confirmed and your Spray Command account is ready.')).toBeInTheDocument();
    expect(mockCompleteSession).toHaveBeenCalledWith('access', 'refresh', 3600);
  });

  test('recovery callbacks fall through to password choice when Supabase uses the Site URL fallback', async () => {
    window.history.replaceState({}, '', '/auth/callback#access_token=recovery&refresh_token=refresh&expires_in=3600&type=recovery');
    renderPage(<AuthCallback />);

    expect(await screen.findByText('Choose a new password')).toBeInTheDocument();
    expect(mockCompleteSession).not.toHaveBeenCalled();
  });

  test('password reset requires matching passwords and submits the recovery session', async () => {
    mockResetPassword.mockResolvedValue({ success: true });
    window.history.replaceState({}, '', '/reset-password#access_token=recovery&refresh_token=refresh&expires_in=3600&type=recovery');
    renderPage(<ResetPassword />);

    await userEvent.type(screen.getByLabelText(/^New Password/), 'new-password');
    await userEvent.type(screen.getByLabelText(/^Confirm New Password/), 'new-password');
    await userEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    expect(mockResetPassword).toHaveBeenCalledWith('new-password', 'recovery', 'refresh', 3600);
    expect(await screen.findByText('Your password has been updated. You can now continue to Spray Command.')).toBeInTheDocument();
  });
});
