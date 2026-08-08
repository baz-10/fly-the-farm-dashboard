import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProductMaturitySurface } from '../ProductMaturitySurface';
import { WorkflowMaturityBoundary } from '../WorkflowMaturityBoundary';

const location = (pathname: string, search = '') => ({ pathname, search });

describe('ProductMaturitySurface', () => {
  test('keeps a Beta route usable while providing a page-level indicator', () => {
    render(
      <ProductMaturitySurface location={location('/')}>
        <button type="button">Create briefing</button>
      </ProductMaturitySurface>
    );

    expect(screen.getByText('Beta')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create briefing' })).toBeEnabled();
  });

  test('replaces a Coming Soon route before its child can perform a browser write', () => {
    const write = jest.spyOn(Storage.prototype, 'setItem');
    const BrowserWritingChild = () => {
      window.localStorage.setItem('quote-draft', 'written');
      return <button type="button">Create quote</button>;
    };

    render(
      <ProductMaturitySurface location={location('/quotes')}>
        <BrowserWritingChild />
      </ProductMaturitySurface>
    );

    expect(screen.getByRole('heading', { name: 'Quotes' })).toBeVisible();
    expect(screen.getByText('Coming Soon')).toBeVisible();
    expect(screen.getByText('Quotes will be available in a future release.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Create quote' })).not.toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();

    write.mockRestore();
  });

  test('does not add maturity badge clutter to an Operationally Ready route', () => {
    render(
      <ProductMaturitySurface location={location('/aircraft')}>
        <button type="button">Add aircraft</button>
      </ProductMaturitySurface>
    );

    expect(screen.getByRole('button', { name: 'Add aircraft' })).toBeEnabled();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    expect(screen.queryByText('Coming Soon')).not.toBeInTheDocument();
  });
});

describe('WorkflowMaturityBoundary', () => {
  test('uses the explicit workflow maturity instead of the parent module maturity', () => {
    render(
      <WorkflowMaturityBoundary moduleCode="personnel" workflowCode="casa-credentials">
        <button type="button">Manage CASA credentials</button>
      </WorkflowMaturityBoundary>
    );

    expect(screen.getByText('Beta')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Manage CASA credentials' })).toBeEnabled();
  });
});
