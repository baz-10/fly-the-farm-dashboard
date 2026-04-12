import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Stack,
  Select,
  MenuItem,
  IconButton,
  Collapse,
  alpha,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ScienceIcon from '@mui/icons-material/Science';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PublishIcon from '@mui/icons-material/Publish';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import {
  ChemicalIntakeRecord,
  IntakeStatus,
  SourceSearchStatus,
} from '../types/chemicalIntake';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CheckIcon from '@mui/icons-material/Check';
import {
  createIntakeRecord,
  getAllIntakeRecords,
  updateIntakeRecord,
  deleteIntakeRecord,
  canMarkReadyForSourceManager,
  canMarkReadyForDocSync,
  canMarkIngestionComplete,
  pushToSourceManager,
  markIngestionComplete,
  buildSyncChecklist,
  generateSuggestionsForRecord,
  approveLabelUrl,
  rejectLabelUrl,
  approveSdsUrl,
  rejectSdsUrl,
} from '../services/chemicalIntakeStore';

// ─── Status chips ────────────────────────────────

const intakeStatusConfig: Record<IntakeStatus, { label: string; color: string; bg: string }> = {
  draft:      { label: 'Draft',      color: '#616161', bg: '#9e9e9e' },
  in_review:  { label: 'In Review',  color: '#e65100', bg: '#ff9800' },
  approved:   { label: 'Approved',   color: '#2e7d32', bg: '#4caf50' },
  completed:  { label: 'Completed',  color: '#1565c0', bg: '#2196f3' },
};

const sourceStatusConfig: Record<SourceSearchStatus, { label: string; color: string; bg: string }> = {
  not_started:              { label: 'Not Started',     color: '#616161', bg: '#9e9e9e' },
  needs_search:             { label: 'Needs Search',    color: '#e65100', bg: '#ff9800' },
  candidate_found:          { label: 'Candidate Found', color: '#2e7d32', bg: '#4caf50' },
  candidate_review_required:{ label: 'Review Required', color: '#6a1b9a', bg: '#9c27b0' },
  ready_for_ingest:         { label: 'Ready',           color: '#1565c0', bg: '#2196f3' },
  ingested:                 { label: 'Ingested',        color: '#2e7d32', bg: '#4caf50' },
};

function StatusChip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <Chip
      label={label}
      size="small"
      sx={{ bgcolor: alpha(bg, 0.1), color, fontWeight: 700, fontSize: '0.7rem' }}
    />
  );
}

// ─── Filter ──────────────────────────────────────

type FilterMode = 'all' | 'draft' | 'in_review' | 'approved' | 'completed' | 'ready_sm' | 'ready_ds';

const filterButtonSx = (active: boolean) => ({
  textTransform: 'none' as const,
  fontWeight: active ? 700 : 500,
  fontSize: '0.8rem',
  borderRadius: '10px',
  px: 2,
  bgcolor: active ? alpha('#1e4d2b', 0.08) : 'transparent',
  color: active ? 'primary.dark' : 'text.secondary',
  border: active ? '1px solid' : '1px solid transparent',
  borderColor: active ? alpha('#1e4d2b', 0.2) : 'transparent',
  '&:hover': { bgcolor: alpha('#1e4d2b', 0.06) },
});

// ─── Inline edit row ─────────────────────────────

function IntakeDetailPanel({
  record,
  onUpdate,
  onPush,
  onComplete,
  onMessage,
}: {
  record: ChemicalIntakeRecord;
  onUpdate: () => void;
  onPush: (id: string) => void;
  onComplete: (id: string) => void;
  onMessage: (text: string, type: 'success' | 'warning') => void;
}) {
  const [notes, setNotes] = useState(record.notes);
  const [labelUrl, setLabelUrl] = useState(record.labelUrlCandidate);
  const [sdsUrl, setSdsUrl] = useState(record.sdsUrlCandidate);
  const [ingestionNotes, setIngestionNotes] = useState(record.ingestionNotes);
  const [sourceStatus, setSourceStatus] = useState<SourceSearchStatus>(record.sourceSearchStatus);
  const [intakeStatus, setIntakeStatus] = useState<IntakeStatus>(record.intakeStatus);
  const [reviewRequired, setReviewRequired] = useState(record.adminReviewRequired);
  const [dirty, setDirty] = useState(false);

  const markDirty = () => setDirty(true);

  const handleSave = () => {
    updateIntakeRecord(record.id, {
      notes,
      labelUrlCandidate: labelUrl,
      sdsUrlCandidate: sdsUrl,
      ingestionNotes,
      sourceSearchStatus: sourceStatus,
      intakeStatus: intakeStatus,
      adminReviewRequired: reviewRequired,
    });
    setDirty(false);
    onUpdate();
  };

  const smReady = canMarkReadyForSourceManager(record);
  const dsReady = canMarkReadyForDocSync({ ...record, labelUrlCandidate: labelUrl, sdsUrlCandidate: sdsUrl });

  const handleMarkReadySM = () => {
    updateIntakeRecord(record.id, { readyForSourceManager: true });
    onUpdate();
  };

  const handleMarkReadyDS = () => {
    // Save current URL state first
    updateIntakeRecord(record.id, {
      labelUrlCandidate: labelUrl,
      sdsUrlCandidate: sdsUrl,
      readyForDocSync: true,
    });
    onUpdate();
  };

  const fieldLabelSx = { fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', mb: 0.5 };

  return (
    <Box sx={{ p: 2, bgcolor: alpha('#000', 0.015), borderTop: '1px solid', borderColor: alpha('#000', 0.06) }}>
      <Stack spacing={2}>
        {/* Proposed naming — read-only */}
        <Box>
          <Typography sx={fieldLabelSx}>Proposed Filenames</Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>
            Label: {record.proposedLabelFilename}
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>
            SDS: {record.proposedSdsFilename}
          </Typography>
        </Box>
        <Box>
          <Typography sx={fieldLabelSx}>Proposed Paths</Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>
            Label: {record.proposedLabelPath}
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>
            SDS: {record.proposedSdsPath}
          </Typography>
        </Box>

        {/* Editable fields */}
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }} useFlexGap>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography sx={fieldLabelSx}>Source Search Status</Typography>
            <Select
              size="small"
              fullWidth
              value={sourceStatus}
              onChange={(e) => { setSourceStatus(e.target.value as SourceSearchStatus); markDirty(); }}
              sx={{ fontSize: '0.85rem' }}
            >
              {Object.entries(sourceStatusConfig).map(([val, cfg]) => (
                <MenuItem key={val} value={val} sx={{ fontSize: '0.85rem' }}>{cfg.label}</MenuItem>
              ))}
            </Select>
          </Box>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography sx={fieldLabelSx}>Intake Status</Typography>
            <Select
              size="small"
              fullWidth
              value={intakeStatus}
              onChange={(e) => { setIntakeStatus(e.target.value as IntakeStatus); markDirty(); }}
              sx={{ fontSize: '0.85rem' }}
            >
              {Object.entries(intakeStatusConfig).map(([val, cfg]) => (
                <MenuItem key={val} value={val} sx={{ fontSize: '0.85rem' }}>{cfg.label}</MenuItem>
              ))}
            </Select>
          </Box>
          <Box sx={{ flex: 1, minWidth: 140 }}>
            <Typography sx={fieldLabelSx}>Review Required</Typography>
            <Select
              size="small"
              fullWidth
              value={reviewRequired ? 'yes' : 'no'}
              onChange={(e) => { setReviewRequired(e.target.value === 'yes'); markDirty(); }}
              sx={{ fontSize: '0.85rem' }}
            >
              <MenuItem value="yes" sx={{ fontSize: '0.85rem' }}>Yes</MenuItem>
              <MenuItem value="no" sx={{ fontSize: '0.85rem' }}>No</MenuItem>
            </Select>
          </Box>
        </Stack>

        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Typography sx={fieldLabelSx}>Label URL Candidate</Typography>
            {record.labelUrlApprovalStatus === 'approved' && (
              <Chip label="Approved" size="small" sx={{ bgcolor: alpha('#4caf50', 0.1), color: '#2e7d32', fontWeight: 700, fontSize: '0.6rem', height: 18 }} />
            )}
            {record.labelUrlApprovalStatus === 'rejected' && (
              <Chip label="Rejected" size="small" sx={{ bgcolor: alpha('#f44336', 0.1), color: '#c62828', fontWeight: 700, fontSize: '0.6rem', height: 18 }} />
            )}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              size="small"
              fullWidth
              placeholder="https://..."
              value={labelUrl}
              onChange={(e) => { setLabelUrl(e.target.value); markDirty(); }}
            />
            {labelUrl && record.labelUrlApprovalStatus === 'pending' && (
              <Stack direction="row" spacing={0.5}>
                <IconButton
                  size="small"
                  onClick={() => {
                    approveLabelUrl(record.id);
                    onUpdate();
                    onMessage('Label URL approved.', 'success');
                  }}
                  sx={{ color: '#2e7d32', '&:hover': { bgcolor: alpha('#4caf50', 0.06) } }}
                >
                  <CheckCircleIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => {
                    rejectLabelUrl(record.id);
                    onUpdate();
                    onMessage('Label URL rejected.', 'warning');
                  }}
                  sx={{ color: '#c62828', '&:hover': { bgcolor: alpha('#f44336', 0.06) } }}
                >
                  <CancelIcon fontSize="small" />
                </IconButton>
              </Stack>
            )}
          </Stack>
        </Box>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Typography sx={fieldLabelSx}>SDS URL Candidate</Typography>
            {record.sdsUrlApprovalStatus === 'approved' && (
              <Chip label="Approved" size="small" sx={{ bgcolor: alpha('#4caf50', 0.1), color: '#2e7d32', fontWeight: 700, fontSize: '0.6rem', height: 18 }} />
            )}
            {record.sdsUrlApprovalStatus === 'rejected' && (
              <Chip label="Rejected" size="small" sx={{ bgcolor: alpha('#f44336', 0.1), color: '#c62828', fontWeight: 700, fontSize: '0.6rem', height: 18 }} />
            )}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              size="small"
              fullWidth
              placeholder="https://..."
              value={sdsUrl}
              onChange={(e) => { setSdsUrl(e.target.value); markDirty(); }}
            />
            {sdsUrl && record.sdsUrlApprovalStatus === 'pending' && (
              <Stack direction="row" spacing={0.5}>
                <IconButton
                  size="small"
                  onClick={() => {
                    approveSdsUrl(record.id);
                    onUpdate();
                    onMessage('SDS URL approved.', 'success');
                  }}
                  sx={{ color: '#2e7d32', '&:hover': { bgcolor: alpha('#4caf50', 0.06) } }}
                >
                  <CheckCircleIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => {
                    rejectSdsUrl(record.id);
                    onUpdate();
                    onMessage('SDS URL rejected.', 'warning');
                  }}
                  sx={{ color: '#c62828', '&:hover': { bgcolor: alpha('#f44336', 0.06) } }}
                >
                  <CancelIcon fontSize="small" />
                </IconButton>
              </Stack>
            )}
          </Stack>
        </Box>
        <Box>
          <Typography sx={fieldLabelSx}>Ingestion Notes</Typography>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={1}
            placeholder="Notes for source ingestion..."
            value={ingestionNotes}
            onChange={(e) => { setIngestionNotes(e.target.value); markDirty(); }}
          />
        </Box>
        <Box>
          <Typography sx={fieldLabelSx}>Notes</Typography>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            value={notes}
            onChange={(e) => { setNotes(e.target.value); markDirty(); }}
          />
        </Box>

        {/* Candidate Source Suggestions */}
        <Box sx={{
          p: 2, borderRadius: '10px',
          bgcolor: alpha('#fff3e0', 0.5),
          border: '1px solid',
          borderColor: alpha('#ff9800', 0.15),
        }}>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#e65100', mb: 1.5 }}>
            Candidate Source Suggestions
          </Typography>

          {record.suggestionStatus === 'none' ? (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Generate URL suggestions from known source data, Source Manager records, and manufacturer URL patterns.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AutoFixHighIcon sx={{ fontSize: 14 }} />}
                onClick={() => {
                  generateSuggestionsForRecord(record.id);
                  onUpdate();
                  onMessage('URL suggestions generated.', 'success');
                }}
                sx={{
                  textTransform: 'none', fontWeight: 600, borderRadius: '8px', fontSize: '0.75rem',
                  color: '#e65100', borderColor: alpha('#ff9800', 0.4),
                  '&:hover': { bgcolor: alpha('#ff9800', 0.06), borderColor: '#ff9800' },
                }}
              >
                Generate Suggestions
              </Button>
            </Box>
          ) : (
            <Stack spacing={1.5}>
              <Box>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                  Label URL Suggestions ({record.labelUrlSuggestions.length})
                </Typography>
                {record.labelUrlSuggestions.length > 0 ? (
                  record.labelUrlSuggestions.map((url, i) => (
                    <Typography key={i} variant="caption" sx={{
                      fontFamily: 'monospace', display: 'block', wordBreak: 'break-all',
                      color: i === 0 ? '#2e7d32' : '#666', fontWeight: i === 0 ? 600 : 400,
                    }}>
                      {i + 1}. {url}
                    </Typography>
                  ))
                ) : (
                  <Typography variant="caption" sx={{ color: '#999', fontStyle: 'italic' }}>No suggestions</Typography>
                )}
              </Box>

              <Box>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                  SDS URL Suggestions ({record.sdsUrlSuggestions.length})
                </Typography>
                {record.sdsUrlSuggestions.length > 0 ? (
                  record.sdsUrlSuggestions.map((url, i) => (
                    <Typography key={i} variant="caption" sx={{
                      fontFamily: 'monospace', display: 'block', wordBreak: 'break-all',
                      color: i === 0 ? '#2e7d32' : '#666', fontWeight: i === 0 ? 600 : 400,
                    }}>
                      {i + 1}. {url}
                    </Typography>
                  ))
                ) : (
                  <Typography variant="caption" sx={{ color: '#999', fontStyle: 'italic' }}>No suggestions</Typography>
                )}
              </Box>

              <Stack direction="row" spacing={1}>
                {(record.labelUrlSuggestions.length > 0 || record.sdsUrlSuggestions.length > 0) && !labelUrl && !sdsUrl && (
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<CheckIcon sx={{ fontSize: 14 }} />}
                    onClick={() => {
                      const newLabel = record.labelUrlSuggestions[0] || '';
                      const newSds = record.sdsUrlSuggestions[0] || '';
                      if (newLabel) { setLabelUrl(newLabel); }
                      if (newSds) { setSdsUrl(newSds); }
                      updateIntakeRecord(record.id, {
                        labelUrlCandidate: newLabel || labelUrl,
                        sdsUrlCandidate: newSds || sdsUrl,
                        suggestionStatus: 'reviewed',
                      });
                      onUpdate();
                      onMessage('Top suggestions accepted as candidates.', 'success');
                    }}
                    sx={{
                      textTransform: 'none', fontWeight: 600, borderRadius: '8px', fontSize: '0.75rem',
                      bgcolor: '#e65100', '&:hover': { bgcolor: '#bf360c' },
                    }}
                  >
                    Accept Top Suggestions
                  </Button>
                )}
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AutoFixHighIcon sx={{ fontSize: 14 }} />}
                  onClick={() => {
                    generateSuggestionsForRecord(record.id);
                    onUpdate();
                    onMessage('Suggestions regenerated.', 'success');
                  }}
                  sx={{
                    textTransform: 'none', fontWeight: 600, borderRadius: '8px', fontSize: '0.75rem',
                    color: '#e65100', borderColor: alpha('#ff9800', 0.4),
                    '&:hover': { bgcolor: alpha('#ff9800', 0.06), borderColor: '#ff9800' },
                  }}
                >
                  Regenerate
                </Button>
              </Stack>

              {record.suggestionStatus === 'reviewed' && (
                <Chip label="Suggestions Reviewed" size="small"
                  sx={{ bgcolor: alpha('#4caf50', 0.1), color: '#2e7d32', fontWeight: 700, fontSize: '0.65rem', alignSelf: 'flex-start' }} />
              )}
            </Stack>
          )}
        </Box>

        {/* Ingestion Assistant */}
        {(record.intakeStatus === 'approved' || record.intakeStatus === 'completed') && (
          <Box sx={{
            p: 2, borderRadius: '10px',
            bgcolor: alpha('#e3f2fd', 0.5),
            border: '1px solid',
            borderColor: alpha('#2196f3', 0.15),
          }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#1565c0', mb: 1.5 }}>
              Ingestion Assistant
            </Typography>

            <Stack spacing={1}>
              <Box>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary' }}>Expected Files</Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>
                  Label: {record.expectedLabelFilename}
                </Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>
                  SDS: {record.expectedSdsFilename}
                </Typography>
              </Box>

              <Box>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary' }}>Expected Paths</Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>
                  Label: {record.expectedLabelPath}
                </Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>
                  SDS: {record.expectedSdsPath}
                </Typography>
              </Box>

              <Box sx={{
                mt: 1, p: 1.5, borderRadius: '8px',
                bgcolor: alpha('#000', 0.03),
                border: '1px solid',
                borderColor: alpha('#000', 0.06),
              }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                  Manual placement
                </Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block', color: '#333' }}>
                  Place label PDF at: public/docs/{record.expectedLabelFilename}
                </Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block', color: '#333' }}>
                  Place SDS PDF at: public/docs/{record.expectedSdsFilename}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', mt: 1.5, mb: 0.5 }}>
                  Or use sync script
                </Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block', color: '#333' }}>
                  {record.syncCommandPreview}
                </Typography>
              </Box>

              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                  onClick={() => {
                    const checklist = buildSyncChecklist(record);
                    navigator.clipboard.writeText(checklist).then(() => {
                      onMessage('Sync checklist copied to clipboard.', 'success');
                    });
                  }}
                  sx={{
                    textTransform: 'none', fontWeight: 600, borderRadius: '8px', fontSize: '0.75rem',
                    color: '#1565c0', borderColor: alpha('#2196f3', 0.4),
                    '&:hover': { bgcolor: alpha('#2196f3', 0.06), borderColor: '#2196f3' },
                  }}
                >
                  Copy Sync Checklist
                </Button>
                {canMarkIngestionComplete(record) && (
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<CheckCircleOutlineIcon sx={{ fontSize: 16 }} />}
                    onClick={() => onComplete(record.id)}
                    sx={{
                      textTransform: 'none', fontWeight: 600, borderRadius: '8px', fontSize: '0.75rem',
                      bgcolor: '#2e7d32', '&:hover': { bgcolor: '#1b5e20' },
                    }}
                  >
                    Mark Ingestion Complete
                  </Button>
                )}
              </Stack>
            </Stack>
          </Box>
        )}

        {/* Action buttons row */}
        <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }} useFlexGap>
          {dirty && (
            <Button
              variant="contained"
              size="small"
              onClick={handleSave}
              sx={{
                textTransform: 'none', fontWeight: 600, borderRadius: '8px',
                bgcolor: '#2e7d32', '&:hover': { bgcolor: '#1b5e20' },
              }}
            >
              Save Changes
            </Button>
          )}
          {!record.readyForSourceManager && smReady && (
            <Button
              variant="outlined"
              size="small"
              onClick={handleMarkReadySM}
              sx={{
                textTransform: 'none', fontWeight: 600, borderRadius: '8px', fontSize: '0.8rem',
                color: '#1565c0', borderColor: alpha('#2196f3', 0.4),
                '&:hover': { bgcolor: alpha('#2196f3', 0.06), borderColor: '#2196f3' },
              }}
            >
              Mark Ready for Source Manager
            </Button>
          )}
          {record.readyForSourceManager && !record.readyForDocSync && (
            <Chip label="Ready for Source Manager" size="small"
              sx={{ bgcolor: alpha('#2196f3', 0.1), color: '#1565c0', fontWeight: 700, fontSize: '0.7rem' }} />
          )}
          {!record.readyForDocSync && dsReady && (
            <Button
              variant="outlined"
              size="small"
              onClick={handleMarkReadyDS}
              sx={{
                textTransform: 'none', fontWeight: 600, borderRadius: '8px', fontSize: '0.8rem',
                color: '#6a1b9a', borderColor: alpha('#9c27b0', 0.4),
                '&:hover': { bgcolor: alpha('#9c27b0', 0.06), borderColor: '#9c27b0' },
              }}
            >
              Mark Ready for Doc Sync
            </Button>
          )}
          {record.readyForDocSync && (
            <Chip label="Ready for Doc Sync" size="small"
              sx={{ bgcolor: alpha('#9c27b0', 0.1), color: '#6a1b9a', fontWeight: 700, fontSize: '0.7rem' }} />
          )}
          {record.readyForSourceManager && record.intakeStatus !== 'completed' && (
            <Button
              variant="contained"
              size="small"
              startIcon={<PublishIcon sx={{ fontSize: 16 }} />}
              onClick={() => onPush(record.id)}
              sx={{
                textTransform: 'none', fontWeight: 600, borderRadius: '8px', fontSize: '0.8rem',
                bgcolor: '#1565c0', '&:hover': { bgcolor: '#0d47a1' },
              }}
            >
              Push to Source Manager
            </Button>
          )}
          {record.intakeStatus === 'completed' && (
            <Chip label={record.sourceSearchStatus === 'ingested' ? 'Ingestion Complete' : 'Pushed to Source Manager'} size="small"
              sx={{ bgcolor: alpha('#4caf50', 0.1), color: '#2e7d32', fontWeight: 700, fontSize: '0.7rem' }} />
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

// ─── Main component ──────────────────────────────

export default function AdminChemicalIntake() {
  const [records, setRecords] = useState<ChemicalIntakeRecord[]>([]);
  const [inputName, setInputName] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'warning' } | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = () => setRecords(getAllIntakeRecords());

  useEffect(() => { reload(); }, []);

  const showMessage = (text: string, type: 'success' | 'warning') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleCreate = () => {
    const name = inputName.trim();
    if (!name) return;

    const result = createIntakeRecord(name);
    if (result.alreadyExisted) {
      showMessage(`"${result.record.chemicalNameCanonical}" already exists in intake.`, 'warning');
    } else {
      showMessage(`Created intake record for "${result.record.chemicalNameCanonical}".`, 'success');
    }
    setInputName('');
    reload();
  };

  const handleDelete = (id: string) => {
    deleteIntakeRecord(id);
    if (expandedId === id) setExpandedId(null);
    reload();
  };

  const handleStatusAction = (id: string, status: IntakeStatus) => {
    updateIntakeRecord(id, { intakeStatus: status });
    reload();
  };

  const handlePush = (id: string) => {
    const updated = pushToSourceManager(id);
    if (updated) {
      showMessage(`"${updated.chemicalNameCanonical}" pushed to Source Manager.`, 'success');
    }
    reload();
  };

  const handleComplete = (id: string) => {
    const updated = markIngestionComplete(id);
    if (updated) {
      showMessage(`"${updated.chemicalNameCanonical}" ingestion marked complete.`, 'success');
    }
    reload();
  };

  // Counts
  const readySMCount = records.filter((r) => r.readyForSourceManager).length;
  const readyDSCount = records.filter((r) => r.readyForDocSync).length;

  const statusCounts: Record<string, number> = {
    all: records.length,
    draft: records.filter((r) => r.intakeStatus === 'draft').length,
    in_review: records.filter((r) => r.intakeStatus === 'in_review').length,
    approved: records.filter((r) => r.intakeStatus === 'approved').length,
    completed: records.filter((r) => r.intakeStatus === 'completed').length,
    ready_sm: readySMCount,
    ready_ds: readyDSCount,
  };

  const filtered = records.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'ready_sm') return r.readyForSourceManager;
    if (filter === 'ready_ds') return r.readyForDocSync;
    return r.intakeStatus === filter;
  });

  const filterLabels: Record<FilterMode, string> = {
    all: 'All',
    draft: 'Draft',
    in_review: 'In Review',
    approved: 'Approved',
    completed: 'Completed',
    ready_sm: 'Ready for SM',
    ready_ds: 'Ready for DS',
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: '12px',
          bgcolor: alpha('#9c27b0', 0.08),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ScienceIcon sx={{ fontSize: 24, color: '#9c27b0' }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.dark' }}>
            Chemical Intake
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Add a new chemical to the Fly The Farm system. Intake creates a controlled record
            with proposed naming and document paths before source search and ingestion.
          </Typography>
        </Box>
      </Box>

      {/* Create form */}
      <Card elevation={0} sx={{ mt: 2, border: '1px solid', borderColor: alpha('#000', 0.08), borderRadius: '14px' }}>
        <CardContent sx={{ py: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              size="small"
              placeholder="Chemical name (e.g. Hotshot, Metsulfuron 600 WG)"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              sx={{ flex: 1 }}
            />
            <Button
              variant="contained"
              size="small"
              startIcon={<AddCircleOutlineIcon />}
              onClick={handleCreate}
              disabled={!inputName.trim()}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: '10px',
                bgcolor: '#9c27b0',
                '&:hover': { bgcolor: '#7b1fa2' },
                px: 2.5,
              }}
            >
              Create Intake Record
            </Button>
          </Stack>
          {message && (
            <Typography
              variant="caption"
              sx={{
                mt: 1,
                display: 'block',
                fontWeight: 600,
                color: message.type === 'success' ? '#2e7d32' : '#e65100',
              }}
            >
              {message.text}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Filter */}
      {records.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }} useFlexGap>
          {(['all', 'draft', 'in_review', 'approved', 'completed', 'ready_sm', 'ready_ds'] as FilterMode[]).map((f) => (
            <Button key={f} size="small" sx={filterButtonSx(filter === f)} onClick={() => setFilter(f)}>
              {filterLabels[f]} ({statusCounts[f]})
            </Button>
          ))}
        </Stack>
      )}

      {/* Records table */}
      {records.length > 0 && (
        <Card elevation={0} sx={{ mt: 2, border: '1px solid', borderColor: alpha('#000', 0.08), borderRadius: '14px' }}>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary', py: 1.5, borderBottom: '2px solid', borderColor: alpha('#000', 0.06) } }}>
                    <TableCell width={40} />
                    <TableCell>Chemical</TableCell>
                    <TableCell>Canonical Name</TableCell>
                    <TableCell>Source Search</TableCell>
                    <TableCell>Intake Status</TableCell>
                    <TableCell>Readiness</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((r) => {
                    const isExpanded = expandedId === r.id;
                    const iCfg = intakeStatusConfig[r.intakeStatus];
                    const sCfg = sourceStatusConfig[r.sourceSearchStatus];
                    return (
                      <React.Fragment key={r.id}>
                        <TableRow
                          sx={{
                            '& td': { py: 1.5 },
                            ...(isExpanded ? {} : { '&:last-child td': { borderBottom: 0 } }),
                            bgcolor: r.adminReviewRequired ? alpha('#ff9800', 0.02) : 'transparent',
                          }}
                        >
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={() => setExpandedId(isExpanded ? null : r.id)}
                            >
                              {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                            </IconButton>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {r.chemicalNameRaw}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                              {r.chemicalNameCanonical}
                            </Typography>
                          </TableCell>
                          <TableCell><StatusChip {...sCfg} /></TableCell>
                          <TableCell><StatusChip {...iCfg} /></TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5}>
                              {r.readyForSourceManager && (
                                <Chip label="SM" size="small" sx={{ bgcolor: alpha('#2196f3', 0.1), color: '#1565c0', fontWeight: 700, fontSize: '0.6rem', height: 20 }} />
                              )}
                              {r.readyForDocSync && (
                                <Chip label="DS" size="small" sx={{ bgcolor: alpha('#9c27b0', 0.1), color: '#6a1b9a', fontWeight: 700, fontSize: '0.6rem', height: 20 }} />
                              )}
                              {!r.readyForSourceManager && !r.readyForDocSync && (
                                <Chip label="\u2014" size="small" sx={{ bgcolor: alpha('#9e9e9e', 0.06), color: '#9e9e9e', fontWeight: 600, fontSize: '0.6rem', height: 20 }} />
                              )}
                            </Stack>
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              {r.intakeStatus === 'draft' && (
                                <Button size="small" onClick={() => handleStatusAction(r.id, 'in_review')}
                                  sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.7rem', borderRadius: '8px', minWidth: 0 }}>
                                  Review
                                </Button>
                              )}
                              {r.intakeStatus === 'in_review' && (
                                <Button size="small" onClick={() => handleStatusAction(r.id, 'approved')}
                                  sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.7rem', borderRadius: '8px', minWidth: 0, color: '#2e7d32' }}>
                                  Approve
                                </Button>
                              )}
                              {r.intakeStatus === 'approved' && r.readyForSourceManager && (
                                <Button size="small" startIcon={<PublishIcon sx={{ fontSize: 14 }} />}
                                  onClick={() => handlePush(r.id)}
                                  sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.7rem', borderRadius: '8px', minWidth: 0, color: '#1565c0' }}>
                                  Push
                                </Button>
                              )}
                              {r.intakeStatus === 'approved' && !r.readyForSourceManager && (
                                <Button size="small" onClick={() => handleStatusAction(r.id, 'completed')}
                                  sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.7rem', borderRadius: '8px', minWidth: 0, color: '#1565c0' }}>
                                  Complete
                                </Button>
                              )}
                              <IconButton size="small" onClick={() => handleDelete(r.id)} sx={{ color: '#c62828' }}>
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Stack>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={7} sx={{ p: 0, borderBottom: isExpanded ? undefined : 0 }}>
                            <Collapse in={isExpanded} unmountOnExit>
                              <IntakeDetailPanel record={r} onUpdate={reload} onPush={handlePush} onComplete={handleComplete} onMessage={showMessage} />
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                        <Typography variant="body2" color="text.secondary">
                          No intake records match this filter.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {records.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 5, mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No intake records yet. Enter a chemical name above to create one.
          </Typography>
        </Box>
      )}

      {/* Footer note */}
      {records.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          Approved chemicals with Source Manager readiness can be pushed directly. Doc Sync readiness requires candidate URLs.
        </Typography>
      )}
    </Box>
  );
}
