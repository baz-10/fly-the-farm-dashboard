import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Layout from '../Layout';

const mockLogout = jest.fn();

jest.mock(
  'react-router-dom',
  () => {
    const { TextDecoder, TextEncoder } = jest.requireActual('util');
    Object.assign(global, { TextDecoder, TextEncoder });
    return jest.requireActual('../../../node_modules/react-router/dist/development/index.js');
  },
  { virtual: true },
);

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'admin',
      tier: 'pro',
    },
    logout: mockLogout,
  }),
}));

function CurrentPath() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
}

test('uses grouped navigation in the desktop rail and mobile drawer', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<CurrentPath />} />
          <Route path="weather" element={<CurrentPath />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('button', { name: 'Open navigation' }));

  expect(
    screen.getAllByRole('list', { name: 'Primary navigation', hidden: true }),
  ).toHaveLength(2);

  const mobileNavigation = within(
    screen.getByRole('list', { name: 'Primary navigation' }),
  );
  [
    'Daily operations',
    'Operational resources',
    'Safety and compliance',
    'Commercial',
    'Support and administration',
  ].forEach((heading) => {
    expect(mobileNavigation.getByRole('button', { name: heading })).toBeInTheDocument();
  });
  expect(mobileNavigation.getByRole('button', { name: 'Daily operations' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  await user.click(mobileNavigation.getByRole('link', { name: 'Weather' }));

  expect(screen.getByTestId('current-path')).toHaveTextContent('/weather');
});
