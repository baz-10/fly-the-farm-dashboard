import { clearRecoveryUrl, parseRecoveryFragment } from '../passwordRecovery';

describe('password recovery links', () => {
  test('extracts a valid recovery access token', () => {
    expect(parseRecoveryFragment('#access_token=abc%20123&type=recovery')).toEqual({
      accessToken: 'abc 123',
      isRecovery: true,
      error: null,
    });
  });

  test('rejects fragments that are not password recovery sessions', () => {
    expect(parseRecoveryFragment('#access_token=abc&type=signup')).toEqual({
      accessToken: null,
      isRecovery: false,
      error: 'This password recovery link is invalid or has expired.',
    });
  });

  test('surfaces the safe Supabase recovery error description', () => {
    expect(parseRecoveryFragment('#error=access_denied&error_description=Email+link+is+invalid+or+has+expired')).toEqual({
      accessToken: null,
      isRecovery: false,
      error: 'Email link is invalid or has expired',
    });
  });

  test('removes token fragments while retaining the route and query string', () => {
    window.history.replaceState({}, '', '/reset-password?source=email#access_token=secret&type=recovery');

    clearRecoveryUrl();

    expect(window.location.pathname).toBe('/reset-password');
    expect(window.location.search).toBe('?source=email');
    expect(window.location.hash).toBe('');
  });
});
