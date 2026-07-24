import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupedNavigation } from '../GroupedNavigation';

describe('GroupedNavigation', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => jest.restoreAllMocks());

  test('opens daily and active groups and permits multiple open groups', async () => {
    const user = userEvent.setup();
    render(
      <GroupedNavigation
        expanded
        pathname="/maintenance"
        role="contractor"
        userId="u1"
        onNavigate={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /daily operations/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /operational resources/i })).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: /safety and compliance/i }));

    expect(screen.getByRole('link', { name: /compliance/i })).toBeVisible();
    expect(screen.getByRole('link', { name: /maintenance/i })).toBeVisible();
  });

  test('calls onNavigate from a keyboard-operable item', async () => {
    const user = userEvent.setup();
    const onNavigate = jest.fn();
    render(<GroupedNavigation expanded pathname="/" role="admin" userId="u1" onNavigate={onNavigate} />);

    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Missions' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onNavigate).toHaveBeenCalledWith('/missions');
  });

  test('compact groups hide child tiles until expanded', async () => {
    const user = userEvent.setup();
    render(
      <GroupedNavigation
        expanded={false}
        pathname="/"
        role="admin"
        userId="u1"
        onNavigate={jest.fn()}
      />,
    );

    expect(screen.queryByRole('link', { name: /maintenance/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /operational resources/i }));

    expect(screen.getByRole('link', { name: /maintenance/i })).toBeVisible();
  });

  test('compact navigation uses readable light foreground and selected styling', () => {
    render(
      <GroupedNavigation
        expanded={false}
        pathname="/"
        role="admin"
        userId="u1"
        onNavigate={jest.fn()}
      />,
    );

    const daily = screen.getByRole('button', { name: /daily operations/i });
    expect(daily).toHaveStyle({ color: 'rgba(255, 255, 255, 0.92)' });
    expect(screen.getByRole('link', { name: 'Operations' })).toHaveAttribute('aria-current', 'page');
  });

  test('collapsed headings do not reference an unmounted region', () => {
    render(<GroupedNavigation expanded pathname="/" role="admin" userId="u1" onNavigate={jest.fn()} />);

    const heading = screen.getByRole('button', { name: /operational resources/i });
    expect(heading).not.toHaveAttribute('aria-controls');
  });

  test('persists toggles and keeps the active group open after a route change', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <GroupedNavigation expanded pathname="/" role="admin" userId="u1" onNavigate={jest.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /safety and compliance/i }));
    expect(localStorage.getItem('ftf_navigation_groups:u1')).toContain('safety');

    rerender(
      <GroupedNavigation
        expanded
        pathname="/maintenance"
        role="admin"
        userId="u1"
        onNavigate={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /operational resources/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /safety and compliance/i })).toHaveAttribute('aria-expanded', 'true');
  });

  test('does not allow the active route group to remain collapsed', async () => {
    const user = userEvent.setup();
    render(
      <GroupedNavigation
        expanded
        pathname="/maintenance"
        role="admin"
        userId="u1"
        onNavigate={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /operational resources/i }));

    expect(screen.getByRole('button', { name: /operational resources/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /maintenance/i })).toBeVisible();
  });

  test('reloads expansion preferences when the user changes without carrying state across users', async () => {
    const user = userEvent.setup();
    localStorage.setItem('ftf_navigation_groups:u1', JSON.stringify(['safety']));
    localStorage.setItem('ftf_navigation_groups:u2', JSON.stringify(['commercial']));
    const onNavigate = jest.fn();
    const { rerender } = render(
      <GroupedNavigation expanded pathname="/unknown" role="admin" userId="u1" onNavigate={onNavigate} />,
    );

    expect(screen.getByRole('button', { name: /safety and compliance/i })).toHaveAttribute('aria-expanded', 'true');

    rerender(
      <GroupedNavigation expanded pathname="/unknown" role="admin" userId="u2" onNavigate={onNavigate} />,
    );

    expect(screen.getByRole('button', { name: /safety and compliance/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /commercial/i })).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: /operational resources/i }));

    expect(JSON.parse(localStorage.getItem('ftf_navigation_groups:u1') || '[]')).toEqual(['safety']);
    expect(JSON.parse(localStorage.getItem('ftf_navigation_groups:u2') || '[]')).toEqual(
      expect.arrayContaining(['commercial', 'resources']),
    );
  });

  test('expands and collapses a group heading from the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <GroupedNavigation expanded pathname="/unknown" role="client" userId="u1" onNavigate={jest.fn()} />,
    );

    await user.tab();
    await user.tab();
    await user.tab();
    const resourcesHeading = screen.getByRole('button', { name: /operational resources/i });
    expect(resourcesHeading).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(resourcesHeading).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /database/i })).toBeVisible();

    await user.keyboard(' ');
    expect(resourcesHeading).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: /database/i })).not.toBeInTheDocument();
  });

  test('expands a group heading with touch pointer activation', async () => {
    const user = userEvent.setup();
    render(
      <GroupedNavigation expanded={false} pathname="/" role="admin" userId="u1" onNavigate={jest.fn()} />,
    );
    const resourcesHeading = screen.getByRole('button', { name: /operational resources/i });

    await user.pointer([
      { keys: '[TouchA>]', target: resourcesHeading },
      { keys: '[/TouchA]', target: resourcesHeading },
    ]);

    expect(resourcesHeading).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /maintenance/i })).toBeVisible();
  });

  test('keeps navigation functional when expansion persistence fails', async () => {
    const user = userEvent.setup();
    const onNavigate = jest.fn();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    render(<GroupedNavigation expanded pathname="/" role="admin" userId="u1" onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: /safety and compliance/i }));
    await user.click(screen.getByRole('link', { name: /compliance/i }));

    expect(onNavigate).toHaveBeenCalledWith('/compliance');
  });

  test('uses unique aria-controls relationships for simultaneous instances', () => {
    render(
      <>
        <GroupedNavigation expanded pathname="/maintenance" role="admin" userId="u1" onNavigate={jest.fn()} />
        <GroupedNavigation expanded pathname="/maintenance" role="admin" userId="u2" onNavigate={jest.fn()} />
      </>,
    );

    const headings = screen.getAllByRole('button', { name: /operational resources/i });
    const firstId = headings[0].getAttribute('aria-controls');
    const secondId = headings[1].getAttribute('aria-controls');

    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(firstId).not.toBe(secondId);
    expect(document.getElementById(firstId!)).toBeInTheDocument();
    expect(document.getElementById(secondId!)).toBeInTheDocument();
  });
});
