import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Stack,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  LinearProgress,
  Alert,
  Tooltip,
  alpha,
  Paper,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import {
  DocumentCandidate,
  ImportManifest,
  ValidationStatus,
  ApprovalStatus,
} from '../types/documentSourcing';
import {
  generateDocumentCandidatesFromIntake,
  getAllDocumentCandidates,
  validateDocumentCandidate,
  validateAllCandidates,
  approveDocumentCandidate,
  rejectDocumentCandidate,
  bulkApproveValidCandidates,
  generateImportManifest,
  getAllImportManifests,
  exportManifestAsJson,
  getSourcingStats,
} from '../services/documentSourcingStore';

export default function AdminDocumentSourcing() {
  const [candidates, setCandidates] = useState<DocumentCandidate[]>([]);
  const [manifests, setManifests] = useState<ImportManifest[]>([]);
  const [loading, setLoading] = useState(false);
  const [validationProgress, setValidationProgress] = useState({ completed: 0, total: 0 });
  const [showValidationProgress, setShowValidationProgress] = useState(false);
  const [manifestDialog, setManifestDialog] = useState(false);
  const [manifestName, setManifestName] = useState('');
  const [manifestDescription, setManifestDescription] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setCandidates(getAllDocumentCandidates());
    setManifests(getAllImportManifests());
  };

  const refreshCandidates = () => {
    setLoading(true);
    const newCandidates = generateDocumentCandidatesFromIntake();
    if (newCandidates.length > 0) {
      setCandidates(getAllDocumentCandidates());
    }
    setLoading(false);
  };

  const handleValidateAll = async () => {
    setLoading(true);
    setShowValidationProgress(true);
    setValidationProgress({ completed: 0, total: candidates.length });

    try {
      await validateAllCandidates((completed, total) => {
        setValidationProgress({ completed, total });
      });
      setCandidates(getAllDocumentCandidates());
    } catch (error) {
      console.error('Validation error:', error);
    } finally {
      setLoading(false);
      setShowValidationProgress(false);
    }
  };

  const handleValidateSingle = async (candidateId: string) => {
    try {
      await validateDocumentCandidate(candidateId);
      setCandidates(getAllDocumentCandidates());
    } catch (error) {
      console.error('Validation error:', error);
    }
  };

  const handleApprove = (candidateId: string) => {
    approveDocumentCandidate(candidateId, 'Manually approved by admin');
    setCandidates(getAllDocumentCandidates());
  };

  const handleReject = (candidateId: string) => {
    rejectDocumentCandidate(candidateId, 'Manually rejected by admin');
    setCandidates(getAllDocumentCandidates());
  };

  const handleBulkApprove = () => {
    const approvedCount = bulkApproveValidCandidates();
    setCandidates(getAllDocumentCandidates());
    alert(`${approvedCount} documents approved`);
  };

  const handleCreateManifest = () => {
    if (!manifestName.trim()) return;

    const manifest = generateImportManifest(manifestName, manifestDescription);
    setManifests(getAllImportManifests());
    setManifestDialog(false);
    setManifestName('');
    setManifestDescription('');

    // Trigger download
    const jsonData = exportManifestAsJson(manifest.id);
    downloadManifest(jsonData, `${manifest.name}.json`);
  };

  const downloadManifest = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getValidationChip = (status: ValidationStatus) => {
    switch (status) {
      case 'pending':
        return <Chip label="Pending" size="small" />;
      case 'validating':
        return <Chip label="Validating..." size="small" color="warning" />;
      case 'valid':
        return <Chip label="Valid" size="small" color="success" />;
      case 'invalid':
        return <Chip label="Invalid" size="small" color="error" />;
      case 'error':
        return <Chip label="Error" size="small" color="error" />;
      default:
        return <Chip label="Unknown" size="small" />;
    }
  };

  const getApprovalChip = (status: ApprovalStatus) => {
    switch (status) {
      case 'pending':
        return <Chip label="Pending" size="small" />;
      case 'approved':
        return <Chip label="Approved" size="small" color="success" />;
      case 'rejected':
        return <Chip label="Rejected" size="small" color="error" />;
      case 'needs_review':
        return <Chip label="Needs Review" size="small" color="warning" />;
      default:
        return <Chip label="Unknown" size="small" />;
    }
  };

  const stats = getSourcingStats();

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box sx={{
          width: 56, height: 56, borderRadius: '14px',
          bgcolor: alpha('#2196f3', 0.08),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CloudDownloadIcon sx={{ fontSize: 28, color: '#2196f3' }} />
        </Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
            Document Sourcing
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Review, validate, and approve candidate document URLs for import
          </Typography>
        </Box>
      </Box>

      {/* Statistics */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' }, gap: 2, mb: 4 }}>
        {[
          { label: 'Total', value: stats.totalCandidates, color: '#666' },
          { label: 'Pending', value: stats.pendingValidation, color: '#ff9800' },
          { label: 'Valid', value: stats.validCandidates, color: '#4caf50' },
          { label: 'Approved', value: stats.approvedCandidates, color: '#2196f3' },
          { label: 'Ready', value: stats.readyForImport, color: '#9c27b0' },
          { label: 'Manifests', value: manifests.length, color: '#00bcd4' },
        ].map((stat) => (
          <Card key={stat.label} elevation={0} sx={{
            bgcolor: alpha(stat.color, 0.04),
            border: `1px solid ${alpha(stat.color, 0.12)}`,
            borderRadius: '12px',
          }}>
            <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="h4" sx={{ fontWeight: 800, color: stat.color, fontFamily: '"Outfit", system-ui' }}>
                {stat.value}
              </Typography>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {stat.label}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Actions */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={refreshCandidates}
          disabled={loading}
        >
          Refresh Candidates
        </Button>
        <Button
          variant="outlined"
          startIcon={<PlaylistAddCheckIcon />}
          onClick={handleValidateAll}
          disabled={loading || candidates.length === 0}
        >
          Validate All URLs
        </Button>
        <Button
          variant="outlined"
          startIcon={<CheckCircleIcon />}
          onClick={handleBulkApprove}
          disabled={stats.validCandidates === 0}
        >
          Bulk Approve Valid
        </Button>
        <Button
          variant="contained"
          startIcon={<AssignmentIcon />}
          onClick={() => setManifestDialog(true)}
          disabled={stats.readyForImport === 0}
        >
          Generate Manifest
        </Button>
      </Stack>

      {/* Validation Progress */}
      {showValidationProgress && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Validating URLs: {validationProgress.completed} of {validationProgress.total}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(validationProgress.completed / validationProgress.total) * 100}
            />
          </Box>
        </Alert>
      )}

      {/* Document Candidates Table */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px' }}>
        <CardContent sx={{ p: 0 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Chemical</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>URL</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Validation</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Approval</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {candidates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4 }}>
                      <Typography color="text.secondary">
                        No document candidates found. Click "Refresh Candidates" to generate from intake records.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  candidates.map((candidate) => (
                    <TableRow key={candidate.id} hover>
                      <TableCell>{candidate.chemical}</TableCell>
                      <TableCell>
                        <Chip
                          label={candidate.documentType.toUpperCase()}
                          size="small"
                          color={candidate.documentType === 'label' ? 'primary' : 'secondary'}
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 300 }}>
                        <Tooltip title={candidate.candidateUrl}>
                          <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {candidate.candidateUrl}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>{getValidationChip(candidate.validationStatus)}</TableCell>
                      <TableCell>{getApprovalChip(candidate.approvalStatus)}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <Tooltip title="Preview URL">
                            <IconButton
                              size="small"
                              onClick={() => window.open(candidate.candidateUrl, '_blank')}
                            >
                              <VisibilityIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Validate">
                            <IconButton
                              size="small"
                              onClick={() => handleValidateSingle(candidate.id)}
                              disabled={candidate.validationStatus === 'validating'}
                            >
                              <RefreshIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Approve">
                            <IconButton
                              size="small"
                              onClick={() => handleApprove(candidate.id)}
                              disabled={candidate.validationStatus !== 'valid'}
                              color="success"
                            >
                              <CheckCircleIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Reject">
                            <IconButton
                              size="small"
                              onClick={() => handleReject(candidate.id)}
                              color="error"
                            >
                              <CancelIcon />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Import Manifests Section */}
      {manifests.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Import Manifests
          </Typography>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px' }}>
            <CardContent>
              {manifests.map((manifest) => (
                <Box key={manifest.id} sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  py: 2,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:last-child': { borderBottom: 'none' }
                }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600}>{manifest.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {manifest.totalDocuments} documents • Created {new Date(manifest.createdAt).toLocaleDateString()}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    startIcon={<DownloadIcon />}
                    onClick={() => {
                      const jsonData = exportManifestAsJson(manifest.id);
                      downloadManifest(jsonData, `${manifest.name}.json`);
                    }}
                  >
                    Download
                  </Button>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Create Manifest Dialog */}
      <Dialog open={manifestDialog} onClose={() => setManifestDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Import Manifest</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Manifest Name"
            fullWidth
            variant="outlined"
            value={manifestName}
            onChange={(e) => setManifestName(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Description (optional)"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={manifestDescription}
            onChange={(e) => setManifestDescription(e.target.value)}
          />
          <Alert severity="info" sx={{ mt: 2 }}>
            This will create a manifest with {stats.readyForImport} approved documents ready for import.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManifestDialog(false)}>Cancel</Button>
          <Button onClick={handleCreateManifest} variant="contained" disabled={!manifestName.trim()}>
            Create & Download
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}