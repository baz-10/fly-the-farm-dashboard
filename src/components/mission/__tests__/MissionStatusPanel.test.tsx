import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissionStatusPanel from '../MissionStatusPanel';

test('groups Mission health and links each issue to its exact stage', async () => {
  const user = userEvent.setup();
  const select = jest.fn();
  render(<MissionStatusPanel groups={{
    needsAttention: [{ stageId: 'weather-chemicals', label: 'Weather & Chemicals', reason: 'Observed Weather is missing.' }],
    needsReview: [{ stageId: 'map', label: 'Map', reason: 'Map requires review.' }],
    complete: [{ stageId: 'mission', label: 'Mission', reason: 'Saved.' }],
  }} onStageSelect={select} />);
  expect(screen.getAllByRole('heading', { name: 'Mission Status', level: 2 })).toHaveLength(2);
  expect(screen.getByRole('heading', { name: 'Needs Attention' })).toBeVisible();
  expect(screen.getAllByText('Observed Weather is missing.')).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: 'Fix Map' }));
  expect(select).toHaveBeenCalledWith('map');
});

test('uses calm empty states', () => {
  render(<MissionStatusPanel groups={{ needsAttention: [], needsReview: [], complete: [] }} onStageSelect={jest.fn()} />);
  expect(screen.getAllByText('Nothing needs immediate attention.')).toHaveLength(2);
  expect(screen.getAllByText('Nothing needs review.')).toHaveLength(2);
});
