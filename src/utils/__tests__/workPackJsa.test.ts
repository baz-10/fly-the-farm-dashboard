import { describe, expect, test } from 'vitest';

import { JSARecord } from '../../types/mission';
import { reopenJSAForWorkPackChange } from '../workPackJsa';

const approvedJsa = {
  status: 'approved' as const,
  reviewedBy: 'chief-pilot',
  completedDate: '2026-07-18T01:00:00.000Z',
  reviewedDate: '2026-07-18T02:00:00.000Z',
  signOffs: { pilot: { userId: 'pilot', signature: 'signed', signedAt: '2026-07-18T01:00:00.000Z' } },
} as JSARecord;

describe('work-pack JSA reopening', () => {
  test('reopens an approved JSA when the first complete aircraft and kit is substituted', () => {
    const previous = { aircraftAssignments: [{ id: '1', aircraftId: 't50', kitId: 'spray-50', label: '' }] };
    const next = { aircraftAssignments: [{ id: '1', aircraftId: 't100', kitId: 'spray-100', label: '' }] };

    const result = reopenJSAForWorkPackChange(approvedJsa, previous, next);

    expect(result.status).toBe('in-progress');
    expect(result.reviewedBy).toBeUndefined();
    expect(result.completedDate).toBeUndefined();
  });

  test('does not reopen an approved JSA when only carrying details change', () => {
    const previous = { aircraftAssignments: [{ id: '1', aircraftId: 't100', kitId: 'spray-100', label: '', carryingAssetId: 'truck' }] };
    const next = { aircraftAssignments: [{ id: '1', aircraftId: 't100', kitId: 'spray-100', label: '', carryingAssetId: 'trailer' }] };

    expect(reopenJSAForWorkPackChange(approvedJsa, previous, next)).toBe(approvedJsa);
  });
});
