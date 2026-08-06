import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissionContextBar, MissionWorkspaceStepper } from '../MissionWorkspaceNavigation';
import { deriveMissionWorkspaceStages } from '../../../utils/missionWorkspace';
import type { MissionStepStatus } from '../../../utils/missionStepper';

const complete: MissionStepStatus[] = Array.from({ length: 10 }, () => ({ state: 'COMPLETE', reason: 'Saved.' }));

test('keeps the full lifecycle clickable and identifies the active stage without colour alone', async () => {
  const user = userEvent.setup();
  const select = jest.fn();
  const stages = deriveMissionWorkspaceStages({ planningSteps: complete, authorised: false, completed: false });
  render(<MissionWorkspaceStepper stages={stages} activeStage="map" onStageSelect={select} />);
  expect(screen.getAllByRole('button')).toHaveLength(9);
  expect(screen.getByRole('button', { name: 'Map — Current' })).toHaveAttribute('aria-current', 'step');
  expect(screen.getByRole('button', { name: 'Mission — Complete' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Operational Closeout — Available after Mission Authorisation' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Mission — Complete' }));
  expect(select).toHaveBeenCalledWith('mission');
});

test('uses Current only for the active workspace and labels another actionable stage as Needs Attention', () => {
  const planning = [...complete];
  planning[7] = { state: 'CURRENT', reason: 'Review Weather and Chemical evidence.' };
  const stages = deriveMissionWorkspaceStages({ planningSteps: planning, authorised: false, completed: false });
  render(<MissionWorkspaceStepper stages={stages} activeStage="mission" onStageSelect={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Mission — Current' })).toHaveAttribute('aria-current', 'step');
  expect(screen.getByRole('button', { name: 'Weather & Chemicals — Needs Attention' })).not.toHaveAttribute('aria-current');
  expect(screen.queryAllByText('Current')).toHaveLength(1);
});

test('shows Client, Property, Field and Mission breadcrumb context', async () => {
  const user = userEvent.setup();
  const navigate = jest.fn();
  render(<MissionContextBar client={{ label: 'North Farm', href: '/client' }} property={{ label: 'Home Block', href: '/property' }} field={{ label: 'Creek Field', href: '/field' }} missionNumber="FTF-MIS-001" missionTitle="Creek spray" status="Planning incomplete" onNavigate={navigate} />);
  expect(screen.getByLabelText('Mission context')).toHaveTextContent('North Farm>Home Block>Creek Field>FTF-MIS-001');
  await user.click(screen.getByRole('button', { name: 'North Farm' }));
  expect(navigate).toHaveBeenCalledWith('/client');
});
