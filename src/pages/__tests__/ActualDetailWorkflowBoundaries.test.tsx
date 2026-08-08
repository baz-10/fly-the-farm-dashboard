import React from 'react';
import { render, screen } from '@testing-library/react';
import ActualDetail from '../ActualDetail';
import { ProductMaturitySurface } from '../../components/productMaturity/ProductMaturitySurface';
import { PRODUCT_MATURITY_REGISTRY } from '../../productMaturity/registry';
import { ProductMaturityEntry } from '../../productMaturity/types';

const actual = {
  id: 'actual-1', contractorUserId: 'user-1', title: 'August Mission Actual', startDate: '2026-08-01', endDate: '2026-08-01',
  dailyHours: [{ date: '2026-08-01', hours: 2 }], totalDays: 1, totalHours: 2, status: 'draft', rateType: 'hourly',
  rate: 100, revenue: 200, effectiveHourlyRate: 100, revenueNotes: '', chemicalCost: 0, totalCost: 100,
  grossProfit: 100, grossMarginPercent: 50, equipment: { kitSelections: [], actualFlightHours: 1, fuelTotal: 0, fuelBreakdown: [] },
  labour: { pilotCount: 1, pilotHours: 2, pilotRatePerHour: 50, hasChemOperator: false, chemOpHours: 0, chemOpRatePerHour: 0, additionalLabour: [] },
  travel: { kilometres: 0, vehicleCostPerKm: 0, vehicleTotal: 0, accommodation: 0, accommodationBreakdown: [], meals: 0, mealsBreakdown: [] },
  repairs: { items: [] }, otherCosts: { items: [] }, notes: '', lessonsLearned: '', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
};

jest.mock('react-router-dom', () => ({ useParams: () => ({ actualId: 'actual-1' }), useNavigate: () => jest.fn() }), { virtual: true });
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../services/financialsStore', () => ({ getActualById: () => actual, updateActual: jest.fn(), deleteActual: jest.fn() }));
jest.mock('../../services/fieldManagementStore', () => ({ getClientById: () => undefined }));
jest.mock('../../services/quoteStore', () => ({ getQuoteById: () => undefined, getKitById: () => undefined }));
jest.mock('../../utils/actualReportPdf', () => ({ generateActualReport: jest.fn() }));

test('keeps Actual record controls and operational PDF available while narrow financial workflows are constrained', () => {
  const entry = (PRODUCT_MATURITY_REGISTRY as ProductMaturityEntry[]).find(item => item.moduleCode === 'financials' && item.workflowCode === null)!;
  const marginEntry = (PRODUCT_MATURITY_REGISTRY as ProductMaturityEntry[]).find(item => item.moduleCode === 'financials' && item.workflowCode === 'margin-analysis')!;
  const invoiceEntry = (PRODUCT_MATURITY_REGISTRY as ProductMaturityEntry[]).find(item => item.moduleCode === 'financials' && item.workflowCode === 'invoice-export')!;
  const previous = entry.maturity;
  const previousMargin = marginEntry.maturity;
  const previousInvoice = invoiceEntry.maturity;
  entry.maturity = 'OPERATIONALLY_READY';
  marginEntry.maturity = 'COMING_SOON';
  invoiceEntry.maturity = 'COMING_SOON';
  try {
    render(<ProductMaturitySurface pathname="/financials/actual-1" search=""><ActualDetail /></ProductMaturitySurface>);

    expect(screen.getByText('August Mission Actual')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Finalise' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
    expect(screen.getByRole('heading', { name: 'Margin Analysis' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Invoice Export' })).toBeVisible();
    expect(screen.queryByText('50.0%')).not.toBeInTheDocument();
  } finally { entry.maturity = previous; marginEntry.maturity = previousMargin; invoiceEntry.maturity = previousInvoice; }
});
