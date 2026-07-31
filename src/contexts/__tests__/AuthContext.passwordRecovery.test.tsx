import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';

vi.mock('../../services/persistence', () => ({
  getPersistenceMode: () => 'remote',
}));

function TestConsumer() {
  const { isLoading, requestPasswordReset, updatePassword } = useAuth();
  if (isLoading) return <div>loading</div>;
  return (
    <>
      <button onClick={() => void requestPasswordReset('pilot@example.com')}>request reset</button>
      <button onClick={() => void updatePassword('recovery-token', 'newpass')}>update password</button>
    </>
  );
}

function ErrorConsumer() {
  const { isLoading, requestPasswordReset } = useAuth();
  const [message, setMessage] = useState('');
  if (isLoading) return <div>loading</div>;
  return (
    <>
      <button onClick={async () => {
        const result = await requestPasswordReset('pilot@example.com');
        setMessage(result.error || 'success');
      }}>request reset</button>
      <output>{message}</output>
    </>
  );
}

describe('AuthContext password recovery', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('sends recovery actions through the same-origin auth API', async () => {
    const requests: Array<RequestInit | undefined> = [];
    global.fetch = vi.fn(async (_url: string, options?: RequestInit) => {
      requests.push(options);
      return {
        ok: true,
        json: async () => options?.method === 'POST' ? { ok: true } : { user: null },
      } as Response;
    }) as typeof fetch;

    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await screen.findByRole('button', { name: 'request reset' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'request reset' }));
    await user.click(screen.getByRole('button', { name: 'update password' }));

    await waitFor(() => expect(requests).toHaveLength(3));
    expect(JSON.parse(String(requests[1]?.body))).toEqual({
      action: 'request-password-reset',
      email: 'pilot@example.com',
    });
    expect(JSON.parse(String(requests[2]?.body))).toEqual({
      action: 'update-password',
      accessToken: 'recovery-token',
      password: 'newpass',
    });
    expect(localStorage.getItem('ftf_session')).toBeNull();
  });

  test('returns a safe recovery error instead of rejecting the UI action', async () => {
    global.fetch = vi.fn(async (_url: string, options?: RequestInit) => ({
      ok: options?.method !== 'POST',
      json: async () => options?.method === 'POST'
        ? { error: 'Password recovery email could not be sent.' }
        : { user: null },
    } as Response)) as typeof fetch;

    render(<AuthProvider><ErrorConsumer /></AuthProvider>);
    const button = await screen.findByRole('button', { name: 'request reset' });
    await userEvent.click(button);

    expect(await screen.findByText('Password recovery email could not be sent.')).toBeVisible();
  });
});
