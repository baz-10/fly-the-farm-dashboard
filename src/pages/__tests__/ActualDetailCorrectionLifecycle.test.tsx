import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActualDetail from '../ActualDetail';

const actualId = '10000000-0000-4000-8000-000000000001';
const finalId = '20000000-0000-4000-8000-000000000002';
const draftId = '30000000-0000-4000-8000-000000000003';
const mockRead = jest.fn();
const mockHistory = jest.fn();
const mockCorrection = jest.fn();
const mockHistorical = jest.fn();
const mockArchive = jest.fn();
Object.defineProperty(global, 'crypto', { configurable: true, value: { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) } });

jest.mock('react-router-dom', () => ({ useParams: () => ({ actualId }), useNavigate: () => jest.fn() }), { virtual: true });
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: actualId, role: 'admin', tenantId: actualId, permissions: ['financial_actuals.read', 'financial_actuals.update', 'financial_actuals.archive'] } }),
}));
jest.mock('../../services/financialActualsApi', () => ({
  createFinancialActualsApi: () => ({
    read: (...args: unknown[]) => mockRead(...args),
    revisionHistory: (...args: unknown[]) => mockHistory(...args),
    historicalRevision: (...args: unknown[]) => mockHistorical(...args),
    createCorrection: (...args: unknown[]) => mockCorrection(...args),
    archive: (...args: unknown[]) => mockArchive(...args),
    prefill: jest.fn(), updateDraft: jest.fn(), acceptPrefill: jest.fn(), finalise: jest.fn(),
  }),
  FinancialActualApiError: class extends Error { code = 'TEST'; },
}));

const frozen = { id: finalId, revisionNumber: 1, status: 'FINAL', rowVersion: 3, currencyCode: 'AUD', formulaVersion: 'FINANCIAL_ACTUAL_V1', startDate: '2026-08-20', endDate: '2026-08-20', input: {}, provenance: { rows: [] }, calculation: { operationalDays: 1, totalHours: '3.0000', revenue: '300.0000', totalCost: '1.0000', grossProfit: '299.0000', grossMarginPercentage: '99.6667' }, sourceManifest: {}, inputDigest: 'a'.repeat(64), finalisedAt: '2026-08-20T00:00:00Z', finalisedByInternalUserId: actualId };
const detail = (withDraft = false): any => ({ schemaVersion: 'FINANCIAL_ACTUAL_AUTHORITY_DETAIL_V1', record: { id: actualId, reference: 'FA-000001', organisationId: actualId, operatingLocationId: actualId, clientId: actualId, propertyId: actualId, fieldId: actualId, jobId: actualId, missionId: null, rowVersion: withDraft ? 3 : 2, archivedAt: null, currentFinalRevisionId: finalId, activeDraftRevisionId: withDraft ? draftId : null }, hierarchy: { client: { id: actualId, label: 'Fly The Farm' }, job: { id: actualId, label: 'JOB-1' } }, draft: withDraft ? { id: draftId, revisionNumber: 2, status: 'DRAFT', rowVersion: 1, currencyCode: 'AUD', formulaVersion: 'FINANCIAL_ACTUAL_V1', startDate: '2026-08-20', endDate: '2026-08-20', operationalSources: {}, revenueInputs: { 'revenue/mode': 'HOURLY', 'revenue/hourlyRate': '100.000000' }, workEntries: [], costLines: [], provenance: [] } : null, final: frozen, sourceDrift: { status: 'UNCHANGED' } });
const history = (withDraft = false): any => ({ schemaVersion: 'FINANCIAL_ACTUAL_REVISION_HISTORY_V1', financialActualId: actualId, reference: 'FA-000001', archivedAt: null, currentFinalRevisionId: finalId, activeDraftRevisionId: withDraft ? draftId : null, nextBeforeRevisionNumber: null, rows: [...(withDraft ? [{ id: draftId, revisionNumber: 2, status: 'DRAFT', rowVersion: 1, predecessorRevisionId: finalId, correctionReason: 'Correct product cost', formulaVersion: 'FINANCIAL_ACTUAL_V1', finalisedAt: null, finalisedByInternalUserId: null, current: false, activeDraft: true }] : []), { id: finalId, revisionNumber: 1, status: 'FINAL', rowVersion: 3, predecessorRevisionId: null, correctionReason: null, formulaVersion: 'FINANCIAL_ACTUAL_V1', finalisedAt: '2026-08-20T00:00:00Z', finalisedByInternalUserId: actualId, current: true, activeDraft: false }] });

beforeEach(() => { jest.clearAllMocks(); mockRead.mockResolvedValue(detail()); mockHistory.mockResolvedValue(history()); mockCorrection.mockResolvedValue({}); });

test('creates a correction with a mandatory reason while retaining the current FINAL authority', async () => {
  mockRead.mockResolvedValueOnce(detail()).mockResolvedValue(detail(true));
  mockHistory.mockResolvedValueOnce(history()).mockResolvedValue(history(true));
  render(<ActualDetail />);
  expect(await screen.findByRole('heading', { name: 'Frozen FINAL result' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Correct Financial Actual' }));
  expect(screen.getByRole('button', { name: 'Create correction Draft' })).toBeDisabled();
  await userEvent.type(screen.getByLabelText('Correction reason'), 'Correct product cost');
  await userEvent.click(screen.getByRole('button', { name: 'Create correction Draft' }));
  await waitFor(() => expect(mockCorrection).toHaveBeenCalledWith({ actualId, expectedAggregateVersion: 2, expectedFinalRevisionId: finalId, expectedFinalRevisionVersion: 3, correctionReason: 'Correct product cost' }));
  expect(await screen.findByText(/existing FINAL remains authoritative/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: /discard|abandon/i })).not.toBeInTheDocument();
});

test('shows archive blocked by a correction Draft and preserves historical FINAL navigation', async () => {
  mockRead.mockResolvedValue(detail(true));
  mockHistory.mockResolvedValue(history(true));
  mockHistorical.mockResolvedValue({ schemaVersion: 'FINANCIAL_ACTUAL_HISTORICAL_REVISION_V1', financialActualId: actualId, reference: 'FA-000001', archivedAt: null, current: true, revision: { ...frozen, predecessorRevisionId: null, correctionReason: null } });
  render(<ActualDetail />);
  expect(await screen.findByText('Archive unavailable while correction Draft exists.')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Frozen FINAL result' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Revision 1' }));
  await waitFor(() => expect(mockHistorical).toHaveBeenCalledWith({ actualId, revisionId: finalId }));
  expect(await screen.findByText('Historical frozen authority')).toBeVisible();
});
