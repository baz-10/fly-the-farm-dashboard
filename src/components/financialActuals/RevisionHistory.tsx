import React from 'react';
import { Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import type { FinancialRevisionHistory, FinancialRevisionSummary } from '../../types/financialActuals';

function stateLabel(revision: FinancialRevisionSummary) {
  if (revision.activeDraft) return 'DRAFT · Correction in progress';
  if (revision.current) return 'FINAL · Current';
  return 'FINAL · Historical';
}

export function RevisionHistory({
  history,
  selectedRevisionId,
  onSelect,
  onLoadMore,
  loadingMore = false,
}: {
  history: FinancialRevisionHistory;
  selectedRevisionId: string | null;
  onSelect: (revisionId: string) => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6">Revision history</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Immutable FINAL revisions and any correction Draft beneath this Financial Actual.
        </Typography>
        <Stack spacing={1}>
          {history.rows.map(revision => (
            <Button
              key={revision.id}
              aria-label={`Revision ${revision.revisionNumber}`}
              variant={selectedRevisionId === revision.id ? 'contained' : 'outlined'}
              color={revision.activeDraft ? 'warning' : 'primary'}
              onClick={() => onSelect(revision.id)}
              sx={{ justifyContent: 'stretch', textAlign: 'left', textTransform: 'none' }}
            >
              <Box sx={{ width: '100%' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
                  <Typography fontWeight={800}>Revision {revision.revisionNumber}</Typography>
                  <Chip size="small" label={stateLabel(revision)} />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {revision.correctionReason || 'Original'}
                </Typography>
              </Box>
            </Button>
          ))}
        </Stack>
        {history.nextBeforeRevisionNumber !== null && onLoadMore && <Button sx={{ mt: 2 }} disabled={loadingMore} onClick={onLoadMore}>Load older revisions</Button>}
      </CardContent>
    </Card>
  );
}
