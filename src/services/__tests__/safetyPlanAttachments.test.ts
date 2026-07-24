import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteDraftSafetyPlanAttachment,
  downloadSafetyPlanAttachment,
  uploadSafetyPlanAttachment,
} from '../safetyPlanAttachments';

describe('Safety Plan attachment client', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('rejects oversized files before sending browser data', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const file = new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'large.pdf', {
      type: 'application/pdf',
    });
    await expect(uploadSafetyPlanAttachment({
      planId: 'plan-a',
      versionId: 'version-a',
      attachmentId: 'attachment-a',
      file,
    })).rejects.toThrow(/3 MiB/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uploads raw bytes with exact metadata and reports confirmed manifest metadata', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      attachment: {
        id: 'attachment-a',
        versionId: 'version-a',
        fileName: 'evidence.pdf',
        contentType: 'application/pdf',
        sizeBytes: 3,
        contentDigest: 'abc',
      },
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const file = new File(['pdf'], 'evidence.pdf', { type: 'application/pdf' });
    const progress: number[] = [];

    const result = await uploadSafetyPlanAttachment({
      planId: 'plan-a',
      versionId: 'version-a',
      attachmentId: 'attachment-a',
      file,
      description: 'Site map',
      onProgress: (value) => progress.push(value),
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/safety-attachments', expect.objectContaining({
      method: 'POST',
      body: file,
      credentials: 'same-origin',
      headers: expect.objectContaining({
        'X-Safety-Plan-Id': 'plan-a',
        'X-Safety-Plan-Version-Id': 'version-a',
        'X-Attachment-Id': 'attachment-a',
        'X-File-Name': 'evidence.pdf',
        'X-Attachment-Description': 'Site map',
      }),
    }));
    expect(progress).toEqual([0, 100]);
    expect(result.contentDigest).toBe('abc');
  });

  it('downloads and deletes through the gateway without tenant or Supabase headers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('pdf', {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await downloadSafetyPlanAttachment('plan-a', 'version-a', 'attachment-a');
    await deleteDraftSafetyPlanAttachment('plan-a', 'version-a', 'attachment-a');

    for (const [, options] of fetchSpy.mock.calls) {
      const headers = new Headers(options?.headers);
      expect(headers.has('apikey')).toBe(false);
      expect(headers.has('authorization')).toBe(false);
      expect(headers.has('x-tenant-id')).toBe(false);
    }
  });
});
