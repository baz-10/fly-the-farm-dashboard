import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import SecurityIcon from '@mui/icons-material/Security';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useMission } from '../contexts/MissionContext';
import type { JSARecord, JSAStatus, MissionRecord } from '../types/mission';

const STATUS_TONES: Record<JSAStatus, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  pending: 'default',
  'in-progress': 'warning',
  completed: 'info',
  approved: 'success',
  rejected: 'error',
};

const RISK_ORDER = ['low', 'medium', 'high', 'critical'] as const;
type RiskLevel = typeof RISK_ORDER[number];

const RISK_TONES: Record<RiskLevel, 'success' | 'warning' | 'error'> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
  critical: 'error',
};

function highestResidualRisk(jsa: JSARecord): RiskLevel {
  return jsa.hazardIdentification.reduce<RiskLevel>((highest, hazard) => (
    RISK_ORDER.indexOf(hazard.residualRisk) > RISK_ORDER.indexOf(highest) ? hazard.residualRisk : highest
  ), 'low');
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card elevation={0} sx={{ border: '1px solid rgba(20,58,26,0.1)', borderRadius: '8px' }}>
      <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
        <Typography sx={{ fontSize: '0.74rem', fontWeight: 800, color: 'text.secondary' }}>{label}</Typography>
        <Typography sx={{ mt: 0.5, fontSize: '1.75rem', fontWeight: 900, color: tone }}>{value}</Typography>
      </CardContent>
    </Card>
  );
}

export default function JSAManagement() {
  const { missions, isLoading, error } = useMission();
  const navigate = useNavigate();
  const theme = useTheme();
  const [viewing, setViewing] = React.useState<MissionRecord | null>(null);

  const records = React.useMemo(
    () => missions
      .filter((mission) => Boolean(mission.jsaRecord?.id))
      .sort((a, b) => (b.jsaRecord.updatedAt || b.updatedAt).localeCompare(a.jsaRecord.updatedAt || a.updatedAt)),
    [missions],
  );
  const approved = records.filter((mission) => mission.jsaRecord.status === 'approved').length;
  const pending = records.filter((mission) => mission.jsaRecord.status !== 'approved').length;
  const highRisk = records.filter((mission) => ['high', 'critical'].includes(highestResidualRisk(mission.jsaRecord))).length;

  const openMission = (mission: MissionRecord) => {
    navigate(`/missions/${encodeURIComponent(mission.id)}?section=jsa`);
  };

  return (
    <Box sx={{ pb: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'flex-start' }} spacing={2} sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{ width: 50, height: 50, borderRadius: '8px', bgcolor: alpha(theme.palette.primary.main, 0.1), display: 'grid', placeItems: 'center', color: 'primary.main' }}>
            <SecurityIcon />
          </Box>
          <Box>
            <Typography variant="h4" fontWeight={900}>CASA JSA Register</Typography>
            <Typography variant="body2" color="text.secondary">Mission safety assessments, risk controls and sign-offs.</Typography>
          </Box>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/missions/new')}>
          Plan Mission & CASA JSA
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {isLoading && <Alert severity="info" sx={{ mb: 2 }}>Loading mission safety records...</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="CASA JSAs" value={records.length} tone={theme.palette.primary.main} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Approved" value={approved} tone={theme.palette.success.main} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="Needs Action" value={pending} tone={theme.palette.warning.main} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><StatCard label="High Residual Risk" value={highRisk} tone={theme.palette.error.main} /></Grid>
      </Grid>

      <Card elevation={0} sx={{ border: '1px solid rgba(20,58,26,0.1)', borderRadius: '8px', overflow: 'hidden' }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          {records.length === 0 && !isLoading ? (
            <Stack alignItems="center" textAlign="center" sx={{ py: 7, px: 2 }}>
              <SecurityIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1.5 }} />
              <Typography variant="h6" fontWeight={850}>No CASA JSAs yet</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5, maxWidth: 460 }}>
                A CASA JSA is created with each saved mission. Add hazards, controls and sign-offs before authorisation.
              </Typography>
              <Button variant="contained" startIcon={<FlightTakeoffIcon />} onClick={() => navigate('/missions/new')}>
                Create first mission
              </Button>
            </Stack>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Mission</TableCell>
                    <TableCell>CASA JSA</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Hazards</TableCell>
                    <TableCell>Residual Risk</TableCell>
                    <TableCell>Sign-offs</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.map((mission) => {
                    const jsa = mission.jsaRecord;
                    const risk = highestResidualRisk(jsa);
                    const signOffCount = Number(Boolean(jsa.signOffs.pilot?.signature)) + Number(Boolean(jsa.signOffs.crp?.signature));
                    return (
                      <TableRow key={mission.id} hover>
                        <TableCell>
                          <Typography sx={{ fontSize: '0.84rem', fontWeight: 850 }}>{mission.missionName}</Typography>
                          <Typography variant="caption" color="text.secondary">{mission.missionNumber}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 750 }}>{jsa.jsaNumber}</Typography>
                          <Typography variant="caption" color="text.secondary">{jsa.jsaType.replaceAll('-', ' ')}</Typography>
                        </TableCell>
                        <TableCell><Chip size="small" label={jsa.status} color={STATUS_TONES[jsa.status]} /></TableCell>
                        <TableCell>{jsa.hazardIdentification.length}</TableCell>
                        <TableCell><Chip size="small" label={risk} color={RISK_TONES[risk]} /></TableCell>
                        <TableCell>
                          <Typography variant="body2">{signOffCount} recorded</Typography>
                          {['high', 'critical'].includes(risk) && !jsa.signOffs.crp?.signature && (
                            <Typography variant="caption" color="error.main">CRP required</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton aria-label={`View ${jsa.jsaNumber}`} onClick={() => setViewing(mission)}><VisibilityIcon fontSize="small" /></IconButton>
                          <IconButton aria-label={`Edit ${jsa.jsaNumber}`} onClick={() => openMission(mission)}><EditIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(viewing)} onClose={() => setViewing(null)} maxWidth="md" fullWidth>
        <DialogTitle>{viewing?.jsaRecord.jsaNumber} - {viewing?.missionName}</DialogTitle>
        <DialogContent dividers>
          {viewing && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label={viewing.jsaRecord.status} color={STATUS_TONES[viewing.jsaRecord.status]} />
                <Chip label={`${viewing.jsaRecord.hazardIdentification.length} hazards`} variant="outlined" />
                <Chip label={`${highestResidualRisk(viewing.jsaRecord)} residual risk`} color={RISK_TONES[highestResidualRisk(viewing.jsaRecord)]} />
              </Stack>
              {viewing.jsaRecord.hazardIdentification.length === 0 ? (
                <Alert severity="warning">No hazards have been recorded for this mission.</Alert>
              ) : viewing.jsaRecord.hazardIdentification.map((hazard) => (
                <Card key={hazard.id} variant="outlined" sx={{ borderRadius: '8px' }}>
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" spacing={2}>
                      <Box>
                        <Typography fontWeight={850}>{hazard.description}</Typography>
                        <Typography variant="caption" color="text.secondary">{hazard.category}</Typography>
                      </Box>
                      <Chip size="small" label={`${hazard.residualRisk} residual`} color={RISK_TONES[hazard.residualRisk]} />
                    </Stack>
                    <Typography variant="subtitle2" sx={{ mt: 1.5 }}>Controls</Typography>
                    {hazard.controlMeasures.length > 0 ? (
                      <Box component="ul" sx={{ mt: 0.5, mb: 0, pl: 2.5 }}>
                        {hazard.controlMeasures.map((control, index) => <Typography component="li" variant="body2" key={`${hazard.id}-${index}`}>{control}</Typography>)}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="error.main">No controls recorded</Typography>
                    )}
                  </CardContent>
                </Card>
              ))}
              {['high', 'critical'].includes(highestResidualRisk(viewing.jsaRecord)) && !viewing.jsaRecord.signOffs.crp?.signature && (
                <Alert severity="error" icon={<WarningAmberIcon />}>High residual risk requires CRP sign-off before approval.</Alert>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewing(null)}>Close</Button>
          {viewing && <Button variant="contained" onClick={() => openMission(viewing)}>Edit CASA JSA</Button>}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
