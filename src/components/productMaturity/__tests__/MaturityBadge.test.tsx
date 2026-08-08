import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MaturityBadge } from '../MaturityBadge';
import { ProductMaturityEntry } from '../../../productMaturity/types';

const entry = (maturity: ProductMaturityEntry['maturity']): ProductMaturityEntry => ({
  moduleCode: 'test-module',
  workflowCode: null,
  customerName: 'Test Module',
  maturity,
  owner: 'Product',
  priority: 'P1',
  promotionBlockers: maturity === 'OPERATIONALLY_READY' || maturity === 'COMMERCIALLY_READY' ? [] : ['Complete customer acceptance.'],
  evidence: ['src/test.tsx'],
  requiredAutomatedTests: ['Maturity presentation test'],
  requiredManualAcceptance: ['Review presentation'],
  requiredOperationalEvidence: ['Private beta use'],
  targetPromotionMilestone: 'Gate 1',
  reviewDate: '2026-09-08',
  changelogReference: 'test',
});

describe('MaturityBadge', () => {
  test.each(['COMMERCIALLY_READY', 'OPERATIONALLY_READY'] as const)(
    'does not add a status badge for %s workspaces',
    maturity => {
      render(<MaturityBadge entry={entry(maturity)} />);

      expect(screen.queryByText('Beta')).not.toBeInTheDocument();
      expect(screen.queryByText('Coming Soon')).not.toBeInTheDocument();
    }
  );

  test('labels beta workspaces with an accessible explanation', async () => {
    render(<MaturityBadge entry={entry('BETA')} />);

    const badge = screen.getByLabelText('Beta');
    expect(screen.getByText('Beta')).toBeVisible();
    expect(badge).toHaveAccessibleName('Beta');

    act(() => badge.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'This feature is available during Private Commercial Beta and is still being refined.'
    );
  });

  test('only shows a Coming Soon badge when the caller is presenting an unavailable destination', () => {
    const { rerender } = render(<MaturityBadge entry={entry('COMING_SOON')} />);

    expect(screen.queryByText('Coming Soon')).not.toBeInTheDocument();

    rerender(<MaturityBadge entry={entry('COMING_SOON')} showComingSoon />);
    expect(screen.getByText('Coming Soon')).toBeVisible();
  });

  test('never presents internal maturity language to customers', () => {
    const { container } = render(<MaturityBadge entry={entry('BETA')} />);

    expect(container.textContent).not.toMatch(/legacy|experimental|unfinished|unsafe/i);
  });

  test('can remain presentational inside an existing navigation control', () => {
    render(<MaturityBadge entry={entry('BETA')} interactive={false} />);

    expect(screen.getByLabelText('Beta')).not.toHaveAttribute('tabindex', '0');
  });
});
