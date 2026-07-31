import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import ForgotPassword from './ForgotPassword';

const requestPasswordReset = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ requestPasswordReset }),
}));

describe('ForgotPassword', () => {
  beforeEach(() => requestPasswordReset.mockReset());

  test('requests an email and shows the non-enumerating success message', async () => {
    requestPasswordReset.mockResolvedValue({ success: true });
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    const user = userEvent.setup();

    await user.type(screen.getByRole('textbox', { name: /Email/ }), 'pilot@example.com');
    await user.click(screen.getByRole('button', { name: 'Send recovery email' }));

    expect(requestPasswordReset).toHaveBeenCalledWith('pilot@example.com');
    expect(await screen.findByText(/if an account exists/i)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });

  test('does not submit an invalid email address', async () => {
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    const user = userEvent.setup();

    await user.type(screen.getByRole('textbox', { name: /Email/ }), 'invalid');
    await user.click(screen.getByRole('button', { name: 'Send recovery email' }));

    expect(requestPasswordReset).not.toHaveBeenCalled();
  });
});
