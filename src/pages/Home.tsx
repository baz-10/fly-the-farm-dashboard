import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Drawer,
  Grid,
  IconButton,
  InputBase,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
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
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import GavelIcon from '@mui/icons-material/Gavel';
import GrassIcon from '@mui/icons-material/Grass';
import HomeIcon from '@mui/icons-material/Home';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ReportIcon from '@mui/icons-material/Assessment';
import SearchIcon from '@mui/icons-material/Search';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import { useAuth } from '../contexts/AuthContext';

interface PanelProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  sx?: SxProps<Theme>;
}

const dashboardNav = [
  { label: 'Operations', path: '/', icon: <HomeIcon /> },
  { label: 'Database', path: '/database', icon: <GrassIcon /> },
  { label: 'Jobs', path: '/jobs', icon: <AssignmentIcon /> },
  { label: 'Quotes', path: '/quotes', icon: <ReceiptLongIcon /> },
  { label: 'Financials', path: '/financials', icon: <AccountBalanceIcon /> },
  { label: 'Mission Planning', path: '/mission-planning', icon: <FlightTakeoffIcon /> },
  { label: 'JSA', path: '/jsa', icon: <SecurityIcon /> },
  { label: 'Aircraft', path: '/aircraft', icon: <AirplanemodeActiveIcon /> },
  { label: 'Compliance', path: '/compliance', icon: <GavelIcon /> },
  { label: 'Reports', path: '/financials', icon: <ReportIcon /> },
  { label: 'Settings', path: '/quotes/settings', icon: <SettingsIcon /> },
];

const spraySchedule = [
  {
    time: '07:30',
    client: 'Greencare Pty Ltd',
    job: 'Field 2 - Barnyard Grass Control',
    status: 'In Progress',
    statusTone: '#2e9e3c',
  },
  {
    time: '10:45',
    client: 'Hillside Farms',
    job: 'Paddock 3 - Broadleaf Weed Control',
    status: 'Scheduled',
    statusTone: '#5f765f',
  },
  {
    time: '13:10',
    client: 'Riverbend Pastoral',
    job: 'Block 7 - Lantana Control',
    status: 'Scheduled',
    statusTone: '#5f765f',
  },
  {
    time: '16:00',
    client: 'Sunset Ag',
    job: 'Field 5 - Fallow Knockdown',
    status: 'Planned',
    statusTone: '#d4860a',
  },
];

const actionItems = [
  {
    label: 'Authorize Mission',
    detail: 'Hillside Farms - Paddock 3 awaiting approval',
    action: 'Review',
    path: '/mission-planning',
    tone: '#d4860a',
    icon: <FlightTakeoffIcon />,
  },
  {
    label: 'JSA Approval',
    detail: 'Greencare - Field 2 pending endorsement',
    action: 'Approve',
    path: '/jsa',
    tone: '#1b8a5a',
    icon: <SecurityIcon />,
  },
  {
    label: 'Weather Window',
    detail: '2 missions in ideal conditions',
    action: 'View',
    path: '/jobs',
    tone: '#00897b',
    icon: <CloudQueueIcon />,
  },
  {
    label: 'Diary Incomplete',
    detail: 'Riverbend Pastoral spray diary not complete',
    action: 'Resolve',
    path: '/compliance',
    tone: '#c62828',
    icon: <WarningAmberIcon />,
  },
  {
    label: 'Quote Follow Up',
    detail: '3 quotes pending, sent more than 7 days ago',
    action: 'Follow Up',
    path: '/quotes',
    tone: '#d4860a',
    icon: <ReceiptLongIcon />,
  },
];

const fleetStatus = [
  { id: 'DJI T50-001', label: 'Ready', charge: 98 },
  { id: 'DJI T25-002', label: 'Ready', charge: 86 },
  { id: 'DJI T40-003', label: 'Maintenance', charge: 0 },
  { id: 'DJI T20-004', label: 'Ready', charge: 72 },
];

const openQuotes = [
  { quote: 'QT-2026-034', client: 'Hillside Farms', total: '$8,450', status: 'Sent', sent: '2 days ago' },
  { quote: 'QT-2026-033', client: 'Greencare Pty Ltd', total: '$6,420', status: 'Sent', sent: '5 days ago' },
  { quote: 'QT-2026-032', client: 'Sunset Agriculture', total: '$3,210', status: 'Draft', sent: '-' },
];

const recentActivity = [
  { label: 'Mission completed', detail: 'Greencare - Field 1', time: 'Today, 11:15 AM', icon: <CheckCircleIcon /> },
  { label: 'JSA approved', detail: 'Riverbend Pastoral', time: 'Today, 9:02 AM', icon: <SecurityIcon /> },
  { label: 'Spray diary submitted', detail: 'Sunset Ag - Field 4', time: 'Yesterday, 4:30 PM', icon: <AssignmentIcon /> },
  { label: 'Aircraft maintenance', detail: 'DJI T40-003', time: 'Yesterday, 2:10 PM', icon: <AirplanemodeActiveIcon /> },
];

function Panel({ title, children, action, sx }: PanelProps) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: '8px',
        border: '1px solid rgba(20, 58, 26, 0.1)',
        boxShadow: '0 12px 28px rgba(10, 31, 10, 0.05)',
        bgcolor: 'rgba(255, 255, 255, 0.94)',
        ...sx,
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 2.25 }, '&:last-child': { pb: { xs: 2, md: 2.25 } } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.75 }}>
          <Typography variant="subtitle2" sx={{ color: 'primary.dark', letterSpacing: '0.04em' }}>
            {title}
          </Typography>
          {action}
        </Stack>
        {children}
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

export default function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  const navigateAndClose = (path: string) => {
    setMobileNavOpen(false);
    navigate(path);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        bgcolor: '#f3f7f3',
        color: 'primary.dark',
        backgroundImage:
          'radial-gradient(circle at 82% 18%, rgba(46, 158, 60, 0.08), transparent 28%), radial-gradient(circle at 40% 0%, rgba(20, 58, 26, 0.06), transparent 34%)',
      }}
    >
      <Box
        component="aside"
        sx={{
          width: 92,
          display: { xs: 'none', lg: 'flex' },
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
          bgcolor: '#062407',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          px: 1.25,
          py: 2,
          zIndex: 2,
        }}
      >
        <Box component="img" src="/logo.png" alt="Fly the Farm" sx={{ width: 66, mx: 'auto', mb: 2.5 }} />
        <Stack spacing={0.5} sx={{ flex: 1 }}>
          {dashboardNav.map((item) => {
            const active = item.path === '/';
            return (
              <Tooltip key={item.label} title={item.label} placement="right">
                <Button
                  onClick={() => navigateAndClose(item.path)}
                  sx={{
                    minWidth: 0,
                    height: 52,
                    borderRadius: '8px',
                    flexDirection: 'column',
                    gap: 0.35,
                    color: active ? 'white' : alpha(theme.palette.common.white, 0.68),
                    bgcolor: active ? alpha(theme.palette.common.white, 0.11) : 'transparent',
                    '& .MuiSvgIcon-root': { fontSize: 18 },
                    '&:hover': {
                      bgcolor: alpha(theme.palette.common.white, 0.1),
                      color: 'white',
                    },
                  }}
                >
                  {item.icon}
                  <Typography sx={{ fontSize: '0.58rem', fontWeight: 700, lineHeight: 1.1, textTransform: 'none' }}>
                    {item.label.split(' ')[0]}
                  </Typography>
                </Button>
              </Tooltip>
            );
          })}
        </Stack>
        <Tooltip title="Sign out" placement="right">
          <IconButton
            onClick={() => {
              logout();
              navigate('/login');
            }}
            sx={{ color: alpha(theme.palette.common.white, 0.68), borderRadius: '8px' }}
          >
            <LogoutIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Drawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        PaperProps={{
          sx: {
            width: 280,
            bgcolor: '#062407',
            color: 'white',
          },
        }}
      >
        <Box sx={{ px: 2.5, py: 2 }}>
          <Box component="img" src="/logo.png" alt="Fly the Farm" sx={{ height: 44, width: 'auto' }} />
        </Box>
        <Divider sx={{ borderColor: alpha(theme.palette.common.white, 0.1) }} />
        <List sx={{ px: 1.25, py: 1.5 }}>
          {dashboardNav.map((item) => {
            const active = item.path === '/';
            return (
              <ListItemButton
                key={item.label}
                selected={active}
                onClick={() => navigateAndClose(item.path)}
                sx={{
                  borderRadius: '8px',
                  mb: 0.5,
                  color: active ? 'white' : alpha(theme.palette.common.white, 0.72),
                  '&.Mui-selected': {
                    bgcolor: alpha(theme.palette.common.white, 0.12),
                  },
                  '&:hover': {
                    bgcolor: alpha(theme.palette.common.white, 0.1),
                  },
                }}
              >
                <ListItemIcon sx={{ color: 'inherit', minWidth: 38 }}>{item.icon}</ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: active ? 800 : 650 }}
                />
              </ListItemButton>
            );
          })}
        </List>
        <Box sx={{ flex: 1 }} />
        <Button
          startIcon={<LogoutIcon />}
          onClick={() => {
            setMobileNavOpen(false);
            logout();
            navigate('/login');
          }}
          sx={{
            justifyContent: 'flex-start',
            m: 1.25,
            color: alpha(theme.palette.common.white, 0.72),
          }}
        >
          Sign out
        </Button>
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          component="header"
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{
            height: { xs: 'auto', md: 72 },
            px: { xs: 2, md: 3 },
            py: { xs: 1.5, md: 0 },
            bgcolor: '#062407',
            color: 'white',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            position: 'sticky',
            top: 0,
            zIndex: 3,
            flexWrap: { xs: 'wrap', md: 'nowrap' },
          }}
        >
          <IconButton onClick={() => setMobileNavOpen(true)} sx={{ color: 'white', display: { lg: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Box component="img" src="/logo.png" alt="Fly the Farm" sx={{ height: 42, display: { xs: 'block', lg: 'none' } }} />
          <Box
            sx={{
              minWidth: { xs: '100%', md: 320 },
              flex: { xs: '1 0 100%', md: '0 1 440px' },
              order: { xs: 3, md: 0 },
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              height: 38,
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.16)',
              bgcolor: 'rgba(0,0,0,0.14)',
            }}
          >
            <SearchIcon sx={{ fontSize: 18, color: alpha(theme.palette.common.white, 0.66) }} />
            <InputBase
              placeholder="Search chemicals, jobs, clients..."
              sx={{
                color: 'white',
                flex: 1,
                fontSize: '0.82rem',
                '& input::placeholder': { color: alpha(theme.palette.common.white, 0.7), opacity: 1 },
              }}
            />
          </Box>
          <Box sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ ml: 'auto' }}>
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ display: { xs: 'none', sm: 'flex' } }}>
              <WbSunnyIcon sx={{ color: '#f4c542', fontSize: 21 }} />
              <Box>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, lineHeight: 1 }}>22 C</Typography>
                <Typography sx={{ fontSize: '0.62rem', color: alpha(theme.palette.common.white, 0.68) }}>Brisbane</Typography>
              </Box>
            </Stack>
            <IconButton sx={{ color: 'white' }}>
              <NotificationsNoneIcon />
            </IconButton>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Avatar sx={{ width: 34, height: 34, bgcolor: '#e7f3e6', color: '#062407', fontWeight: 800 }}>
                {user?.name?.[0] || 'F'}
              </Avatar>
              <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, lineHeight: 1.1 }}>{user?.name || 'Fly the Farm'}</Typography>
                <Typography sx={{ fontSize: '0.62rem', color: alpha(theme.palette.common.white, 0.68) }}>RePL-12345</Typography>
              </Box>
            </Stack>
          </Stack>
        </Stack>

        <Box
          component="main"
          className="ftf-topo-bg"
          sx={{
            px: { xs: 2, md: 3 },
            py: { xs: 2.5, md: 3 },
            position: 'relative',
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'flex-end' }}
            spacing={2}
            sx={{ mb: 2.5, position: 'relative', zIndex: 1 }}
          >
            <Box>
              <Typography
                variant="h3"
                sx={{
                  fontSize: { xs: '2rem', md: '2.35rem' },
                  fontWeight: 800,
                  letterSpacing: 0,
                  mb: 0.5,
                }}
              >
                Operations Command
              </Typography>
              <Typography color="text.secondary" sx={{ fontSize: '0.96rem' }}>
                Your aerial spraying operations at a glance.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button variant="outlined" startIcon={<CalendarTodayIcon />} onClick={() => navigate('/jobs/history')}>
                View Schedule
              </Button>
              <Button variant="contained" startIcon={<FlightTakeoffIcon />} onClick={() => navigate('/mission-planning')}>
                Plan Mission
              </Button>
            </Stack>
          </Stack>

          <Grid container spacing={2} sx={{ position: 'relative', zIndex: 1 }}>
            <Grid size={{ xs: 12, lg: 5 }}>
              <Panel
                title="Today's Spray Schedule"
                action={
                  <Button size="small" onClick={() => navigate('/jobs')} sx={{ fontWeight: 800 }}>
                    View all
                  </Button>
                }
                sx={{ minHeight: 280 }}
              >
                <Stack spacing={1.45}>
                  {spraySchedule.map((item) => (
                    <Stack key={`${item.time}-${item.job}`} direction="row" spacing={1.5} alignItems="flex-start">
                      <Typography sx={{ width: 48, fontSize: '0.78rem', color: 'text.secondary', pt: 0.2 }}>
                        {item.time}
                      </Typography>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.statusTone, mt: 0.65, flexShrink: 0 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.86rem', fontWeight: 800 }}>{item.client}</Typography>
                        <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary' }}>{item.job}</Typography>
                      </Box>
                      <StatusChip label={item.status} color={item.statusTone} />
                    </Stack>
                  ))}
                </Stack>
              </Panel>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Panel title="Mission Readiness" sx={{ minHeight: 280 }}>
                <Stack direction="row" alignItems="center" spacing={2.5}>
                  <Box
                    sx={{
                      width: 112,
                      height: 112,
                      borderRadius: '50%',
                      background: 'conic-gradient(#2e9e3c 0 315deg, #f4c542 315deg 360deg)',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Box
                      sx={{
                        width: 76,
                        height: 76,
                        borderRadius: '50%',
                        bgcolor: 'white',
                        display: 'grid',
                        placeItems: 'center',
                        border: '1px solid rgba(20,58,26,0.08)',
                      }}
                    >
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: '1.25rem', fontWeight: 900, lineHeight: 1 }}>7 / 8</Typography>
                        <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>Ready</Typography>
                      </Box>
                    </Box>
                  </Box>
                  <Stack spacing={1}>
                    {[
                      ['7 Ready', '#2e9e3c'],
                      ['1 Attention', '#d4860a'],
                      ['0 Blocked', '#c62828'],
                    ].map(([label, color]) => (
                      <Stack key={label} direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color }} />
                        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{label}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Stack>
                <Button fullWidth variant="outlined" sx={{ mt: 2.5 }} onClick={() => navigate('/mission-planning')}>
                  View all missions
                </Button>
              </Panel>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
              <Panel title="Next Best Actions" sx={{ minHeight: 280 }}>
                <Stack spacing={1.25}>
                  {actionItems.slice(0, 4).map((item) => (
                    <Stack
                      key={item.label}
                      direction="row"
                      alignItems="center"
                      spacing={1.5}
                      sx={{
                        p: 1,
                        borderRadius: '8px',
                        border: '1px solid rgba(20, 58, 26, 0.08)',
                        bgcolor: alpha(item.tone, 0.035),
                      }}
                    >
                      <Box sx={{ color: item.tone, display: 'flex' }}>{item.icon}</Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 800 }}>{item.label}</Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{item.detail}</Typography>
                      </Box>
                      <Button size="small" variant="outlined" onClick={() => navigate(item.path)} sx={{ px: 1.2 }}>
                        {item.action}
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              </Panel>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Panel title="Weather Window" sx={{ minHeight: 236 }}>
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Box>
                    <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>Brisbane</Typography>
                    <Typography sx={{ fontSize: '2.1rem', fontWeight: 900, lineHeight: 1 }}>22 C</Typography>
                    <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary', mt: 0.35 }}>Mostly sunny</Typography>
                  </Box>
                  <Divider orientation="vertical" flexItem />
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>Wed 10h</Typography>
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 800 }}>ESE 12 km/h</Typography>
                    <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary' }}>Gusts 16 km/h</Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={0.8} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                  {['Now', '4pm', '5pm', '6pm', '7pm', '8pm'].map((slot) => (
                    <Chip
                      key={slot}
                      icon={<CheckCircleIcon />}
                      label={slot}
                      size="small"
                      sx={{
                        borderRadius: '6px',
                        bgcolor: alpha(theme.palette.success.main, 0.1),
                        color: theme.palette.success.dark,
                        fontWeight: 800,
                      }}
                    />
                  ))}
                </Stack>
                <Typography sx={{ mt: 1.75, fontSize: '0.78rem', color: 'success.dark', fontWeight: 800 }}>
                  Good window for spraying
                </Typography>
              </Panel>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Panel
                title="Fleet Status"
                action={
                  <Button size="small" onClick={() => navigate('/aircraft')} sx={{ fontWeight: 800 }}>
                    View aircraft
                  </Button>
                }
                sx={{ minHeight: 236 }}
              >
                <Stack spacing={1.2}>
                  {fleetStatus.map((aircraft) => (
                    <Stack key={aircraft.id} direction="row" alignItems="center" spacing={1.25}>
                      <AirplanemodeActiveIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 800 }}>{aircraft.id}</Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{aircraft.label}</Typography>
                      </Box>
                      {aircraft.charge > 0 ? (
                        <Box sx={{ minWidth: 70 }}>
                          <LinearProgress
                            variant="determinate"
                            value={aircraft.charge}
                            sx={{
                              height: 8,
                              borderRadius: 8,
                              bgcolor: alpha(theme.palette.primary.main, 0.08),
                              '& .MuiLinearProgress-bar': { bgcolor: theme.palette.success.main, borderRadius: 8 },
                            }}
                          />
                          <Typography sx={{ textAlign: 'right', mt: 0.35, fontSize: '0.66rem', color: 'text.secondary' }}>
                            {aircraft.charge}%
                          </Typography>
                        </Box>
                      ) : (
                        <StatusChip label="Service" color="#d4860a" />
                      )}
                    </Stack>
                  ))}
                </Stack>
              </Panel>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Panel title="Chemical Intelligence" sx={{ minHeight: 236 }}>
                <Stack spacing={1.2}>
                  {[
                    ['Glyphosate 540', '63.9 L allocated today', '#1b8a5a'],
                    ['Surfactant 1000', '4.3 L allocated today', '#00897b'],
                    ['AMS', '85.2 kg allocated today', '#5b7a3a'],
                  ].map(([name, detail, color]) => (
                    <Stack key={name} direction="row" alignItems="center" spacing={1.25}>
                      <Box sx={{ width: 34, height: 34, borderRadius: '8px', bgcolor: alpha(color, 0.1), display: 'grid', placeItems: 'center' }}>
                        <LocalFloristIcon sx={{ fontSize: 18, color }} />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 800 }}>{name}</Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{detail}</Typography>
                      </Box>
                      <CheckCircleIcon sx={{ fontSize: 18, color: theme.palette.success.main }} />
                    </Stack>
                  ))}
                </Stack>
                <Button variant="outlined" fullWidth sx={{ mt: 2 }} onClick={() => navigate('/database')}>
                  Search database
                </Button>
              </Panel>
            </Grid>

            <Grid size={{ xs: 12, lg: 6 }}>
              <Panel
                title="Open Quotes"
                action={
                  <Button size="small" variant="contained" onClick={() => navigate('/quotes/new')}>
                    New Quote
                  </Button>
                }
              >
                <Stack spacing={1}>
                  {openQuotes.map((quote) => (
                    <Grid
                      key={quote.quote}
                      container
                      spacing={1}
                      alignItems="center"
                      sx={{
                        px: 1,
                        py: 0.8,
                        borderRadius: '8px',
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04), cursor: 'pointer' },
                      }}
                      onClick={() => navigate('/quotes')}
                    >
                      <Grid size={{ xs: 6, md: 3 }}>
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 800 }}>{quote.quote}</Typography>
                      </Grid>
                      <Grid size={{ xs: 6, md: 3 }}>
                        <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{quote.client}</Typography>
                      </Grid>
                      <Grid size={{ xs: 4, md: 2 }}>
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 800 }}>{quote.total}</Typography>
                      </Grid>
                      <Grid size={{ xs: 4, md: 2 }}>
                        <StatusChip label={quote.status} color={quote.status === 'Draft' ? '#d4860a' : '#2e9e3c'} />
                      </Grid>
                      <Grid size={{ xs: 4, md: 2 }}>
                        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', textAlign: 'right' }}>{quote.sent}</Typography>
                      </Grid>
                    </Grid>
                  ))}
                </Stack>
              </Panel>
            </Grid>

            <Grid size={{ xs: 12, lg: 6 }}>
              <Panel
                title="Margin Snapshot"
                action={
                  <Button size="small" onClick={() => navigate('/financials')} sx={{ fontWeight: 800 }}>
                    View financials
                  </Button>
                }
              >
                <Grid container spacing={1.5}>
                  {[
                    ['Revenue', '$24,680.00', theme.palette.success.main],
                    ['Costs', '$15,420.00', '#5f765f'],
                    ['Profit', '$9,260.00', theme.palette.success.dark],
                  ].map(([label, value, color]) => (
                    <Grid key={label} size={{ xs: 4 }}>
                      <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{label}</Typography>
                      <Typography sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, fontWeight: 900, color }}>{value}</Typography>
                    </Grid>
                  ))}
                </Grid>
                <Box component="svg" viewBox="0 0 520 110" sx={{ width: '100%', height: 110, mt: 1.5 }}>
                  <path d="M0 95 C60 75 82 82 125 55 C166 28 210 65 250 48 C300 25 335 42 382 24 C430 4 470 18 520 8" fill="none" stroke="#2e9e3c" strokeWidth="5" strokeLinecap="round" />
                  <path d="M0 95 C60 75 82 82 125 55 C166 28 210 65 250 48 C300 25 335 42 382 24 C430 4 470 18 520 8 L520 110 L0 110 Z" fill="rgba(46, 158, 60, 0.09)" />
                </Box>
              </Panel>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Panel title="Recent Activity">
                <Grid container spacing={1.5}>
                  {recentActivity.map((item) => (
                    <Grid key={item.label} size={{ xs: 12, sm: 6, lg: 3 }}>
                      <Stack
                        direction="row"
                        spacing={1.25}
                        alignItems="center"
                        sx={{ p: 1, borderRadius: '8px', bgcolor: alpha(theme.palette.primary.main, 0.035) }}
                      >
                        <Box sx={{ width: 34, height: 34, borderRadius: '8px', bgcolor: alpha(theme.palette.success.main, 0.1), color: 'success.dark', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                          {item.icon}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.8rem', fontWeight: 800 }}>{item.label}</Typography>
                          <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>{item.detail}</Typography>
                          <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>{item.time}</Typography>
                        </Box>
                      </Stack>
                    </Grid>
                  ))}
                </Grid>
              </Panel>
            </Grid>
          </Grid>
        </Box>
      </Box>
    </Box>
  );
}
