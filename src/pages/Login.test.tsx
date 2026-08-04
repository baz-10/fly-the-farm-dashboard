import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../theme/theme';
import Login from './Login';

const mockLogin = jest.fn();

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => jest.fn(),
}), { virtual: true });

function renderLogin(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
  return render(<ThemeProvider theme={theme}><Login /></ThemeProvider>);
}

describe.each([
  ['mobile', 375],
  ['tablet', 768],
  ['desktop', 1440],
])('login authentication actions at %s width', (_label, width) => {
  test('keeps recovery and registration visible, separated and in normal flow', () => {
    renderLogin(width as number);

    const signIn = screen.getByRole('button', { name: 'Sign In' });
    const forgot = screen.getByRole('link', { name: 'Forgot password?' });
    const create = screen.getByRole('link', { name: 'Create account' });
    const divider = screen.getByRole('separator');
    const recoveryRow = forgot.parentElement as HTMLElement;

    expect(forgot).toBeVisible();
    expect(create).toBeVisible();
    expect(signIn.compareDocumentPosition(forgot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(forgot.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(divider.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getComputedStyle(recoveryRow).position).not.toBe('absolute');
    expect(getComputedStyle(recoveryRow).marginTop).not.toMatch(/^-/);
  });
});
