import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProductMaturitySurface } from '../ProductMaturitySurface';
import { WorkflowMaturityBoundary } from '../WorkflowMaturityBoundary';
import { PRODUCT_MATURITY_REGISTRY } from '../../../productMaturity/registry';
import { ProductMaturityEntry } from '../../../productMaturity/types';

describe('ProductMaturitySurface', () => {
  test('resolves a Beta route from its pathname and search props while keeping children usable', () => {
    render(
      <ProductMaturitySurface pathname="/" search="">
        <button type="button">Create briefing</button>
      </ProductMaturitySurface>
    );

    expect(screen.getByText('Beta')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create briefing' })).toBeEnabled();
  });

  test('resolves a Coming Soon route from its pathname and search props before its child can write', () => {
    const write = jest.spyOn(Storage.prototype, 'setItem');
    const BrowserWritingChild = () => {
      window.localStorage.setItem('quote-draft', 'written');
      return <button type="button">Create quote</button>;
    };

    render(
      <ProductMaturitySurface pathname="/quotes" search="">
        <BrowserWritingChild />
      </ProductMaturitySurface>
    );

    expect(screen.getByRole('heading', { name: 'Quotes' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Quotes', level: 1 })).toBeVisible();
    expect(screen.getByText('Coming Soon')).toBeVisible();
    expect(screen.getByText('Quotes will be available in a future release.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Create quote' })).not.toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();

    write.mockRestore();
  });

  test('does not add maturity badge clutter to an Operationally Ready route', () => {
    render(
      <ProductMaturitySurface pathname="/aircraft" search="">
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

  test('does not repeat presentation when an exact workflow override matches its parent module maturity', () => {
    const registry = PRODUCT_MATURITY_REGISTRY as ProductMaturityEntry[];
    const moduleEntry = registry.find(entry => entry.moduleCode === 'personnel' && entry.workflowCode === null)!;
    const previousMaturity = moduleEntry.maturity;
    moduleEntry.maturity = 'BETA';

    try {
      render(
        <ProductMaturitySurface pathname="/personnel" search="">
          <WorkflowMaturityBoundary moduleCode="personnel" workflowCode="casa-credentials">
            <button type="button">Manage CASA credentials</button>
          </WorkflowMaturityBoundary>
        </ProductMaturitySurface>
      );

      expect(screen.getByRole('button', { name: 'Manage CASA credentials' })).toBeEnabled();
      expect(screen.getAllByText('Beta')).toHaveLength(1);
    } finally {
      moduleEntry.maturity = previousMaturity;
    }
  });

  test('uses a nested heading for an unavailable workflow inside an existing page', () => {
    render(
      <WorkflowMaturityBoundary moduleCode="organisation-administration" workflowCode="network-source-manager">
        <button type="button">Manage network sources</button>
      </WorkflowMaturityBoundary>
    );

    expect(screen.getByRole('heading', { name: 'Organisation Network and Source Manager', level: 2 })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Organisation Network and Source Manager', level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage network sources' })).not.toBeInTheDocument();
  });

  test('fails closed without mounting an unsafe child when an Admin workflow code is mistyped', () => {
    const unsafeChildMount = jest.fn();
    const UnsafeChild = () => {
      unsafeChildMount();
      return <button type="button">Write browser-local network source</button>;
    };

    render(
      <WorkflowMaturityBoundary moduleCode="organisation-administration" workflowCode="network-source-managr">
        <UnsafeChild />
      </WorkflowMaturityBoundary>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('This workflow is unavailable');
    expect(unsafeChildMount).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Write browser-local network source' })).not.toBeInTheDocument();
  });

  test('fails closed without mounting an unsafe child when Admin workflow metadata is deleted', () => {
    const registry = PRODUCT_MATURITY_REGISTRY as ProductMaturityEntry[];
    const workflowIndex = registry.findIndex(entry => entry.moduleCode === 'organisation-administration'
      && entry.workflowCode === 'network-source-manager');
    expect(workflowIndex).toBeGreaterThanOrEqual(0);
    const [deletedWorkflow] = registry.splice(workflowIndex, 1);
    const unsafeChildMount = jest.fn();
    const UnsafeChild = () => {
      unsafeChildMount();
      return <button type="button">Write browser-local network source</button>;
    };

    try {
      render(
        <WorkflowMaturityBoundary moduleCode="organisation-administration" workflowCode="network-source-manager">
          <UnsafeChild />
        </WorkflowMaturityBoundary>
      );
    } finally {
      registry.splice(workflowIndex, 0, deletedWorkflow);
    }

    expect(screen.getByRole('alert')).toHaveTextContent('This workflow is unavailable');
    expect(unsafeChildMount).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Write browser-local network source' })).not.toBeInTheDocument();
  });
});
