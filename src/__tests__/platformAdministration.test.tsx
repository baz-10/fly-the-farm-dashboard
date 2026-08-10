import React from 'react';
import { render, screen } from '@testing-library/react';
import PlatformAdmin from '../pages/PlatformAdmin';

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { permissions: [] } }) }));

describe('Platform Administration', () => {
  it('is a Spray Command surface without organisation branding', () => {
    render(<PlatformAdmin />);
    expect(screen.getByRole('heading', { name: 'Platform Administration' })).toBeInTheDocument();
    expect(screen.getByText(/no automatic access to organisation operational data/i)).toBeInTheDocument();
    expect(screen.queryByText(/fly the farm/i)).not.toBeInTheDocument();
  });
});
