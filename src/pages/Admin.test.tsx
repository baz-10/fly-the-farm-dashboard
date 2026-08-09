import React from 'react';
import { render, screen } from '@testing-library/react';
import Admin from './Admin';

const mockGetAllContractorStats = jest.fn(() => []);
const mockGetAllClientsUnscoped = jest.fn(() => []);
const mockGetJobs = jest.fn(() => []);

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
jest.mock('../services/fieldManagementStore', () => ({
  getAllContractorStats: () => mockGetAllContractorStats(),
  getAllClientsUnscoped: () => mockGetAllClientsUnscoped(),
  getJobs: () => mockGetJobs(),
}));
jest.mock('../components/admin/OrganisationBranding', () => () => <div>Organisation Branding available</div>);
jest.mock('../components/admin/OrganisationSupportAccess', () => () => <div>Organisation Assisted Support available</div>);
jest.mock('../components/AuthoritativeChemicalReviews', () => () => <div>Authoritative Chemical Reviews available</div>);
jest.mock('../components/AdminSourceManager', () => () => <div>Browser-local network source manager</div>);
jest.mock('../components/AdminSourceExtraction', () => () => <div>Browser-local source extraction</div>);
jest.mock('../components/AdminDocumentSourcing', () => () => <div>Browser-local document sourcing</div>);
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }), { virtual: true });

beforeEach(() => {
  mockGetAllContractorStats.mockReturnValue([]);
  mockGetAllClientsUnscoped.mockReturnValue([]);
  mockGetJobs.mockReturnValue([]);
});

test('keeps safe Administration panels usable and constrains only exact browser-local workflows', () => {
  render(<Admin />);

  expect(screen.getByText('Organisation Branding available')).toBeVisible();
  expect(screen.getByText('Organisation Assisted Support available')).toBeVisible();
  expect(screen.getByText('Authoritative Chemical Reviews available')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Organisation Network and Source Manager' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Chemical Source Extraction' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Chemical Document Sourcing' })).toBeVisible();
  expect(screen.queryByText(/Browser-local/)).not.toBeInTheDocument();
  expect(mockGetAllContractorStats).not.toHaveBeenCalled();
  expect(mockGetAllClientsUnscoped).not.toHaveBeenCalled();
  expect(mockGetJobs).not.toHaveBeenCalled();
});
