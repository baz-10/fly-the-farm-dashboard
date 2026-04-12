import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  TextField,
  Stack,
  Alert,
  MenuItem,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Rating,
  FormControlLabel,
  Switch,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  alpha,
  useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ScienceIcon from '@mui/icons-material/Science';
import AirIcon from '@mui/icons-material/Air';
import BugReportIcon from '@mui/icons-material/BugReport';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import PersonIcon from '@mui/icons-material/Person';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddIcon from '@mui/icons-material/Add';
import StarIcon from '@mui/icons-material/Star';
import DescriptionIcon from '@mui/icons-material/Description';
import DownloadIcon from '@mui/icons-material/Download';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import GavelIcon from '@mui/icons-material/Gavel';
import {
  getJobById,
  getFieldById,
  getPropertyById,
  getClientById,
  deleteJob,
  getOutcomeByJob,
  saveOutcome,
  updateOutcome,
} from '../services/fieldManagementStore';
import { getActualByJobId } from '../services/financialsStore';
import { getReportsForJob, AskFtfReportRecord } from '../services/askFtfReportStore';
import { JobOutcome, EfficacyRating, PhotoRef } from '../types/fieldManagement';
import PhotoUpload from '../components/PhotoUpload';
import { generateClientReportPdf } from '../utils/clientReportPdf';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

const efficacyLabels: Record<number, string> = {
  1: 'No effect',
  2: 'Poor',
  3: 'Moderate',
  4: 'Good',
  5: 'Excellent',
};

export default function JobDetail() {
  const { clientId, propertyId, fieldId, jobId } = useParams<{
    clientId: string; propertyId: string; fieldId: string; jobId: string;
  }>();
  const navigate = useNavigate();
  const theme = useTheme();

  const [job] = useState(() => getJobById(jobId || ''));
  const field = getFieldById(fieldId || '');
  const property = getPropertyById(propertyId || '');
  const client = getClientById(clientId || '');

  const existingActual = getActualByJobId(jobId || '');
  const [outcome, setOutcome] = useState(() => getOutcomeByJob(jobId || ''));
  const [ftfReports] = useState<AskFtfReportRecord[]>(() => getReportsForJob(jobId || ''));
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [complianceRecords] = useState(() => {
    const allRecords = JSON.parse(localStorage.getItem('compliance-records') || '[]');
    return allRecords.filter((record: any) => record.jobId === jobId);
  });
  const [outcomeDialogOpen, setOutcomeDialogOpen] = useState(false);
  const [outcomeForm, setOutcomeForm] = useState({
    followUpDate: '',
    efficacyRating: 3 as EfficacyRating,
    regrowthObserved: false,
    followUpRequired: false,
    notes: '',
    photos: [] as PhotoRef[],
  });
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  if (!job || !field || !property || !client) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>Back</Button>
        <Alert severity="error">Job not found.</Alert>
      </Box>
    );
  }

  const basePath = `/jobs/client/${clientId}/property/${propertyId}/field/${fieldId}`;

  const handleDelete = () => {
    deleteJob(job.id);
    navigate(basePath);
  };

  const handleOpenOutcome = () => {
    if (outcome) {
      setOutcomeForm({
        followUpDate: outcome.followUpDate,
        efficacyRating: outcome.efficacyRating,
        regrowthObserved: outcome.regrowthObserved,
        followUpRequired: outcome.followUpRequired,
        notes: outcome.notes,
        photos: outcome.photos || [],
      });
    } else {
      setOutcomeForm({
        followUpDate: '',
        efficacyRating: 3 as EfficacyRating,
        regrowthObserved: false,
        followUpRequired: false,
        notes: '',
        photos: [],
      });
    }
    setOutcomeDialogOpen(true);
  };

  const handleSaveOutcome = () => {
    const { photos, ...rest } = outcomeForm;
    if (outcome) {
      const updated = updateOutcome(outcome.id, { ...rest, photos });
      setOutcome(updated);
    } else {
      const created = saveOutcome({
        jobId: job.id,
        ...rest,
        photos,
      });
      setOutcome(created);
    }
    setOutcomeDialogOpen(false);
  };

  const getEfficacyColor = (rating: number) => {
    if (rating >= 4) return { bg: alpha('#4caf50', 0.1), color: '#2e7d32' };
    if (rating >= 3) return { bg: alpha('#ff9800', 0.1), color: '#e65100' };
    return { bg: alpha('#f44336', 0.1), color: '#c62828' };
  };

  const InfoRow = ({ label, value }: { label: string; value: string | null | undefined }) => {
    if (!value) return null;
    return (
      <Box sx={{ display: 'flex', gap: 2, py: 0.75 }}>
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 130, fontWeight: 600 }}>{label}</Typography>
        <Typography variant="body2">{value}</Typography>
      </Box>
    );
  };

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(basePath)}
        sx={{ mb: 3, color: 'text.secondary', fontWeight: 600, '&:hover': { color: 'primary.main' } }}
      >
        {field.name}
      </Button>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }} className="ftf-animate-in">
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.dark', fontSize: { xs: '1.4rem', md: '1.75rem' } }}>
            Spray Job — {new Date(job.dateSprayed).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {client.name} &bull; {property.name} &bull; {field.name}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.5}>
          <IconButton
            size="small"
            onClick={() => {
              const prefill = {
                fromJobId: job.id,
                clientId: job.clientId,
                propertyId: job.propertyId,
                fieldIds: [job.fieldId],
                jobDescription: `Spray job: ${job.weedTarget} — ${job.chemicals.map(c => c.product).join(', ')}`,
                chemicals: job.chemicals,
                droneModel: job.droneModel,
              };
              sessionStorage.setItem('ftf_quote_prefill', JSON.stringify(prefill));
              navigate('/quotes/new');
            }}
            sx={{ color: '#6a4c93' }}
            title="Create Quote"
          >
            <ReceiptLongIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
              const prefill = {
                jobId: job.id,
                clientId: job.clientId,
                propertyId: job.propertyId,
                fieldId: job.fieldId,
                title: `${job.weedTarget} — ${client.name}`,
                jobDate: job.dateSprayed,
                quoteId: job.quoteId || undefined,
              };
              sessionStorage.setItem('ftf_actual_prefill', JSON.stringify(prefill));
              navigate('/financials/new');
            }}
            sx={{ color: '#d4782f' }}
            title="Record Actuals"
          >
            <AccountBalanceIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => setDeleteConfirm(true)} sx={{ color: 'error.main' }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {job.quoteId && (
        <Chip
          label="Linked Quote"
          size="small"
          onClick={() => navigate(`/quotes/${job.quoteId}`)}
          sx={{ cursor: 'pointer', fontWeight: 700, mb: 2 }}
          color="secondary"
          variant="outlined"
        />
      )}
      {existingActual && (
        <Chip
          label="View Actuals"
          size="small"
          onClick={() => navigate(`/financials/${existingActual.id}`)}
          sx={{ cursor: 'pointer', fontWeight: 700, mb: 2 }}
          color="warning"
          variant="outlined"
        />
      )}

      <Stack spacing={3} className="ftf-animate-in-delay-1">
        {/* Weed & Chemicals */}
        <Card elevation={0} sx={{ border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`, borderRadius: '16px' }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <ScienceIcon sx={{ color: 'primary.main', fontSize: 20 }} />
              <Typography variant="subtitle1" fontWeight={700} color="primary.dark">Weed & Chemicals</Typography>
            </Box>
            <InfoRow label="Weed Target" value={job.weedTarget} />

            {job.chemicals && job.chemicals.length > 0 ? (
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ mb: 1 }}>
                  Chemicals ({job.chemicals.length})
                </Typography>
                <Stack spacing={1.5}>
                  {job.chemicals.map((chem, idx) => (
                    <Box key={idx} sx={{
                      p: 1.5, borderRadius: '10px',
                      bgcolor: alpha(theme.palette.primary.main, 0.03),
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.06)}`,
                    }}>
                      <Typography variant="body2" fontWeight={700}>{chem.product}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {chem.activeIngredient}
                      </Typography>
                      {chem.ratePerHa && (
                        <Typography variant="caption" color="text.secondary">
                          Rate: {chem.ratePerHa}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Stack>
              </Box>
            ) : (
              <>
                <InfoRow label="Chemical" value={job.chemicalUsed} />
                <InfoRow label="Active Ingredient" value={job.activeIngredient} />
                <InfoRow label="Spray Rate" value={job.sprayRateLHa ? `${job.sprayRateLHa} L/ha` : null} />
              </>
            )}

            <Box sx={{ mt: 1.5 }}>
              <InfoRow label="Water Rate" value={job.waterRateLHa ? `${job.waterRateLHa} L/ha` : null} />
              <InfoRow label="Adjuvants" value={job.adjuvants} />
            </Box>
          </CardContent>
        </Card>

        {/* Batch Info */}
        {job.batchInfo && (
          <Card elevation={0} sx={{
            border: `1.5px solid ${alpha('#1976d2', 0.15)}`,
            borderRadius: '16px',
            bgcolor: alpha('#1976d2', 0.02),
          }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <LocalShippingIcon sx={{ color: '#1976d2', fontSize: 20 }} />
                <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#1976d2' }}>Batch Mix</Typography>
              </Box>

              <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                {[
                  { label: 'Hectares', value: `${job.batchInfo.hectares} ha` },
                  { label: 'App Rate', value: `${job.batchInfo.applicationRateLHa} L/ha` },
                  { label: 'Tank Size', value: `${job.batchInfo.tankSizeL} L` },
                  { label: 'Total Volume', value: `${job.batchInfo.totalSprayVolumeL} L` },
                  { label: 'Batches', value: String(job.batchInfo.totalBatches) },
                  { label: 'Ha / Batch', value: `${Number(job.batchInfo.hectaresPerBatch.toFixed(2))} ha` },
                ].map((s) => (
                  <Box key={s.label}>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: '#1976d2', fontFamily: '"Outfit", system-ui', lineHeight: 1 }}>
                      {s.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                  </Box>
                ))}
              </Stack>

              <TableContainer sx={{ borderRadius: '10px', border: `1px solid ${alpha('#1976d2', 0.1)}` }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 700, fontSize: '0.7rem', color: 'text.secondary' } }}>
                      <TableCell>Product</TableCell>
                      <TableCell align="right">Rate / ha</TableCell>
                      <TableCell align="right">Per Batch</TableCell>
                      <TableCell align="right">Total Job</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {job.batchInfo.chemicalBreakdown.map((c, idx) => (
                      <TableRow key={idx}>
                        <TableCell><Typography variant="body2" fontWeight={600}>{c.name}</Typography></TableCell>
                        <TableCell align="right"><Typography variant="body2">{c.ratePerHa} {c.unit}/ha</Typography></TableCell>
                        <TableCell align="right"><Typography variant="body2" fontWeight={700} sx={{ color: '#1976d2' }}>{Number(c.perBatch.toFixed(2))} {c.unit}</Typography></TableCell>
                        <TableCell align="right"><Typography variant="body2" fontWeight={700} sx={{ color: '#1b8a5a' }}>{Number(c.totalJob.toFixed(2))} {c.unit}</Typography></TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ bgcolor: alpha('#1976d2', 0.04) }}>
                      <TableCell><Typography variant="body2" fontWeight={700} sx={{ color: '#1976d2' }}>Water</Typography></TableCell>
                      <TableCell />
                      <TableCell align="right"><Typography variant="body2" fontWeight={700} sx={{ color: '#1976d2' }}>{Number(job.batchInfo.waterPerBatchL.toFixed(1))} L</Typography></TableCell>
                      <TableCell align="right"><Typography variant="body2" fontWeight={700} sx={{ color: '#1976d2' }}>{Number((job.batchInfo.waterPerBatchL * job.batchInfo.totalBatches).toFixed(0))} L</Typography></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        )}

        {/* Date & Weather */}
        <Card elevation={0} sx={{ border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`, borderRadius: '16px' }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <AirIcon sx={{ color: 'primary.main', fontSize: 20 }} />
              <Typography variant="subtitle1" fontWeight={700} color="primary.dark">Date & Weather</Typography>
            </Box>
            <InfoRow label="Date Sprayed" value={new Date(job.dateSprayed).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />

            {/* Recorded Spray Conditions (2-hourly) */}
            {job.sprayConditions && job.sprayConditions.length > 0 ? (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ mb: 1 }}>
                  Recorded Spray Conditions ({job.sprayConditions.length} recording{job.sprayConditions.length !== 1 ? 's' : ''})
                </Typography>
                <TableContainer sx={{
                  borderRadius: '12px',
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
                  maxHeight: 300,
                }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Time</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Temp</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Humidity</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Dewpoint</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Delta T</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Wind</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Gusts</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Dir</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {job.sprayConditions.map((entry) => {
                        const hour = new Date(entry.time).getHours();
                        const min = new Date(entry.time).getMinutes();
                        const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
                        return (
                          <TableRow key={entry.time}>
                            <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{timeStr}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.tempC}°C</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.humidity}%</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.dewpointC}°C</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.deltaT}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.windSpeedKmh}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.windGustsKmh}</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{entry.windDirection}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            ) : (
              /* Fallback: show single weather snapshot for older jobs */
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ mb: 0.5 }}>Spray Conditions</Typography>
                <InfoRow label="Temperature" value={job.weather.tempC != null ? `${job.weather.tempC}°C` : null} />
                <InfoRow label="Humidity" value={job.weather.humidity != null ? `${job.weather.humidity}%` : null} />
                <InfoRow label="Delta T" value={job.weather.deltaT != null ? String(job.weather.deltaT) : null} />
                <InfoRow label="Wind Speed" value={job.weather.windSpeedKmh != null ? `${job.weather.windSpeedKmh} km/h` : null} />
                <InfoRow label="Wind Direction" value={job.weather.windDirection || null} />
              </Box>
            )}

            {/* Reference weather log from API */}
            {job.weatherLog && job.weatherLog.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ mb: 1 }}>
                  2-Hourly Weather Reference
                </Typography>
                <TableContainer sx={{
                  borderRadius: '12px',
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
                  maxHeight: 280,
                }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Time</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Temp</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Humidity</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Delta T</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Wind</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Gusts</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Dir</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {job.weatherLog.map((entry) => {
                        const hour = new Date(entry.time).getHours();
                        return (
                          <TableRow key={entry.time}>
                            <TableCell sx={{ fontSize: '0.8rem' }}>{String(hour).padStart(2, '0')}:00</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.tempC}°C</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.humidity}%</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.deltaT}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.windSpeedKmh}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.windGustsKmh}</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{entry.windDirection}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                  Weather data by Open-Meteo.com
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Operator */}
        {(job.droneModel || job.applicatorName || job.notes) && (
          <Card elevation={0} sx={{ border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`, borderRadius: '16px' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} color="primary.dark" sx={{ mb: 2 }}>Operator Details</Typography>
              <InfoRow label="Drone Model" value={job.droneModel} />
              <InfoRow label="Applicator" value={job.applicatorName} />
              <InfoRow label="Notes" value={job.notes} />
            </CardContent>
          </Card>
        )}

        {/* Spray Recommendation */}
        {job.sprayRec && (
          <Card elevation={0} sx={{ border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`, borderRadius: '16px' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <DescriptionIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                <Typography variant="subtitle1" fontWeight={700} color="primary.dark">Spray Recommendation</Typography>
              </Box>
              <Box sx={{
                p: 2, borderRadius: '12px',
                bgcolor: alpha(theme.palette.primary.main, 0.03),
                border: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 1.5,
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <DescriptionIcon sx={{ color: 'primary.main' }} />
                  <Box>
                    <Typography variant="body2" fontWeight={700}>{job.sprayRec.fileName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {job.sprayRec.sizeBytes < 1048576
                        ? `${(job.sprayRec.sizeBytes / 1024).toFixed(1)} KB`
                        : `${(job.sprayRec.sizeBytes / 1048576).toFixed(1)} MB`
                      } &bull; Uploaded {new Date(job.sprayRec.uploadedAt).toLocaleDateString('en-AU')}
                    </Typography>
                  </Box>
                </Box>
                <Button
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = job.sprayRec!.dataUrl;
                    a.download = job.sprayRec!.fileName;
                    a.click();
                  }}
                  sx={{ borderRadius: '8px', fontWeight: 600 }}
                >
                  Download
                </Button>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Fly The Farm Reports */}
        {ftfReports.length > 0 && (
          <Card elevation={0} sx={{
            border: `1.5px solid ${alpha('#1565c0', 0.15)}`,
            borderRadius: '16px',
          }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <AssessmentIcon sx={{ color: '#1565c0', fontSize: 20 }} />
                <Typography variant="subtitle1" fontWeight={700} color="primary.dark">
                  Fly The Farm Reports ({ftfReports.length})
                </Typography>
              </Box>

              <Stack spacing={1.5}>
                {ftfReports.map((report) => {
                  const isExpanded = expandedReportId === report.id;
                  return (
                    <Box key={report.id} sx={{
                      borderRadius: '12px',
                      border: `1px solid ${alpha('#1565c0', 0.1)}`,
                      overflow: 'hidden',
                    }}>
                      <Box
                        sx={{
                          p: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          bgcolor: isExpanded ? alpha('#1565c0', 0.04) : 'transparent',
                          '&:hover': { bgcolor: alpha('#1565c0', 0.04) },
                        }}
                        onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                      >
                        <Box>
                          <Typography variant="body2" fontWeight={700}>
                            {report.product}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(report.createdAt).toLocaleDateString('en-AU', {
                              day: 'numeric', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                            {' \u2022 '}Aircraft: {report.aircraft}
                            {' \u2022 '}Target: {report.target}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <IconButton
                            size="small"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const input = {
                                question: report.question,
                                chemical: report.context.chemical,
                                aircraft: report.aircraft,
                                target: report.target,
                                state: report.context.state,
                                terrain: report.context.terrain,
                                boundaries: report.context.boundaries,
                              };
                              await generateClientReportPdf(report.clientReport, input, report.operatorBriefing);
                            }}
                            title="Export PDF"
                          >
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small">
                            {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          </IconButton>
                        </Box>
                      </Box>

                      {isExpanded && (
                        <Box sx={{
                          px: 2, pb: 2,
                          borderTop: `1px solid ${alpha('#1565c0', 0.08)}`,
                        }}>
                          {/* Primary View: Operator Briefing */}
                          {report.operatorBriefing && (
                            <Box sx={{ mt: 1.5 }}>
                              {/* Mission Status */}
                              <Box sx={{ mb: 2 }}>
                                <Chip
                                  label={`MISSION STATUS: ${report.operatorBriefing.missionStatus.status}`}
                                  sx={{
                                    fontWeight: 800,
                                    fontSize: '0.75rem',
                                    bgcolor:
                                      report.operatorBriefing.missionStatus.status === 'GO' ? alpha('#4caf50', 0.15) :
                                      report.operatorBriefing.missionStatus.status === 'CONDITIONAL' ? alpha('#ff9800', 0.15) :
                                      alpha('#f44336', 0.15),
                                    color:
                                      report.operatorBriefing.missionStatus.status === 'GO' ? '#2e7d32' :
                                      report.operatorBriefing.missionStatus.status === 'CONDITIONAL' ? '#e65100' :
                                      '#c62828',
                                  }}
                                />
                              </Box>

                              {/* Critical Blockers */}
                              {report.operatorBriefing.criticalBlockers.length > 0 && (
                                <Box sx={{ mt: 1.5 }}>
                                  <Typography variant="body2" fontWeight={700} sx={{ color: '#d32f2f', mb: 0.5 }}>
                                    🚫 Critical Blockers
                                  </Typography>
                                  {report.operatorBriefing.criticalBlockers.map((item, i) => (
                                    <Box key={i} sx={{ mb: 1.5, pl: 2, borderLeft: '3px solid #d32f2f', bgcolor: alpha('#d32f2f', 0.05), p: 1, borderRadius: 1 }}>
                                      <Typography variant="body2" fontWeight={600} sx={{ color: '#d32f2f', mb: 0.5 }}>
                                        {item.title}
                                      </Typography>
                                      <Typography variant="caption" sx={{ display: 'block', mb: 0.5, color: '#d32f2f' }}>
                                        {item.why}
                                      </Typography>
                                      {item.actionToResolve && (
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                                          Action: {item.actionToResolve}
                                        </Typography>
                                      )}
                                    </Box>
                                  ))}
                                </Box>
                              )}

                              {/* Key Cautions */}
                              {report.operatorBriefing.keyCautions.length > 0 && (
                                <Box sx={{ mt: 1.5 }}>
                                  <Typography variant="body2" fontWeight={700} sx={{ color: '#f57c00', mb: 0.5 }}>
                                    ⚠️ Key Cautions
                                  </Typography>
                                  {report.operatorBriefing.keyCautions.map((item, i) => (
                                    <Box key={i} sx={{ mb: 1.5, pl: 2, borderLeft: '3px solid #f57c00', bgcolor: alpha('#f57c00', 0.05), p: 1, borderRadius: 1 }}>
                                      <Typography variant="body2" fontWeight={600} sx={{ color: '#f57c00', mb: 0.5 }}>
                                        {item.title}
                                      </Typography>
                                      <Typography variant="caption" sx={{ display: 'block', mb: 0.5, color: '#f57c00' }}>
                                        {item.why}
                                      </Typography>
                                      {item.actionToResolve && (
                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                                          Action: {item.actionToResolve}
                                        </Typography>
                                      )}
                                    </Box>
                                  ))}
                                </Box>
                              )}

                              {/* Legal / Compliance Actions Required */}
                              {report.operatorBriefing.legalComplianceActions.length > 0 && (
                                <Box sx={{ mt: 1.5 }}>
                                  <Typography variant="body2" fontWeight={700} sx={{ color: '#1976d2', mb: 0.5 }}>
                                    📋 Legal / Compliance Actions Required
                                  </Typography>
                                  <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                                    {report.operatorBriefing.legalComplianceActions.map((item, i) => (
                                      <li key={i}>
                                        <Typography variant="body2" sx={{ lineHeight: 1.6, color: '#1976d2' }}>{item}</Typography>
                                      </li>
                                    ))}
                                  </ul>
                                </Box>
                              )}

                              {/* Priority Operational Constraints */}
                              {report.operatorBriefing.priorityConstraints.length > 0 && (
                                <Box sx={{ mt: 1.5 }}>
                                  <Typography variant="body2" fontWeight={700} sx={{ color: '#388e3c', mb: 0.5 }}>
                                    🎯 Priority Operational Constraints
                                  </Typography>
                                  <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                                    {report.operatorBriefing.priorityConstraints.map((item, i) => (
                                      <li key={i}>
                                        <Typography variant="body2" sx={{ lineHeight: 1.6, color: '#388e3c' }}>{item}</Typography>
                                      </li>
                                    ))}
                                  </ul>
                                </Box>
                              )}

                              {/* Product Clean Name (if available) */}
                              {report.operatorBriefing.cleanProductName && report.operatorBriefing.cleanProductName !== report.product && (
                                <Box sx={{ mt: 1.5 }}>
                                  <Typography variant="body2" fontWeight={600} sx={{ color: 'text.secondary', mb: 0.5 }}>
                                    📦 Clean Product Name
                                  </Typography>
                                  <Typography variant="body2" sx={{ lineHeight: 1.6, fontWeight: 600 }}>
                                    {report.operatorBriefing.cleanProductName}
                                  </Typography>
                                </Box>
                              )}

                              {/* Separator between operator briefing and legacy sections */}
                              <Divider sx={{ my: 2, opacity: 0.5 }} />
                            </Box>
                          )}

                          {/* Legacy Client Report Sections (secondary) */}
                          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Legacy Report Details
                          </Typography>

                          {report.clientReport.finalRecommendation.length > 0 && (
                            <Box sx={{ mt: 1.5 }}>
                              <Typography variant="body2" fontWeight={700} sx={{ color: '#1565c0', mb: 0.5, opacity: 0.8 }}>
                                Final Recommendation
                              </Typography>
                              <ul style={{ margin: '4px 0', paddingLeft: 20, opacity: 0.8 }}>
                                {report.clientReport.finalRecommendation.map((item, i) => (
                                  <li key={i}>
                                    <Typography variant="body2" sx={{ lineHeight: 1.6 }}>{item}</Typography>
                                  </li>
                                ))}
                              </ul>
                            </Box>
                          )}

                          {report.clientReport.complianceNotes.length > 0 && (
                            <Box sx={{ mt: 1.5 }}>
                              <Typography variant="body2" fontWeight={700} sx={{ color: '#e65100', mb: 0.5, opacity: 0.8 }}>
                                Compliance Notes
                              </Typography>
                              <ul style={{ margin: '4px 0', paddingLeft: 20, opacity: 0.8 }}>
                                {report.clientReport.complianceNotes.map((item, i) => (
                                  <li key={i}>
                                    <Typography variant="body2" sx={{ lineHeight: 1.6 }}>{item}</Typography>
                                  </li>
                                ))}
                              </ul>
                            </Box>
                          )}

                          {report.clientReport.applicationSettings.length > 0 && (
                            <Box sx={{ mt: 1.5 }}>
                              <Typography variant="body2" fontWeight={700} sx={{ color: '#2e7d32', mb: 0.5, opacity: 0.8 }}>
                                Application Settings
                              </Typography>
                              <ul style={{ margin: '4px 0', paddingLeft: 20, opacity: 0.8 }}>
                                {report.clientReport.applicationSettings.map((item, i) => (
                                  <li key={i}>
                                    <Typography variant="body2" sx={{ lineHeight: 1.6 }}>{item}</Typography>
                                  </li>
                                ))}
                              </ul>
                            </Box>
                          )}

                          {/* Show fallback message if no operator briefing available */}
                          {!report.operatorBriefing && (
                            <Box sx={{ mt: 1.5 }}>
                              <Alert severity="info" sx={{ fontSize: '0.75rem' }}>
                                This report was generated before Operator Briefing feature. Only legacy client report data is available.
                              </Alert>
                            </Box>
                          )}
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Compliance Records */}
        {complianceRecords.length > 0 && (
          <Card elevation={0} sx={{
            border: `1.5px solid ${alpha('#7b1fa2', 0.15)}`,
            borderRadius: '16px',
          }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <GavelIcon sx={{ color: '#7b1fa2', fontSize: 20 }} />
                <Typography variant="subtitle1" fontWeight={700} color="primary.dark">
                  Compliance Records ({complianceRecords.length})
                </Typography>
              </Box>

              <Stack spacing={1.5}>
                {complianceRecords.map((record: any) => (
                  <Box key={record.id} sx={{
                    borderRadius: '12px',
                    border: `1px solid ${alpha('#7b1fa2', 0.1)}`,
                    overflow: 'hidden',
                    bgcolor: record.isLocked ? alpha('#4caf50', 0.05) : 'transparent',
                  }}>
                    <Box sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2" fontWeight={700}>
                          {record.state} Chemical Compliance
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          {record.isLocked && (
                            <Chip
                              label="SIGNED OFF"
                              size="small"
                              sx={{
                                bgcolor: alpha('#4caf50', 0.15),
                                color: '#2e7d32',
                                fontWeight: 700,
                                fontSize: '0.65rem',
                              }}
                            />
                          )}
                          <Chip
                            label={record.isLocked ? "LOCKED" : "DRAFT"}
                            size="small"
                            sx={{
                              bgcolor: record.isLocked ? alpha('#ff9800', 0.15) : alpha('#2196f3', 0.15),
                              color: record.isLocked ? '#e65100' : '#1565c0',
                              fontWeight: 700,
                              fontSize: '0.65rem',
                            }}
                          />
                        </Box>
                      </Box>

                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        Created: {new Date(record.createdAt).toLocaleDateString('en-AU', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                        {record.signedOff && (
                          <span> • Signed by: {record.signedOff.signedBy} on {new Date(record.signedOff.signedAt).toLocaleDateString('en-AU')}</span>
                        )}
                      </Typography>

                      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        <Typography variant="caption">
                          Product: <strong>{record.apvmaCompliance.productName || 'Not specified'}</strong>
                        </Typography>
                        <Typography variant="caption">
                          APVMA: <strong>{record.apvmaCompliance.apvmaNumber || 'Not specified'}</strong>
                        </Typography>
                        <Typography variant="caption">
                          Area: <strong>{record.apvmaCompliance.areaHectares || 0} ha</strong>
                        </Typography>
                      </Box>

                      {!record.isLocked && (
                        <Box sx={{ mt: 1 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => window.open(`/compliance/chemical?record=${record.id}`, '_blank')}
                            sx={{ fontSize: '0.7rem' }}
                          >
                            Edit Record
                          </Button>
                        </Box>
                      )}
                    </Box>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Outcome */}
        <Card elevation={0} sx={{
          border: `1.5px solid ${outcome ? alpha('#4caf50', 0.2) : alpha(theme.palette.primary.main, 0.1)}`,
          borderRadius: '16px',
        }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ color: outcome ? '#4caf50' : 'text.disabled', fontSize: 20 }} />
                <Typography variant="subtitle1" fontWeight={700} color="primary.dark">Job Outcome</Typography>
              </Box>
              <Button
                size="small"
                startIcon={outcome ? <EditIcon /> : <AddIcon />}
                onClick={handleOpenOutcome}
                sx={{ borderRadius: '10px', fontWeight: 700 }}
              >
                {outcome ? 'Edit Outcome' : 'Record Outcome'}
              </Button>
            </Box>

            {outcome ? (
              <Box>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>Efficacy</Typography>
                    <Chip
                      icon={<StarIcon sx={{ fontSize: 14 }} />}
                      label={`${outcome.efficacyRating}/5 — ${efficacyLabels[outcome.efficacyRating]}`}
                      sx={{
                        fontWeight: 700,
                        bgcolor: getEfficacyColor(outcome.efficacyRating).bg,
                        color: getEfficacyColor(outcome.efficacyRating).color,
                      }}
                    />
                  </Box>
                  {outcome.regrowthObserved && (
                    <Chip label="Regrowth observed" size="small" color="warning" variant="outlined" />
                  )}
                  {outcome.followUpRequired && (
                    <Chip label="Follow-up required" size="small" color="error" variant="outlined" />
                  )}
                </Stack>
                <InfoRow label="Follow-up Date" value={outcome.followUpDate ? new Date(outcome.followUpDate).toLocaleDateString('en-AU') : null} />
                <InfoRow label="Notes" value={outcome.notes} />

                {outcome.photos && outcome.photos.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ mb: 1 }}>
                      Photos ({outcome.photos.length})
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                      {outcome.photos.map((photo, idx) => (
                        <Box key={idx} sx={{ position: 'relative' }}>
                          <Box
                            component="img"
                            src={photo.dataUrl}
                            alt={photo.caption || photo.fileName}
                            sx={{
                              width: 120, height: 120, borderRadius: '10px',
                              objectFit: 'cover', cursor: 'pointer',
                              border: `2px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                            }}
                            onClick={() => window.open(photo.dataUrl, '_blank')}
                          />
                          <Chip
                            label={photo.type}
                            size="small"
                            sx={{
                              position: 'absolute', top: 4, left: 4,
                              fontSize: '0.6rem', fontWeight: 700, height: 18,
                              bgcolor: photo.type === 'before' ? alpha('#ff9800', 0.9) : alpha('#4caf50', 0.9),
                              color: 'white',
                            }}
                          />
                          {photo.caption && (
                            <Typography variant="caption" color="text.secondary" sx={{
                              display: 'block', mt: 0.25, maxWidth: 120,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {photo.caption}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No outcome recorded yet. Record the result after the withholding period.
              </Typography>
            )}
          </CardContent>
        </Card>
      </Stack>

      {/* Outcome Dialog */}
      <Dialog open={outcomeDialogOpen} onClose={() => setOutcomeDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>{outcome ? 'Edit Outcome' : 'Record Outcome'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>Efficacy Rating</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Rating
                  value={outcomeForm.efficacyRating}
                  onChange={(_e, value) => {
                    if (value) setOutcomeForm({ ...outcomeForm, efficacyRating: value as EfficacyRating });
                  }}
                  max={5}
                  size="large"
                />
                <Typography variant="body2" color="text.secondary">
                  {efficacyLabels[outcomeForm.efficacyRating]}
                </Typography>
              </Box>
            </Box>

            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={outcomeForm.regrowthObserved}
                  onChange={(e) => setOutcomeForm({ ...outcomeForm, regrowthObserved: e.target.checked })}
                />
              }
              label="Regrowth observed"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={outcomeForm.followUpRequired}
                  onChange={(e) => setOutcomeForm({ ...outcomeForm, followUpRequired: e.target.checked })}
                />
              }
              label="Follow-up spray required"
            />

            <TextField
              label="Follow-up Date"
              type="date"
              value={outcomeForm.followUpDate}
              onChange={(e) => setOutcomeForm({ ...outcomeForm, followUpDate: e.target.value })}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />

            <TextField
              label="Notes"
              value={outcomeForm.notes}
              onChange={(e) => setOutcomeForm({ ...outcomeForm, notes: e.target.value })}
              multiline
              rows={3}
              fullWidth
              placeholder="How did the treatment perform? Any observations..."
            />

            <Divider />

            <PhotoUpload
              photos={outcomeForm.photos}
              onChange={(photos) => setOutcomeForm({ ...outcomeForm, photos })}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOutcomeDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveOutcome} sx={{ borderRadius: '10px', fontWeight: 700 }}>
            {outcome ? 'Update Outcome' : 'Save Outcome'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteConfirm} onClose={() => setDeleteConfirm(false)} PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Job?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will permanently delete this spray job record and any associated outcome data.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDeleteConfirm(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} sx={{ borderRadius: '10px', fontWeight: 700 }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
