import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SafetyPlanAttachment } from '../../types/safetyPlan';
import { SafetyPlanAttachments } from './SafetyPlanAttachments';

const confirmed: SafetyPlanAttachment = {
  id: 'a1',
  tenantId: 'tenant-a',
  versionId: 'v1',
  fileName: 'map.pdf',
  contentType: 'application/pdf',
  sizeBytes: 42,
  contentDigest: 'deadbeef',
  source: 'upload',
  description: 'Site map',
  uploadedBy: {
    userId: 'u1',
    name: 'Pilot',
    role: 'contractor',
    operationalAuthority: false,
  },
  uploadedAt: '2026-07-24T00:00:00.000Z',
};

describe('SafetyPlanAttachments', () => {
  it('adds a manifest item only after storage confirms the upload', async () => {
    let resolveUpload!: (attachment: SafetyPlanAttachment) => void;
    const upload = vi.fn(() => new Promise<SafetyPlanAttachment>((resolve) => {
      resolveUpload = resolve;
    }));
    const onAttachmentsChange = vi.fn();
    const { container } = render(
      <SafetyPlanAttachments
        planId="p1"
        versionId="v1"
        versionLabel="1"
        attachments={[]}
        editable
        onAttachmentsChange={onAttachmentsChange}
        upload={upload}
      />,
    );
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['pdf'], 'map.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText(/Uploading map.pdf/)).toBeInTheDocument();
    expect(onAttachmentsChange).not.toHaveBeenCalled();
    resolveUpload(confirmed);
    await waitFor(() => expect(onAttachmentsChange).toHaveBeenCalledWith([confirmed]));
    expect(await screen.findByText(/deadbeef/)).toBeInTheDocument();
  });

  it('keeps failed files locally and retries them', async () => {
    const upload = vi.fn()
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(confirmed);
    const onAttachmentsChange = vi.fn();
    const { container } = render(
      <SafetyPlanAttachments
        planId="p1"
        versionId="v1"
        versionLabel="1"
        attachments={[]}
        editable
        onAttachmentsChange={onAttachmentsChange}
        upload={upload}
      />,
    );
    fireEvent.change(container.querySelector('input[type=file]')!, {
      target: { files: [new File(['pdf'], 'map.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText('Network unavailable')).toBeInTheDocument();
    expect(onAttachmentsChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(onAttachmentsChange).toHaveBeenCalledWith([confirmed]));
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('removes draft attachments only after the gateway confirms deletion', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const onAttachmentsChange = vi.fn();
    render(
      <SafetyPlanAttachments
        planId="p1"
        versionId="v1"
        versionLabel="1"
        attachments={[confirmed]}
        editable
        onAttachmentsChange={onAttachmentsChange}
        remove={remove}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /delete map.pdf/i }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('p1', 'v1', 'a1'));
    expect(onAttachmentsChange).toHaveBeenCalledWith([]);
  });

  it('merges upload confirmation into the latest manifest after an editor rerender', async () => {
    let resolveUpload!: (attachment: SafetyPlanAttachment) => void;
    const upload = vi.fn(() => new Promise<SafetyPlanAttachment>((resolve) => {
      resolveUpload = resolve;
    }));
    const onAttachmentsChange = vi.fn();
    const view = render(
      <SafetyPlanAttachments
        planId="p1"
        versionId="v1"
        versionLabel="1"
        attachments={[]}
        editable
        onAttachmentsChange={onAttachmentsChange}
        upload={upload}
      />,
    );
    fireEvent.change(view.container.querySelector('input[type=file]')!, {
      target: { files: [new File(['pdf'], 'map.pdf', { type: 'application/pdf' })] },
    });
    const newer = { ...confirmed, id: 'newer', fileName: 'newer.pdf' };
    view.rerender(
      <SafetyPlanAttachments
        planId="p1"
        versionId="v1"
        versionLabel="1"
        attachments={[newer]}
        editable
        onAttachmentsChange={onAttachmentsChange}
        upload={upload}
      />,
    );
    resolveUpload(confirmed);
    await waitFor(() => expect(onAttachmentsChange).toHaveBeenCalledWith([newer, confirmed]));
  });

  it.each([
    ['Draft changes are still waiting to save.', false],
    ['Draft save failed. Retry the save before deleting evidence.', true],
  ])('blocks delete while same-plan work is unsafe: %s', async (reason, retryable) => {
    const remove = vi.fn();
    const retrySave = vi.fn();
    render(
      <SafetyPlanAttachments
        planId="p1"
        versionId="v1"
        versionLabel="1"
        attachments={[confirmed]}
        editable
        onAttachmentsChange={vi.fn()}
        remove={remove}
        deleteBlockedReason={reason}
        onRetryDraftSave={retryable ? retrySave : undefined}
      />,
    );
    expect(screen.getByText(reason)).toBeVisible();
    expect(screen.getByRole('button', { name: /delete map.pdf/i })).toBeDisabled();
    expect(remove).not.toHaveBeenCalled();
    if (retryable) {
      fireEvent.click(screen.getByRole('button', { name: /retry draft save/i }));
      expect(retrySave).toHaveBeenCalled();
    }
  });
});
