import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AirplanemodeActiveIcon from '@mui/icons-material/AirplanemodeActive';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SecurityIcon from '@mui/icons-material/Security';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useAircraft } from '../contexts/AircraftContext';
import { useAuth } from '../contexts/AuthContext';
import { useMission } from '../contexts/MissionContext';
import { getClients } from '../services/fieldManagementStore';
import { getFinancialsSummary } from '../services/financialsStore';
import { getQuotes } from '../services/quoteStore';
import type { AircraftStatus } from '../types/aircraft';
import type { MissionRecord, MissionStatus } from '../types/mission';
import type { QuoteStatus } from '../types/quote';
import {
  getMissionActivity,
  getMissionNextAction,
  getMissionReadiness,
  getTodaysChemicalAllocations,
} from '../utils/operationsDashboard';
import { formatCurrency } from '../utils/quoteCalculator';
import { getOperationalWeek, groupMissionsByLocalDate } from '../utils/missionSchedule';
import OperationalWeatherCard from '../components/weather/OperationalWeatherCard';

interface PanelProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  sx?: SxProps<Theme>;
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}

const MISSION_STATUS_TONES: Record<MissionStatus, string> = {
  Planning: '#d4860a',
  Approved: '#2e9e3c',
  Flying: '#00897b',
  Completed: '#2e9e3c',
  Locked: '#5f765f',
};

const AIRCRAFT_STATUS_LABELS: Record<AircraftStatus, string> = {
  operational: 'Operational',
  maintenance: 'Maintenance',
  retired: 'Retired',
  inspection: 'Inspection due',
};

const AIRCRAFT_STATUS_TONES: Record<AircraftStatus, string> = {
  operational: '#2e9e3c',
  maintenance: '#d4860a',
  retired: '#5f765f',
  inspection: '#c62828',
};

const QUOTE_STATUS_TONES: Record<QuoteStatus, string> = {
  draft: '#5f765f',
  sent: '#00897b',
  accepted: '#2e9e3c',
  declined: '#c62828',
  expired: '#d4860a',
  invoiced: '#2e9e3c',
};

const MISSION_ACTION_META = {
  'complete-jsa': { tone: '#c62828', icon: <SecurityIcon /> },
  'authorize-mission': { tone: '#d4860a', icon: <FlightTakeoffIcon /> },
  'generate-flight-plan': { tone: '#00897b', icon: <AssignmentIcon /> },
  'authorize-flight': { tone: '#d4860a', icon: <SecurityIcon /> },
  'start-flight': { tone: '#1b8a5a', icon: <FlightTakeoffIcon /> },
  'record-completion': { tone: '#1b8a5a', icon: <FlightTakeoffIcon /> },
  'complete-mission': { tone: '#1b8a5a', icon: <CheckCircleIcon /> },
};

function Panel({ title, children, action, sx }: PanelProps) {
  return (
    <Card
      data-testid="operations-panel"
      data-desktop-height="300"
      elevation={0}
      sx={{
        borderRadius: '8px',
        border: '1px solid rgba(20, 58, 26, 0.1)',
        boxShadow: '0 12px 28px rgba(10, 31, 10, 0.05)',
        bgcolor: 'rgba(255, 255, 255, 0.95)',
        height: { xs: 'auto', lg: 300 },
        minHeight: { xs: 236, lg: 300 },
        ...sx,
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 2.25 }, height: '100%', display: 'flex', flexDirection: 'column', '&:last-child': { pb: { xs: 2, md: 2.25 } } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.75 }}>
          <Typography variant="subtitle2" sx={{ color: 'primary.dark', letterSpacing: '0.04em' }}>
            {title}
          </Typography>
          {action}
        </Stack>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</Box>
      </CardContent>
    </Card>
  );
}

function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <Chip
      label={label}
      size="small"
      sx={{
        height: 22,
        borderRadius: '6px',
        bgcolor: alpha(color, 0.1),
        color,
        fontSize: '0.68rem',
        fontWeight: 800,
      }}
    />
  );
}

function EmptyState({ icon, title, body, action, onAction }: EmptyStateProps) {
  return (
    <Stack alignItems="center" justifyContent="center" textAlign="center" sx={{ minHeight: 150, px: 2 }}>
      <Box sx={{ color: 'text.disabled', display: 'flex', mb: 1 }}>{icon}</Box>
      <Typography sx={{ fontSize: '0.88rem', fontWeight: 850, color: 'primary.dark' }}>{title}</Typography>
      <Typography sx={{ mt: 0.4, maxWidth: 330, fontSize: '0.74rem', color: 'text.secondary' }}>{body}</Typography>
      {action && onAction && (
        <Button size="small" variant="outlined" onClick={onAction} sx={{ mt: 1.5 }}>
          {action}
        </Button>
      )}
    </Stack>
  );
}

function getMissionClient(mission: MissionRecord) {
  return mission.planningState?.clientName || mission.clientId || 'Client not set';
}

function getMissionLocation(mission: MissionRecord) {
  const parts = [mission.planningState?.propertyName, mission.planningState?.fieldName].filter(Boolean);
  return parts.join(' / ') || mission.location.name || 'Location not set';
}

function formatScheduledTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time TBC';
  return date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatRelativeTime(value: string | null) {
  if (!value) return 'Not sent';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'Date unavailable';
  const elapsed = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(elapsed / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function formatAuditAction(action: string) {
  const labels: Record<string, string> = {
    created: 'Mission created',
    updated: 'Mission updated',
    'status-changed': 'Mission status changed',
    approved: 'Mission approved',
    rejected: 'Mission rejected',
    deleted: 'Mission deleted',
    archived: 'Mission archived',
  };
  return labels[action] || 'Mission activity';
}

export default function Home() {
  const { user } = useAuth();
  const {
    missions,
    isLoading: missionsLoading,
    error: missionsError,
    loadData: reloadMissions,
  } = useMission();
  const {
    aircraft,
    isLoading: aircraftLoading,
    error: aircraftError,
    loadData: reloadAircraft,
  } = useAircraft();
  const navigate = useNavigate();
  const theme = useTheme();

  const upcomingSchedule = React.useMemo(() => groupMissionsByLocalDate(missions.filter((mission) => mission.missionType === 'spray'), getOperationalWeek(new Date())), [missions]);
  const readiness = React.useMemo(() => getMissionReadiness(missions), [missions]);
  const chemicalAllocations = React.useMemo(() => getTodaysChemicalAllocations(missions), [missions]);
  const activity = React.useMemo(() => getMissionActivity(missions, 4), [missions]);
  const clients = getClients();
  const quotes = React.useMemo(
    () => getQuotes(user?.id || '')
      .filter((quote) => ['draft', 'sent', 'accepted'].includes(quote.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 3),
    [user?.id],
  );
  const financials = React.useMemo(() => getFinancialsSummary(user?.id || ''), [user?.id]);

  const activeMissions = React.useMemo(
    () => missions
      .filter((mission) => !['Completed', 'Locked'].includes(mission.status))
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
    [missions],
  );

  const actions = React.useMemo(() => activeMissions.slice(0, 4).map((mission) => {
    const nextAction = getMissionNextAction(mission);
    return {
      ...nextAction,
      ...MISSION_ACTION_META[nextAction.kind],
      path: `/missions/${encodeURIComponent(mission.id)}`,
    };
  }), [activeMissions]);

  const totalReadiness = readiness.total || 1;
  const readyDegrees = (readiness.ready / totalReadiness) * 360;
  const attentionDegrees = readyDegrees + (readiness.attention / totalReadiness) * 360;
  const readinessGradient = readiness.total === 0
    ? '#e5ece5'
    : `conic-gradient(#2e9e3c 0 ${readyDegrees}deg, #d4860a ${readyDegrees}deg ${attentionDegrees}deg, #c62828 ${attentionDegrees}deg 360deg)`;

  return (
    <Box sx={{ pb: 2 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'flex-end' }}
        spacing={2}
        sx={{ mb: 2.5 }}
      >
        <Box>
          <Typography variant="h3" sx={{ fontSize: { xs: '2rem', md: '2.35rem' }, fontWeight: 800, letterSpacing: 0, mb: 0.5 }}>
            Operations Command
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: '0.96rem' }}>
            Live mission, fleet and commercial readiness for your account.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="outlined" startIcon={<CalendarTodayIcon />} onClick={() => navigate('/schedule')}>
            View Schedule
          </Button>
          <Button variant="contained" startIcon={<FlightTakeoffIcon />} onClick={() => navigate('/missions/new')}>
            Plan Mission
          </Button>
        </Stack>
      </Stack>

      {(missionsError || aircraftError) && (
        <Alert
          severity="error"
          action={(
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                void Promise.all([reloadMissions(), reloadAircraft()]);
              }}
            >
              Retry
            </Button>
          )}
          sx={{ mb: 2 }}
        >
          Mission or fleet data could not be loaded. Dashboard figures may be incomplete; retry before relying on this view.
        </Alert>
      )}

      {(missionsLoading || aircraftLoading) && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, color: 'text.secondary' }}>
          <CircularProgress size={16} />
          <Typography variant="caption">Loading current operations...</Typography>
        </Stack>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Panel
            title="Today and upcoming"
            action={<Button size="small" onClick={() => navigate('/schedule')} sx={{ fontWeight: 800 }}>View all</Button>}
          >
            {upcomingSchedule.length > 0 ? (
              <Stack spacing={1.45}>
                {upcomingSchedule.map((group) => <Box key={group.dateKey}><Typography sx={{ fontSize: '0.68rem', fontWeight: 900, color: 'text.secondary', mb: 0.75 }}>{group.date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</Typography><Stack spacing={1}>{group.missions.map((mission) => (
                  <Stack key={mission.id} direction="row" spacing={1.5} alignItems="flex-start">
                    <Typography sx={{ width: 52, fontSize: '0.78rem', color: 'text.secondary', pt: 0.2 }}>
                      {formatScheduledTime(mission.scheduledDate)}
                    </Typography>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: MISSION_STATUS_TONES[mission.status], mt: 0.65, flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.86rem', fontWeight: 800 }}>{getMissionClient(mission)}</Typography>
                      <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary' }}>{getMissionLocation(mission)}</Typography>
                    </Box>
                    <StatusChip label={mission.status} color={MISSION_STATUS_TONES[mission.status]} />
                  </Stack>
                ))}</Stack></Box>)}
              </Stack>
            ) : (
              <EmptyState
                icon={<CalendarTodayIcon sx={{ fontSize: 34 }} />}
                title="No missions in the next seven days"
                body="Today and upcoming spray missions will appear here once they are saved."
                action="Plan mission"
                onAction={() => navigate('/missions/new')}
              />
            )}
          </Panel>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Panel title="Mission Readiness">
            {readiness.total > 0 ? (
              <>
                <Stack direction="row" alignItems="center" spacing={2.5}>
                  <Box sx={{ width: 112, height: 112, borderRadius: '50%', background: readinessGradient, display: 'grid', placeItems: 'center' }}>
                    <Box sx={{ width: 76, height: 76, borderRadius: '50%', bgcolor: 'white', display: 'grid', placeItems: 'center', border: '1px solid rgba(20,58,26,0.08)' }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: '1.25rem', fontWeight: 900, lineHeight: 1 }}>{readiness.ready} / {readiness.total}</Typography>
                        <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>Ready</Typography>
                      </Box>
                    </Box>
                  </Box>
                  <Stack spacing={1}>
                    {[
                      [`${readiness.ready} Ready`, '#2e9e3c'],
                      [`${readiness.attention} Attention`, '#d4860a'],
                      [`${readiness.blocked} Blocked`, '#c62828'],
                    ].map(([label, color]) => (
                      <Stack key={label} direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color }} />
                        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{label}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Stack>
                <Button fullWidth variant="outlined" sx={{ mt: 2.5 }} onClick={() => navigate('/missions')}>
                  View all missions
                </Button>
              </>
            ) : (
              <EmptyState
                icon={<FlightTakeoffIcon sx={{ fontSize: 34 }} />}
                title="No active missions"
                body="Readiness starts calculating when the first mission draft is saved."
                action="Create mission"
                onAction={() => navigate('/missions/new')}
              />
            )}
          </Panel>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <Panel title="Next Best Actions">
            {actions.length > 0 ? (
              <Stack spacing={1.25}>
                {actions.map((item) => (
                  <Stack key={`${item.label}-${item.detail}`} direction="row" alignItems="center" spacing={1.5} sx={{ p: 1, borderRadius: '8px', border: '1px solid rgba(20, 58, 26, 0.08)', bgcolor: alpha(item.tone, 0.035) }}>
                    <Box sx={{ color: item.tone, display: 'flex' }}>{item.icon}</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 800 }}>{item.label}</Typography>
                      <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{item.detail}</Typography>
                    </Box>
                    <Button size="small" variant="outlined" onClick={() => navigate(item.path)} sx={{ px: 1.2 }}>{item.action}</Button>
                  </Stack>
                ))}
              </Stack>
            ) : (
              <EmptyState
                icon={<CheckCircleIcon sx={{ fontSize: 34 }} />}
                title="No mission actions due"
                body="Approval, safety and flight-plan tasks will be raised here from saved missions."
              />
            )}
          </Panel>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Panel title="Weather">
            <OperationalWeatherCard userId={user?.id || 'anonymous'} onOpenWeather={() => navigate('/weather')} />
          </Panel>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Panel
            title="Fleet Status"
            action={<Button size="small" onClick={() => navigate('/aircraft')} sx={{ fontWeight: 800 }}>View aircraft</Button>}
          >
            {aircraft.length > 0 ? (
              <Stack spacing={1.2}>
                {aircraft.slice(0, 4).map((item) => (
                  <Stack key={item.id} direction="row" alignItems="center" spacing={1.25}>
                    <AirplanemodeActiveIcon sx={{ color: AIRCRAFT_STATUS_TONES[item.status], fontSize: 20 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 800 }}>{item.registration}</Typography>
                      <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{item.manufacturer} {item.model}</Typography>
                    </Box>
                    <StatusChip label={AIRCRAFT_STATUS_LABELS[item.status]} color={AIRCRAFT_STATUS_TONES[item.status]} />
                  </Stack>
                ))}
                {aircraft.length > 4 && <Typography variant="caption" color="text.secondary">+{aircraft.length - 4} more aircraft</Typography>}
              </Stack>
            ) : (
              <EmptyState
                icon={<AirplanemodeActiveIcon sx={{ fontSize: 34 }} />}
                title="No aircraft in this fleet"
                body="Aircraft created in Fleet Management will appear here automatically."
                action="Add aircraft"
                onAction={() => navigate('/aircraft')}
              />
            )}
          </Panel>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Panel title="Chemical Intelligence" sx={{ minHeight: 236 }}>
            {chemicalAllocations.length > 0 ? (
              <Stack spacing={1.2}>
                {chemicalAllocations.slice(0, 4).map((chemical) => (
                  <Stack key={`${chemical.product}-${chemical.unit}`} direction="row" alignItems="center" spacing={1.25}>
                    <Box sx={{ width: 34, height: 34, borderRadius: '8px', bgcolor: alpha(theme.palette.success.main, 0.1), display: 'grid', placeItems: 'center' }}>
                      <LocalFloristIcon sx={{ fontSize: 18, color: 'success.dark' }} />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 800 }}>{chemical.product}</Typography>
                      <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{chemical.totalRequired.toFixed(1)} {chemical.unit} planned today</Typography>
                    </Box>
                  </Stack>
                ))}
                <Button variant="outlined" fullWidth sx={{ mt: 1 }} onClick={() => navigate('/database')}>Search database</Button>
              </Stack>
            ) : (
              <EmptyState
                icon={<LocalFloristIcon sx={{ fontSize: 34 }} />}
                title="No chemicals allocated today"
                body="Products and quantities come directly from today's saved spray missions."
                action="Search database"
                onAction={() => navigate('/database')}
              />
            )}
          </Panel>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Panel title="Open Quotes" action={<Button size="small" variant="contained" onClick={() => navigate('/quotes/new')}>New Quote</Button>}>
            {quotes.length > 0 ? (
              <Stack spacing={1}>
                {quotes.map((quote) => {
                  const clientName = clients.find((client) => client.id === quote.clientId)?.name || 'Client not found';
                  return (
                    <Grid key={quote.id} container spacing={1} alignItems="center" sx={{ px: 1, py: 0.8, borderRadius: '8px', '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04), cursor: 'pointer' } }} onClick={() => navigate(`/quotes/${quote.id}`)}>
                      <Grid size={{ xs: 6, md: 3 }}><Typography sx={{ fontSize: '0.78rem', fontWeight: 800 }}>{quote.quoteNumber}</Typography></Grid>
                      <Grid size={{ xs: 6, md: 3 }}><Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{clientName}</Typography></Grid>
                      <Grid size={{ xs: 4, md: 2 }}><Typography sx={{ fontSize: '0.78rem', fontWeight: 800 }}>{formatCurrency(quote.total)}</Typography></Grid>
                      <Grid size={{ xs: 4, md: 2 }}><StatusChip label={quote.status} color={QUOTE_STATUS_TONES[quote.status]} /></Grid>
                      <Grid size={{ xs: 4, md: 2 }}><Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', textAlign: 'right' }}>{formatRelativeTime(quote.sentAt || quote.updatedAt)}</Typography></Grid>
                    </Grid>
                  );
                })}
              </Stack>
            ) : (
              <EmptyState
                icon={<ReceiptLongIcon sx={{ fontSize: 34 }} />}
                title="No open quotes"
                body="Draft, sent and accepted quotes will appear here."
                action="Create quote"
                onAction={() => navigate('/quotes/new')}
              />
            )}
          </Panel>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Panel title="Margin Snapshot" action={<Button size="small" onClick={() => navigate('/financials')} sx={{ fontWeight: 800 }}>View financials</Button>}>
            {financials.count > 0 ? (
              <>
                <Grid container spacing={1.5}>
                  {[
                    ['Revenue', formatCurrency(financials.totalRevenue), theme.palette.success.main],
                    ['Costs', formatCurrency(financials.totalCosts), '#5f765f'],
                    ['Profit', formatCurrency(financials.totalProfit), financials.totalProfit >= 0 ? theme.palette.success.dark : theme.palette.error.main],
                  ].map(([label, value, color]) => (
                    <Grid key={label} size={{ xs: 4 }}>
                      <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{label}</Typography>
                      <Typography sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, fontWeight: 900, color }}>{value}</Typography>
                    </Grid>
                  ))}
                </Grid>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 2, p: 1.2, borderRadius: '8px', bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                  <AccountBalanceIcon sx={{ color: 'primary.main' }} />
                  <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                    {financials.count} finalised job actual{financials.count === 1 ? '' : 's'} at {financials.avgMargin.toFixed(1)}% average gross margin.
                  </Typography>
                </Stack>
              </>
            ) : (
              <EmptyState
                icon={<AccountBalanceIcon sx={{ fontSize: 34 }} />}
                title="No finalised job actuals"
                body="Revenue, cost and profit stay at zero until a real job actual is finalised."
                action="Add actual"
                onAction={() => navigate('/financials/new')}
              />
            )}
          </Panel>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Panel title="Recent Mission Activity">
            {activity.length > 0 ? (
              <Grid container spacing={1.5}>
                {activity.map(({ mission, entry }) => (
                  <Grid key={entry.id} size={{ xs: 12, sm: 6, lg: 3 }}>
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ p: 1, borderRadius: '8px', bgcolor: alpha(theme.palette.primary.main, 0.035) }}>
                      <Box sx={{ width: 34, height: 34, borderRadius: '8px', bgcolor: alpha(theme.palette.success.main, 0.1), color: 'success.dark', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        {entry.action === 'approved' ? <CheckCircleIcon fontSize="small" /> : entry.action === 'rejected' ? <WarningAmberIcon fontSize="small" /> : <FlightTakeoffIcon fontSize="small" />}
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 800 }}>{formatAuditAction(entry.action)}</Typography>
                        <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>{mission.missionName}</Typography>
                        <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>{formatRelativeTime(entry.timestamp)}</Typography>
                      </Box>
                    </Stack>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <EmptyState
                icon={<AssignmentIcon sx={{ fontSize: 34 }} />}
                title="No mission activity yet"
                body="Mission creation, approvals and status changes are recorded here from the audit trail."
              />
            )}
          </Panel>
        </Grid>
      </Grid>
    </Box>
  );
}
