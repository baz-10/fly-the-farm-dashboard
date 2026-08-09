import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../../theme/theme';
import AcceptOrganisationInvitation from '../AcceptOrganisationInvitation';

const mockAcceptOrganisationInvitation = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ acceptOrganisationInvitation: mockAcceptOrganisationInvitation }),
}));

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => mockNavigate,
}), { virtual: true });

function renderPage(url = '/onboarding/accept?token=raw-invitation-token#access_token=invite-access&refresh_token=invite-refresh&expires_in=3600&type=invite') {
  window.history.replaceState({}, '', url);
  return render(<ThemeProvider theme={theme}><AcceptOrganisationInvitation /></ThemeProvider>);
}

describe('organisation invitation acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });

  test('chooses and confirms a password before accepting the invitation session', async () => {
    mockAcceptOrganisationInvitation.mockResolvedValue({ success: true });
    renderPage();

    await userEvent.type(screen.getByLabelText(/^Create password/), 'new-password');
    await userEvent.type(screen.getByLabelText(/^Confirm password/), 'new-password');
    await userEvent.click(screen.getByRole('button', { name: 'Activate organisation' }));

    expect(mockAcceptOrganisationInvitation).toHaveBeenCalledWith(
      'new-password', 'raw-invitation-token', 'invite-access', 'invite-refresh', 3600,
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/getting-started', { replace: true }));
  });

  test('keeps password validation local and does not resolve any identity', async () => {
    renderPage();

    await userEvent.type(screen.getByLabelText(/^Create password/), 'short');
    await userEvent.type(screen.getByLabelText(/^Confirm password/), 'different');
    await userEvent.click(screen.getByRole('button', { name: 'Activate organisation' }));

    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(mockAcceptOrganisationInvitation).not.toHaveBeenCalled();
    expect(screen.queryByText(/Platform identity/i)).not.toBeInTheDocument();
  });

  test('shows authentication failures separately from invitation failures', async () => {
    mockAcceptOrganisationInvitation.mockResolvedValue({
      success: false, errorKind: 'authentication', error: 'This authentication link is invalid or expired.',
    });
    renderPage();

    await userEvent.type(screen.getByLabelText(/^Create password/), 'new-password');
    await userEvent.type(screen.getByLabelText(/^Confirm password/), 'new-password');
    await userEvent.click(screen.getByRole('button', { name: 'Activate organisation' }));

    expect(await screen.findByText('Authentication link problem')).toBeInTheDocument();
    expect(screen.getByText('This authentication link is invalid or expired.')).toBeInTheDocument();
    expect(screen.queryByText('Invitation problem')).not.toBeInTheDocument();
  });

  test.each([
    'This invitation has expired. Ask your reviewer to send a new invitation.',
    'This invitation has been revoked. Ask your reviewer to send a new invitation.',
  ])('shows resend guidance for an unusable invitation: %s', async (message) => {
    mockAcceptOrganisationInvitation.mockResolvedValue({ success: false, errorKind: 'onboarding', error: message });
    renderPage();

    await userEvent.type(screen.getByLabelText(/^Create password/), 'new-password');
    await userEvent.type(screen.getByLabelText(/^Confirm password/), 'new-password');
    await userEvent.click(screen.getByRole('button', { name: 'Activate organisation' }));

    expect(await screen.findByText('Invitation problem')).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  test('does not submit an incomplete invitation link', () => {
    renderPage('/onboarding/accept');

    expect(screen.getByText('This invitation link is incomplete or expired.')).toBeInTheDocument();
    expect(screen.getByText('Ask your reviewer to send a new invitation.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activate organisation' })).toBeDisabled();
    expect(mockAcceptOrganisationInvitation).not.toHaveBeenCalled();
  });

  test('classifies a missing Supabase session as an authentication-link problem', () => {
    renderPage('/onboarding/accept?token=raw-invitation-token');

    expect(screen.getByText('Authentication link problem')).toBeInTheDocument();
    expect(screen.getByText('This authentication link is incomplete or expired.')).toBeInTheDocument();
    expect(screen.queryByText('Invitation problem')).not.toBeInTheDocument();
    expect(mockAcceptOrganisationInvitation).not.toHaveBeenCalled();
  });
});
