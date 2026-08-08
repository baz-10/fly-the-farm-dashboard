import React from 'react';
import { render, screen } from '@testing-library/react';
import ComplianceMenu from './ComplianceMenu';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(), useLocation: () => ({ pathname: '/compliance/library' }),
}), { virtual: true });

test('uses customer-safe future availability language for constrained compliance forms', () => {
  render(<ComplianceMenu />);

  expect(screen.getAllByText('Available in a future release')).toHaveLength(7);
  expect(screen.queryByText('Development in progress')).not.toBeInTheDocument();
});
