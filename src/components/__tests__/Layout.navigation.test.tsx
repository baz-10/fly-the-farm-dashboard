import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Layout from '../Layout';

const mockLogout = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
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

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQueryList = {
    media: '(min-width:1200px)',
    get matches() {
      return matches;
    },
    onchange: null,
    addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => mediaQueryList),
  });

  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches, media: mediaQueryList.media } as MediaQueryListEvent;
      listeners.forEach(listener => listener(event));
    },
  };
}

function renderLayout() {
  return render(
    <MemoryRouter
      initialEntries={['/']}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<CurrentPath />} />
          <Route path="weather" element={<CurrentPath />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mockLogout.mockClear();
});

test('renders compact desktop group headings with tooltips', async () => {
  installMatchMedia(true);
  const user = userEvent.setup();
  renderLayout();

  expect(
    screen.getAllByRole('list', { name: 'Primary navigation', hidden: true }),
  ).toHaveLength(1);

  const desktopNavigation = within(
    screen.getByRole('list', { name: 'Primary navigation' }),
  );
  const dailyHeading = desktopNavigation.getByRole('button', { name: 'Daily operations' });
  expect(dailyHeading).toHaveAttribute('aria-expanded', 'true');
  expect(desktopNavigation.queryByText('Daily operations')).not.toBeInTheDocument();

  await user.hover(dailyHeading);

  expect(await screen.findByRole('tooltip')).toHaveTextContent('Daily operations');
});

test('mounts one responsive navigation and reloads saved groups after breakpoint changes', () => {
  const matchMedia = installMatchMedia(true);
  renderLayout();

  expect(
    screen.getAllByRole('list', { name: 'Primary navigation', hidden: true }),
  ).toHaveLength(1);
  const desktopNavigation = within(screen.getByRole('list', { name: 'Primary navigation' }));
  fireEvent.click(desktopNavigation.getByRole('button', { name: 'Operational resources' }));
  expect(localStorage.getItem('ftf_navigation_groups:admin-1')).toContain('resources');

  act(() => matchMedia.setMatches(false));

  expect(screen.queryByRole('list', { name: 'Primary navigation', hidden: true })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

  expect(
    screen.getAllByRole('list', { name: 'Primary navigation', hidden: true }),
  ).toHaveLength(1);
  const mobileNavigation = within(screen.getByRole('list', { name: 'Primary navigation' }));
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
  expect(mobileNavigation.getByRole('button', { name: 'Operational resources' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  act(() => matchMedia.setMatches(true));

  expect(
    screen.getAllByRole('list', { name: 'Primary navigation', hidden: true }),
  ).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Operational resources' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  act(() => matchMedia.setMatches(false));

  expect(screen.queryByRole('list', { name: 'Primary navigation', hidden: true })).not.toBeInTheDocument();
});

test('opens the grouped mobile drawer and closes it after navigation', async () => {
  installMatchMedia(false);
  const user = userEvent.setup();
  renderLayout();

  expect(screen.queryByRole('list', { name: 'Primary navigation', hidden: true })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Open navigation' }));

  expect(
    screen.getAllByRole('list', { name: 'Primary navigation', hidden: true }),
  ).toHaveLength(1);
  const mobileNavigation = within(screen.getByRole('list', { name: 'Primary navigation' }));
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
  await waitFor(() => {
    expect(screen.queryByRole('list', { name: 'Primary navigation', hidden: true })).not.toBeInTheDocument();
  });
});
