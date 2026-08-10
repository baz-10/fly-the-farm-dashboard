import React from 'react';
import { render, screen } from '@testing-library/react';
import Login from '../pages/Login';

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }: React.PropsWithChildren<{ to: string }>) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ login: jest.fn() }) }));

test('sends public Create account traffic to the commercial application', () => {
  render(<Login />);

  expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/apply');
});
