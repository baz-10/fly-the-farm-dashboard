import { describe, expect, test } from 'vitest';

import { instantiateWorkPackTemplate, validateTemplateReferences } from '../workPackTemplates';
import { WorkPackTemplate } from '../../types/workPack';

const template: WorkPackTemplate = {
  id: 'template-two-t100',
  name: 'Two T100 Spray Crew',
  description: 'Standard two-aircraft spray setup',
  status: 'active',
  truckId: 'truck-1',
  aircraftAssignments: [
    { id: 'slot-1', aircraftId: 't100-001', kitId: 'kit-t100-1', label: 'Lead aircraft' },
    { id: 'slot-2', aircraftId: 't100-002', kitId: 'kit-t100-2', label: 'Second aircraft' },
  ],
  crewRequirements: [
    { id: 'crew-1', role: 'pilot', quantity: 2 },
    { id: 'crew-2', role: 'driver', quantity: 1 },
    { id: 'crew-3', role: 'field-supervisor', quantity: 1 },
  ],
  checklist: ['Load aircraft', 'Secure chemical system'],
  notes: '',
  createdAt: '2026-07-17T00:00:00.000Z',
  updatedAt: '2026-07-17T00:00:00.000Z',
};

describe('work-pack templates', () => {
  test('creates an independent job snapshot with fresh nested IDs', () => {
    const snapshot = instantiateWorkPackTemplate(template, 'job-123', () => 'new-id');

    expect(snapshot.sourceTemplateId).toBe(template.id);
    expect(snapshot.jobId).toBe('job-123');
    expect(snapshot.aircraftAssignments[0]).toEqual(expect.objectContaining({
      id: 'new-id',
      aircraftId: 't100-001',
      kitId: 'kit-t100-1',
    }));

    snapshot.aircraftAssignments[0].label = 'Changed for this job';
    snapshot.checklist.push('Job-only step');
    expect(template.aircraftAssignments[0].label).toBe('Lead aircraft');
    expect(template.checklist).not.toContain('Job-only step');
  });

  test('reports missing truck, aircraft and kit references', () => {
    expect(validateTemplateReferences(template, {
      truckIds: [],
      aircraftIds: ['t100-001'],
      kitIds: ['kit-t100-1'],
    })).toEqual([
      'Truck is no longer available',
      'Aircraft in slot 2 is no longer available',
      'Equipment kit in slot 2 is no longer available',
    ]);
  });
});
