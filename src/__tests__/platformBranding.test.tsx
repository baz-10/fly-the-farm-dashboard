import React from 'react';
import { render, screen } from '@testing-library/react';
import Login from '../pages/Login';
import { PlatformBrand } from '../brand/PlatformBrand';

jest.mock('react-router-dom', () => ({
  Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <a {...props}>{children}</a>,
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ login: jest.fn() }),
}));

describe('Spray Command platform identity', () => {
  it('renders the repository-controlled waypoint brand', () => {
    render(<PlatformBrand />);

    expect(screen.getByLabelText('Spray Command')).toBeInTheDocument();
    expect(screen.getByText('SPRAY COMMAND')).toBeInTheDocument();
    expect(screen.getByTestId('spray-command-waypoint-mark')).toBeInTheDocument();
  });

  it('uses Spray Command rather than organisation branding on login', () => {
    render(<Login />);

    expect(screen.getByLabelText('Spray Command')).toBeInTheDocument();
    expect(screen.queryByText(/fly the farm/i)).not.toBeInTheDocument();
  });
});
