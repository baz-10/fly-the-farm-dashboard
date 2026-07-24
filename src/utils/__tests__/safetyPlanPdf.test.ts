import { describe, expect, it } from 'vitest';

import { makeSafetyPlan, makeSafetyPlanVersion } from '../../test/safetyPlanFixtures';
import {
  buildSafetyPlanPdf,
  safetyPlanPdfFilename,
} from '../safetyPlanPdf';

function extractJsPdfText(doc: Awaited<ReturnType<typeof buildSafetyPlanPdf>>): string {
  return Array.from(
    (doc as unknown as { __safetyPlanText?: string[] }).__safetyPlanText ?? []
  ).join('\n');
}

describe('buildSafetyPlanPdf', () => {
  it('renders the approved snapshot rather than changed live mission data', async () => {
    const version = makeSafetyPlanVersion({
      status: 'approved',
      sourceSnapshot: {
        capturedAt: '2026-07-24T00:00:00.000Z',
        job: { id: 'job-1', name: 'Western boundary spotter' },
        missions: [{ id: 'mission-1', name: 'Captured mission' }],
        sourceLinks: [],
      },
      contentDigest: 'digest-1',
      approvedAt: '2026-07-24T01:00:00.000Z',
    });
    const plan = makeSafetyPlan({
      status: 'approved',
      currentVersionId: version.id,
      versions: [version],
    });

    const doc = await buildSafetyPlanPdf(plan, version, { name: 'Operator Co' });
    const text = extractJsPdfText(doc);
    expect(text).toContain('Western boundary spotter');
    expect(text).not.toContain('Later live mission edit');
  });

  it('includes controlled sections, provenance, approvals, acknowledgements and notice', async () => {
    const version = makeSafetyPlanVersion({
      status: 'approved',
      contentDigest: 'sha256-controlled-digest',
      approvedAt: '2026-07-24T01:00:00.000Z',
      approvedBy: {
        userId: 'admin-1',
        name: 'A. Approver',
        role: 'admin',
        operationalAuthority: true,
      },
      acknowledgements: [{
        id: 'ack-1',
        versionId: 'safety-plan-version-1',
        actor: {
          userId: 'pic-1',
          name: 'P. Pilot',
          role: 'contractor',
          operationalAuthority: false,
        },
        assignedRole: 'PIC',
        statement: 'Read and understood',
        acknowledgedAt: '2026-07-24T02:00:00.000Z',
      }],
      attachments: [{
        id: 'attachment-1',
        tenantId: 'tenant-1',
        versionId: 'safety-plan-version-1',
        fileName: 'site-map.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1200,
        contentDigest: 'attachment-digest',
        source: 'upload',
        uploadedBy: {
          userId: 'admin-1',
          name: 'A. Approver',
          role: 'admin',
          operationalAuthority: true,
        },
        uploadedAt: '2026-07-24T00:30:00.000Z',
      }],
    });
    const plan = makeSafetyPlan({
      status: 'approved',
      currentVersionId: version.id,
      versions: [version],
    });

    const text = extractJsPdfText(
      await buildSafetyPlanPdf(plan, version, { name: 'Operator Co' })
    );
    expect(text).toContain('Version 1.0');
    expect(text).toContain('CASA/ReOC aligned');
    expect(text).toContain('not CASA approved');
    expect(text).toContain('sha256-controlled-digest');
    expect(text).toContain('A. Approver');
    expect(text).toContain('P. Pilot');
    expect(text).toContain('site-map.pdf');
    expect(text).toContain('Revision history');
  });

  it('strips internal audit details from a client copy', async () => {
    const version = makeSafetyPlanVersion({
      status: 'approved',
      contentDigest: 'public-digest',
      approvedAt: '2026-07-24T01:00:00.000Z',
      sourceSnapshot: {
        capturedAt: '2026-07-24T00:00:00.000Z',
        job: { id: 'job-1', name: 'Client job' },
        missions: [],
        sourceLinks: [{
          sourceType: 'mission',
          sourceId: 'internal-mission-id',
          sourceUpdatedAt: '2026-07-24T00:00:00.000Z',
        }],
      },
    });
    const plan = makeSafetyPlan({
      status: 'approved',
      currentVersionId: version.id,
      versions: [version],
    });

    const text = extractJsPdfText(
      await buildSafetyPlanPdf(plan, version, { name: 'Operator Co' }, { clientCopy: true })
    );
    expect(text).toContain('Client copy');
    expect(text).not.toContain('internal-mission-id');
    expect(text).toContain('public-digest');
    expect(text).not.toContain(version.id);
  });

  it('creates a stable sanitised filename', () => {
    expect(safetyPlanPdfFilename('West / North: Job', '1.0'))
      .toBe('Safety_Plan_West_North_Job_1.0.pdf');
  });
});
