import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupedNavigation } from '../GroupedNavigation';

describe('GroupedNavigation', () => {
  beforeEach(() => localStorage.clear());

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
});
