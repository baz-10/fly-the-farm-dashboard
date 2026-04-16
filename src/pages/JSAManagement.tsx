import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Alert,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Add,
  Security,
  Edit,
  Visibility,
  Delete,
  Assignment,
  CheckCircle,
  Warning
} from '@mui/icons-material';

import JSASystem from '../components/JSASystem';
import { JSASystemRecord, RiskLevel } from '../types/jsa';

// Mock JSA records for demonstration
const mockJSARecords: JSASystemRecord[] = [
  {
    id: 'jsa_1',
    missionId: 'mission_1',
    systemType: 'standard',
    status: 'approved',
    jsaNumber: 'JSA-2026-001',
    title: 'Standard JSA - JSA-2026-001',
    completedBy: 'user_1',
    responsiblePerson: {
      name: 'John Smith',
      licenseNumber: 'RePL-12345',
      company: 'Fly The Farm',
      contactDetails: 'john.smith@flythefarm.com.au'
    },
    hazards: [],
    overallRisk: {
      highestRiskLevel: 'medium',
      totalHazards: 8,
      highRiskHazards: 2,
      extremeRiskHazards: 0,
      requiresCRPApproval: false
    },
    signatures: {
      pilot: {
        userId: 'user_1',
        name: 'John Smith',
        signature: 'Digital signature applied',
        signedAt: '2026-04-12T08:30:00.000Z'
      }
    },
    emergencyContacts: {
      primary: {
        name: 'Jane Smith',
        relationship: 'Spouse',
        phone: '+61 400 123 456'
      },
      emergencyServices: ['000', 'CASA Emergency: 131 450']
    },
    createdAt: '2026-04-12T08:00:00.000Z',
    updatedAt: '2026-04-12T08:30:00.000Z'
  }
];

export default function JSAManagement() {
  const theme = useTheme();
  const [jsaRecords, setJSARecords] = useState<JSASystemRecord[]>(mockJSARecords);
  const [showJSASystem, setShowJSASystem] = useState(false);
  const [editingJSA, setEditingJSA] = useState<JSASystemRecord | null>(null);
  const [viewingJSA, setViewingJSA] = useState<JSASystemRecord | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  // Handle JSA creation/completion
  const handleJSAComplete = (completedJSA: JSASystemRecord) => {
    setJSARecords(prev => {
      const existingIndex = prev.findIndex(jsa => jsa.id === completedJSA.id);
      if (existingIndex >= 0) {
        // Update existing JSA
        const updated = [...prev];
        updated[existingIndex] = completedJSA;
        return updated;
      } else {
        // Add new JSA
        return [...prev, completedJSA];
      }
    });
    setShowJSASystem(false);
    setEditingJSA(null);
  };

  // Handle JSA editing
  const handleEditJSA = (jsa: JSASystemRecord) => {
    setEditingJSA(jsa);
    setShowJSASystem(true);
  };

  // Handle JSA viewing
  const handleViewJSA = (jsa: JSASystemRecord) => {
    setViewingJSA(jsa);
    setViewDialogOpen(true);
  };

  // Handle JSA deletion
  const handleDeleteJSA = (jsaId: string) => {
    if (window.confirm('Are you sure you want to delete this JSA? This action cannot be undone.')) {
      setJSARecords(prev => prev.filter(jsa => jsa.id !== jsaId));
    }
  };

  // Get risk chip color
  const getRiskChipColor = (risk: RiskLevel) => {
    switch (risk) {
      case 'low': return 'success';
      case 'medium': return 'warning';
      case 'high': return 'error';
      case 'extreme': return 'secondary';
      default: return 'default';
    }
  };

  // Get status chip color
  const getStatusChipColor = (status: string) => {
    switch (status) {
      case 'approved': return 'success';
      case 'completed': return 'info';
      case 'in-progress': return 'warning';
      case 'draft': return 'default';
      case 'rejected': return 'error';
      default: return 'default';
    }
  };

  if (showJSASystem) {
    return (
      <JSASystem
        missionId="demo_mission"
        existingJSA={editingJSA}
        onJSAComplete={handleJSAComplete}
        onCancel={() => {
          setShowJSASystem(false);
          setEditingJSA(null);
        }}
      />
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container alignItems="center" spacing={2}>
            <Grid sx={{ flexGrow: 1 }}>
              <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <Security sx={{ mr: 2, color: theme.palette.primary.main }} />
                Job Safety Analysis Management
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Create, manage, and track Job Safety Analysis records for mission operations.
                Comprehensive safety analysis ensures regulatory compliance and operational safety.
              </Typography>
            </Grid>
            <Grid>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => setShowJSASystem(true)}
                size="large"
              >
                Create New JSA
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* JSA System Overview */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Total JSAs</Typography>
              <Typography variant="h3" color="primary">
                {jsaRecords.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Approved</Typography>
              <Typography variant="h3" color="success.main">
                {jsaRecords.filter(jsa => jsa.status === 'approved').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Pending Approval</Typography>
              <Typography variant="h3" color="warning.main">
                {jsaRecords.filter(jsa => jsa.status === 'completed').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>High Risk JSAs</Typography>
              <Typography variant="h3" color="error.main">
                {jsaRecords.filter(jsa => jsa.overallRisk.requiresCRPApproval).length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* JSA Types Information */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Available JSA Types</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2, bgcolor: theme.palette.surface?.glass || '#f5f5f5' }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Standard JSA
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Pre-defined hazards with standard risk assessments and mitigation strategies.
                  Suitable for routine operations.
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2, bgcolor: theme.palette.surface?.glass || '#f5f5f5' }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Comprehensive JSA
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Custom hazard analysis with unlimited hazards and detailed risk management.
                  For complex or unique operations.
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 2, bgcolor: theme.palette.surface?.glass || '#f5f5f5' }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  Industry-Specific JSA
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Specialized templates for crop spraying, surveying, or inspection operations
                  with industry-specific hazards.
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* JSA Records Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            JSA Records
          </Typography>

          {jsaRecords.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center', bgcolor: theme.palette.surface?.glass || '#f5f5f5' }}>
              <Assignment sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No JSA Records Found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Start by creating your first Job Safety Analysis to ensure safe mission operations.
              </Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => setShowJSASystem(true)}
              >
                Create First JSA
              </Button>
            </Paper>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>JSA Number</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Responsible Person</TableCell>
                    <TableCell align="center">Status</TableCell>
                    <TableCell align="center">Overall Risk</TableCell>
                    <TableCell align="center">Hazards</TableCell>
                    <TableCell align="center">Created</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {jsaRecords.map((jsa) => (
                    <TableRow key={jsa.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {jsa.jsaNumber}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {jsa.title}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={jsa.systemType.toUpperCase().replace('-', ' ')}
                          size="small"
                          variant="outlined"
                        />
                        {jsa.industryType && (
                          <Chip
                            label={jsa.industryType.toUpperCase().replace('-', ' ')}
                            size="small"
                            variant="outlined"
                            sx={{ ml: 0.5 }}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{jsa.responsiblePerson.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {jsa.responsiblePerson.licenseNumber}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={jsa.status.toUpperCase()}
                          size="small"
                          color={getStatusChipColor(jsa.status)}
                        />
                        {jsa.overallRisk.requiresCRPApproval && (
                          <Box sx={{ mt: 0.5 }}>
                            <Chip
                              label="CRP REQUIRED"
                              size="small"
                              color="warning"
                              icon={<Warning />}
                            />
                          </Box>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={jsa.overallRisk.highestRiskLevel.toUpperCase()}
                          size="small"
                          color={getRiskChipColor(jsa.overallRisk.highestRiskLevel)}
                          sx={{ fontWeight: 'bold' }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2">
                          {jsa.overallRisk.totalHazards} total
                        </Typography>
                        {jsa.overallRisk.extremeRiskHazards > 0 && (
                          <Typography variant="caption" color="secondary">
                            {jsa.overallRisk.extremeRiskHazards} extreme
                          </Typography>
                        )}
                        {jsa.overallRisk.highRiskHazards > 0 && (
                          <Typography variant="caption" color="error">
                            {jsa.overallRisk.highRiskHazards} high
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2">
                          {new Date(jsa.createdAt).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <IconButton
                            size="small"
                            onClick={() => handleViewJSA(jsa)}
                            color="primary"
                            title="View JSA"
                          >
                            <Visibility />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleEditJSA(jsa)}
                            color="primary"
                            title="Edit JSA"
                          >
                            <Edit />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteJSA(jsa.id)}
                            color="error"
                            title="Delete JSA"
                          >
                            <Delete />
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* View JSA Dialog */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          JSA Details: {viewingJSA?.jsaNumber}
        </DialogTitle>
        <DialogContent>
          {viewingJSA && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="body2" color="text.secondary">System Type</Typography>
                <Typography variant="body1">{viewingJSA.systemType}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="body2" color="text.secondary">Status</Typography>
                <Chip
                  label={viewingJSA.status.toUpperCase()}
                  size="small"
                  color={getStatusChipColor(viewingJSA.status)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="body2" color="text.secondary">Responsible Person</Typography>
                <Typography variant="body1">{viewingJSA.responsiblePerson.name}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="body2" color="text.secondary">License Number</Typography>
                <Typography variant="body1">{viewingJSA.responsiblePerson.licenseNumber}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="body2" color="text.secondary">Overall Risk</Typography>
                <Chip
                  label={viewingJSA.overallRisk.highestRiskLevel.toUpperCase()}
                  size="small"
                  color={getRiskChipColor(viewingJSA.overallRisk.highestRiskLevel)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="body2" color="text.secondary">Total Hazards</Typography>
                <Typography variant="body1">{viewingJSA.overallRisk.totalHazards}</Typography>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Typography variant="body2" color="text.secondary">Emergency Contact</Typography>
                <Typography variant="body1">
                  {viewingJSA.emergencyContacts.primary.name} ({viewingJSA.emergencyContacts.primary.relationship})
                  - {viewingJSA.emergencyContacts.primary.phone}
                </Typography>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
          <Button
            onClick={() => {
              setViewDialogOpen(false);
              if (viewingJSA) handleEditJSA(viewingJSA);
            }}
            variant="contained"
          >
            Edit JSA
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}