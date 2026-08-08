import React from 'react';
import { render, screen } from '@testing-library/react';
import QuoteDetail from '../QuoteDetail';
import { ProductMaturitySurface } from '../../components/productMaturity/ProductMaturitySurface';
import { PRODUCT_MATURITY_REGISTRY } from '../../productMaturity/registry';
import { ProductMaturityEntry } from '../../productMaturity/types';

jest.mock('react-router-dom', () => ({ useParams: () => ({ quoteId: 'quote-1' }), useNavigate: () => jest.fn() }), { virtual: true });
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../services/fieldManagementStore', () => ({ getClients: () => [{ id: 'client-1', name: 'Farm Client' }], getPropertiesByClient: () => [] }));
jest.mock('../../services/quoteStore', () => ({
  getQuoteById: () => ({
    id: 'quote-1', quoteNumber: 'Q-001', status: 'draft', clientId: 'client-1', propertyId: 'property-1',
    fieldIds: [], jobIds: [], createdAt: '2026-08-09T00:00:00Z', validUntil: '2026-09-09', lineItems: [],
    subtotal: 100, gst: 10, total: 110, notes: '', terms: '',
  }),
  updateQuote: jest.fn(), deleteQuote: jest.fn(), getQuoteConfig: () => null,
}));

test('keeps Quote Detail controls available while constraining only PDF export', () => {
  const entry = (PRODUCT_MATURITY_REGISTRY as ProductMaturityEntry[]).find(item => item.moduleCode === 'quotes' && item.workflowCode === null)!;
  const workflowEntry = (PRODUCT_MATURITY_REGISTRY as ProductMaturityEntry[]).find(item => item.moduleCode === 'quotes' && item.workflowCode === 'pdf-export')!;
  const previous = entry.maturity;
  const previousWorkflow = workflowEntry.maturity;
  entry.maturity = 'OPERATIONALLY_READY';
  workflowEntry.maturity = 'COMING_SOON';
  try {
    render(<ProductMaturitySurface pathname="/quotes/quote-1" search=""><QuoteDetail /></ProductMaturitySurface>);

    expect(screen.getByRole('heading', { name: 'Q-001', level: 4 })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(screen.getByRole('heading', { name: 'Quote PDF Export' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Print' })).not.toBeInTheDocument();
  } finally { entry.maturity = previous; workflowEntry.maturity = previousWorkflow; }
});
