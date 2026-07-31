import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import Login from './Login';
import ResetPassword from './ResetPassword';

const updatePassword = vi.fn();
const login = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ updatePassword, login }),
}));

function renderFlow(hash = '') {
  window.history.replaceState({}, '', `/reset-password${hash}`);
  return render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResetPassword', () => {
  beforeEach(() => {
    updatePassword.mockReset();
    login.mockReset();
  });

  test('rejects missing recovery sessions and offers a new link', () => {
    renderFlow();

    expect(screen.getByText('This password recovery link is invalid or has expired.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Request a new recovery email' })).toHaveAttribute('href', '/forgot-password');
  });

  test('clears the recovery token and validates password confirmation', async () => {
    renderFlow('#access_token=recovery-token&type=recovery');
    expect(window.location.hash).toBe('');
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/New password/), 'newpass');
    await user.type(screen.getByLabelText(/Confirm new password/), 'different');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(screen.getByText('Passwords do not match.')).toBeVisible();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  test('requires the existing six-character password minimum', async () => {
    renderFlow('#access_token=recovery-token&type=recovery');
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/New password/), 'short');
    await user.type(screen.getByLabelText(/Confirm new password/), 'short');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(screen.getByText('Password must be at least 6 characters.')).toBeVisible();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  test('updates the password and returns to login with confirmation', async () => {
    updatePassword.mockResolvedValue({ success: true });
    renderFlow('#access_token=recovery-token&type=recovery');
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/New password/), 'newpass');
    await user.type(screen.getByLabelText(/Confirm new password/), 'newpass');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(updatePassword).toHaveBeenCalledWith('recovery-token', 'newpass');
    expect(await screen.findByText('Your password has been updated. Sign in with your new password.')).toBeVisible();
    expect(window.location.hash).toBe('');
  });
});
