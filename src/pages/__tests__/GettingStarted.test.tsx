import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GettingStarted from '../GettingStarted';

const mockNavigate = jest.fn();
const mockRead = jest.fn();
let mockViewportWidth = 1440;

jest.mock('@mui/material', () => {
  const actual = jest.requireActual('@mui/material');
  return {
    ...actual,
    useMediaQuery: (query: string) => {
      const minimum = /min-width:\s*(\d+(?:\.\d+)?)px/.exec(query)?.[1];
      return minimum ? mockViewportWidth >= Number(minimum) : false;
    },
  };
});

jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('../../services/gettingStartedApi', () => ({
  gettingStartedApi: { read: () => mockRead() },
}));

const action = (code: string, label: string, route: string) => ({ code, label, route });
const projection = {
  organisation: { id: 'organisation-1', name: 'Western Downs Aerial Application', displayName: 'Western Downs Aerial Application' },
  base: null,
  operationalReadiness: { completedSteps: 1, requiredSteps: 9 },
  nextAction: { ...action('CONFIRM_BASE', 'Confirm your Base', '/getting-started#base'), stepCode: 'BASE' },
  steps: [
    { code: 'ORGANISATION', label: 'Organisation', state: 'COMPLETE', summary: 'Your organisation identity is active.', count: 1, optional: false, action: action('REVIEW_ORGANISATION', 'Review organisation details', '/admin') },
    { code: 'BASE', label: 'Base', state: 'NEEDS_ATTENTION', summary: 'Confirm the address and map location for your Base.', count: 1, optional: false, action: action('CONFIRM_BASE', 'Confirm your Base', '/getting-started#base') },
    { code: 'AIRCRAFT', label: 'Aircraft', state: 'NOT_STARTED', summary: 'Add the aircraft you will use for work.', count: 0, optional: false, action: action('ADD_AIRCRAFT', 'Add your first aircraft', '/aircraft') },
    { code: 'EQUIPMENT', label: 'Equipment', state: 'NOT_STARTED', summary: 'Add the equipment kit carried by your aircraft.', count: 0, optional: false, action: action('ADD_EQUIPMENT', 'Add your first equipment kit', '/aircraft') },
    { code: 'PERSONNEL', label: 'Personnel', state: 'OPTIONAL', summary: 'Add Personnel if your team will operate or authorise Missions.', count: 0, optional: true, action: action('ADD_PERSONNEL', 'Add Personnel', '/personnel') },
    { code: 'CLIENT', label: 'First Client', state: 'NOT_STARTED', summary: 'Add the first business or grower you will work for.', count: 0, optional: false, action: action('ADD_CLIENT', 'Add your first Client', '/jobs') },
    { code: 'PROPERTY', label: 'First Property', state: 'NOT_STARTED', summary: 'Add the first Property for a Client.', count: 0, optional: false, action: action('ADD_PROPERTY', 'Add your first Property', '/jobs?view=properties') },
    { code: 'FIELD', label: 'First Field', state: 'NOT_STARTED', summary: 'Add the first Field on a Property.', count: 0, optional: false, action: action('ADD_FIELD', 'Add your first Field', '/jobs?view=fields') },
    { code: 'JOB', label: 'First Job', state: 'NOT_STARTED', summary: 'Create the first Job for one or more Fields.', count: 0, optional: false, action: action('ADD_JOB', 'Add your first Job', '/jobs?view=jobs') },
    { code: 'MISSION', label: 'First Mission', state: 'NOT_STARTED', summary: 'Plan the first Mission from an authoritative Job.', count: 0, optional: false, action: action('ADD_MISSION', 'Plan your first Mission', '/missions/new') },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockViewportWidth = 1440;
  mockRead.mockResolvedValue(projection);
});

describe.each([
  ['mobile', 375],
  ['tablet', 768],
  ['desktop', 1440],
])('Getting Started at %s width', (_label, width) => {
  test('renders the intended summary columns with explicit horizontal-overflow containment', async () => {
    mockViewportWidth = width as number;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    window.dispatchEvent(new Event('resize'));

    render(<GettingStarted />);

    await screen.findByRole('heading', { name: 'Getting Started' });
    const recommendation = screen.getByRole('region', { name: 'Recommended next action' });
    const summary = recommendation.parentElement as HTMLElement;
    const root = summary.parentElement as HTMLElement;
    const progressCard = summary.firstElementChild as HTMLElement;

    expect(getComputedStyle(summary).flexDirection).toBe(width >= 900 ? 'row' : 'column');
    expect(getComputedStyle(root)).toMatchObject({
      width: '100%', maxWidth: '1120px', minWidth: '0', boxSizing: 'border-box', overflowWrap: 'anywhere',
    });
    expect(getComputedStyle(summary)).toMatchObject({ width: '100%', minWidth: '0' });
    expect(getComputedStyle(progressCard)).toMatchObject({ minWidth: '0', maxWidth: '100%' });
    expect(getComputedStyle(recommendation)).toMatchObject({ minWidth: '0', maxWidth: '100%' });
  });
});

test('welcomes the administrator with Base language and one prominent recommended action', async () => {
  render(<GettingStarted />);

  expect(await screen.findByRole('heading', { name: 'Getting Started' })).toBeVisible();
  expect(screen.getByText(/welcome to western downs aerial application/i)).toBeVisible();
  const recommendation = screen.getByRole('region', { name: 'Recommended next action' });
  expect(within(recommendation).getByRole('button', { name: 'Confirm your Base' })).toBeVisible();
  expect(screen.getAllByText(/Base/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/operating[_ -]?locations?/i)).not.toBeInTheDocument();
});

test('keeps completed steps keyboard-openable and navigates to established domain routes', async () => {
  const user = userEvent.setup();
  render(<GettingStarted />);
  await screen.findByRole('heading', { name: 'Getting Started' });

  const organisation = screen.getByRole('button', { name: /Organisation.*Complete/i });
  act(() => organisation.focus());
  await user.keyboard('{Enter}');
  expect(screen.getByRole('button', { name: 'Review organisation details' })).toBeVisible();

  const aircraft = screen.getByRole('button', { name: /Aircraft.*Not started/i });
  await user.click(aircraft);
  await user.click(screen.getByRole('button', { name: 'Add your first aircraft' }));
  expect(mockNavigate).toHaveBeenCalledWith('/aircraft');
});

test('moves keyboard focus to the Base section when the recommended Base action stays in this workspace', async () => {
  const user = userEvent.setup();
  render(<GettingStarted />);
  await screen.findByRole('heading', { name: 'Getting Started' });

  await user.click(within(screen.getByRole('region', { name: 'Recommended next action' })).getByRole('button', { name: 'Confirm your Base' }));

  expect(mockNavigate).toHaveBeenCalledWith('/getting-started#base');
  expect(screen.getByRole('button', { name: /Base.*Needs attention/i })).toHaveFocus();
  expect(document.getElementById('base')).toBeInTheDocument();
});

test('uses instant Base focus scrolling when reduced motion is preferred', async () => {
  const user = userEvent.setup();
  const scrollIntoView = jest.fn();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: jest.fn().mockReturnValue({ matches: true }),
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
  render(<GettingStarted />);
  await screen.findByRole('heading', { name: 'Getting Started' });

  await user.click(within(screen.getByRole('region', { name: 'Recommended next action' })).getByRole('button', { name: 'Confirm your Base' }));

  expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
});

test('offers Do this later only for optional Personnel and does not manufacture completion', async () => {
  const user = userEvent.setup();
  render(<GettingStarted />);
  await screen.findByRole('heading', { name: 'Getting Started' });

  await user.click(screen.getByRole('button', { name: /Personnel.*Optional/i }));
  expect(screen.getAllByRole('button', { name: 'Do this later' })).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Do this later' }));
  expect(mockRead).toHaveBeenCalledTimes(1);
  expect(mockNavigate).not.toHaveBeenCalled();
});

test('shows an actionable error and retries the authoritative read', async () => {
  const user = userEvent.setup();
  mockRead.mockRejectedValueOnce(new Error('Getting Started progress is unavailable.')).mockResolvedValueOnce(projection);
  render(<GettingStarted />);

  expect(await screen.findByRole('alert')).toHaveTextContent('Getting Started progress is unavailable.');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Getting Started' })).toBeVisible());
  expect(mockRead).toHaveBeenCalledTimes(2);
});
