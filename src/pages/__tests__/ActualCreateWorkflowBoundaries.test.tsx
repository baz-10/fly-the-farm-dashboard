import React from 'react';
import { render, screen } from '@testing-library/react';
import ActualCreate from '../ActualCreate';
import { ProductMaturitySurface } from '../../components/productMaturity/ProductMaturitySurface';
import { PRODUCT_MATURITY_REGISTRY } from '../../productMaturity/registry';
import { ProductMaturityEntry } from '../../productMaturity/types';

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../services/fieldManagementStore', () => ({ getClients: () => [], getJobs: () => [], getClientById: () => undefined, getJobById: () => undefined }));
jest.mock('../../services/quoteStore', () => ({ getQuotes: () => [], getQuoteById: () => undefined, getKits: () => [] }));
jest.mock('../../services/financialsStore', () => ({ saveActual: jest.fn() }));

test('keeps Actual creation available while margin analysis and invoice export remain constrained', () => {
  const entry = (PRODUCT_MATURITY_REGISTRY as ProductMaturityEntry[]).find(item => item.moduleCode === 'financials' && item.workflowCode === null)!;
  const previous = entry.maturity;
  entry.maturity = 'OPERATIONALLY_READY';
  try {
    render(<ProductMaturitySurface pathname="/financials/new" search=""><ActualCreate /></ProductMaturitySurface>);

    expect(screen.getByRole('button', { name: 'Save Actual' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Margin Analysis' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Invoice Export' })).toBeVisible();
    expect(screen.queryByText('P&L Summary')).not.toBeInTheDocument();
  } finally { entry.maturity = previous; }
});
