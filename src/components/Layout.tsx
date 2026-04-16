import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Container,
  IconButton,
  Menu,
  MenuItem,
  useMediaQuery,
  useTheme,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  alpha,
  Divider,
  Stack,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import HomeIcon from '@mui/icons-material/Home';
import GrassIcon from '@mui/icons-material/Grass';
import CalculateIcon from '@mui/icons-material/Calculate';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import AirplanemodeActiveIcon from '@mui/icons-material/AirplanemodeActive';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import GavelIcon from '@mui/icons-material/Gavel';
import BadgeIcon from '@mui/icons-material/Badge';
import SecurityIcon from '@mui/icons-material/Security';
import { useAuth } from '../contexts/AuthContext';
import { Chip } from '@mui/material';

const ROLE_LABELS: Record<string, string> = {
  admin: 'FTF Admin',
  contractor: 'Contractor',
  client: 'Client',
};

const ROLE_COLORS: Record<string, string> = {
  admin: '#ff9800',
  contractor: '#4caf50',
  client: '#2196f3',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
    setAnchorEl(null);
  };

  const navItems = [
    { label: 'Home', path: '/', icon: <HomeIcon />, roles: ['admin', 'contractor', 'client'] },
    { label: 'Database', path: '/database', icon: <GrassIcon />, roles: ['admin', 'contractor', 'client'] },
    { label: 'Calculator', path: '/calculator', icon: <CalculateIcon />, roles: ['admin', 'contractor'] },
    { label: 'Jobs', path: '/jobs', icon: <AssignmentIcon />, roles: ['admin', 'contractor', 'client'] },
    { label: 'Aircraft', path: '/aircraft', icon: <AirplanemodeActiveIcon />, roles: ['admin', 'contractor'] },
    { label: 'JSA System', path: '/jsa', icon: <SecurityIcon />, roles: ['admin', 'contractor'] },
    { label: 'Quotes', path: '/quotes', icon: <ReceiptLongIcon />, roles: ['admin', 'contractor'] },
    { label: 'Financials', path: '/financials', icon: <AccountBalanceIcon />, roles: ['admin', 'contractor'] },
    { label: 'Ask FTF', path: '/ask-ftf', icon: <SmartToyIcon />, roles: ['admin', 'contractor'] },
    { label: 'Compliance', path: '/compliance', icon: <GavelIcon />, roles: ['admin', 'contractor'] },
    { label: 'Admin', path: '/admin', icon: <AdminPanelSettingsIcon />, roles: ['admin'] },
  ].filter((item) => !user?.role || item.roles.includes(user.role));

  return (
    <Box className="ftf-grain" sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'primary.dark',
          borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
          backdropFilter: 'blur(12px)',
        }}
      >
        <Toolbar sx={{ gap: 1, minHeight: { xs: 64, md: 72 } }}>
          {isMobile && (
            <IconButton color="inherit" edge="start" onClick={() => setDrawerOpen(true)} sx={{ mr: 0.5 }}>
              <MenuIcon />
            </IconButton>
          )}

          {/* Logo */}
          <Box
            onClick={() => navigate('/')}
            sx={{
              cursor: 'pointer',
              mr: 3,
              display: 'flex',
              alignItems: 'center',
              '&:hover': { opacity: 0.9 },
              transition: 'opacity 0.2s ease',
            }}
          >
            <Box
              component="img"
              src="/logo.png"
              alt="Fly the Farm"
              sx={{
                height: { xs: 44, md: 54 },
                width: 'auto',
              }}
            />
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {!isMobile && navItems.map((item) => {
            const isActive = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
            return (
              <Button
                key={item.path}
                color="inherit"
                startIcon={item.icon}
                onClick={() => navigate(item.path)}
                sx={{
                  mx: 0.25,
                  px: 2,
                  py: 1,
                  borderRadius: '10px',
                  fontSize: '0.875rem',
                  bgcolor: isActive ? alpha(theme.palette.common.white, 0.1) : 'transparent',
                  color: isActive ? 'white' : alpha(theme.palette.common.white, 0.7),
                  '&:hover': {
                    bgcolor: alpha(theme.palette.common.white, 0.08),
                    color: 'white',
                  },
                }}
              >
                {item.label}
              </Button>
            );
          })}

          {user && (
            <>
              <Divider orientation="vertical" flexItem sx={{ mx: 1, borderColor: alpha(theme.palette.common.white, 0.1) }} />
              <Button
                color="inherit"
                onClick={(e) => setAnchorEl(e.currentTarget)}
                startIcon={<AccountCircleIcon />}
                sx={{
                  color: alpha(theme.palette.common.white, 0.7),
                  textTransform: 'none',
                  '&:hover': { color: 'white' },
                }}
              >
                {!isMobile && user.name}
              </Button>
              <Menu
                anchorEl={anchorEl}
                open={!!anchorEl}
                onClose={() => setAnchorEl(null)}
                slotProps={{
                  paper: {
                    sx: {
                      mt: 1,
                      borderRadius: '12px',
                      minWidth: 200,
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
                      boxShadow: '0 8px 32px rgba(10,31,10,0.12)',
                    },
                  },
                }}
              >
                <Box sx={{ px: 2, py: 1.5 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                    Account
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>{user.name}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{user.email}</Typography>
                  <Chip
                    label={ROLE_LABELS[user.role] || user.role}
                    size="small"
                    sx={{
                      mt: 0.75, fontWeight: 700, fontSize: '0.65rem', height: 20,
                      bgcolor: alpha(ROLE_COLORS[user.role] || '#999', 0.1),
                      color: ROLE_COLORS[user.role] || '#999',
                    }}
                  />
                </Box>
                <Divider />
                <MenuItem
                  onClick={() => {
                    navigate('/license-settings');
                    setAnchorEl(null);
                  }}
                  sx={{ gap: 1.5, py: 1.5 }}
                >
                  <BadgeIcon sx={{ fontSize: 18 }} /> License Settings
                </MenuItem>
                <Divider />
                <MenuItem
                  onClick={handleLogout}
                  sx={{ gap: 1.5, py: 1.5, color: 'error.main' }}
                >
                  <LogoutIcon sx={{ fontSize: 18 }} /> Sign out
                </MenuItem>
              </Menu>
            </>
          )}
        </Toolbar>
      </AppBar>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            width: 280,
            bgcolor: 'primary.dark',
            color: 'white',
          },
        }}
      >
        <Box sx={{ p: 3 }}>
          <Box
            component="img"
            src="/logo.png"
            alt="Fly the Farm"
            sx={{ height: 44, width: 'auto' }}
          />
        </Box>
        <Divider sx={{ borderColor: alpha(theme.palette.common.white, 0.08) }} />
        <List sx={{ px: 1.5, pt: 2 }}>
          {navItems.map((item) => {
            const isActive = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
            return (
              <ListItemButton
                key={item.path}
                selected={isActive}
                onClick={() => { navigate(item.path); setDrawerOpen(false); }}
                sx={{
                  borderRadius: '10px',
                  mb: 0.5,
                  '&.Mui-selected': {
                    bgcolor: alpha(theme.palette.common.white, 0.1),
                    '&:hover': { bgcolor: alpha(theme.palette.common.white, 0.12) },
                  },
                  '&:hover': { bgcolor: alpha(theme.palette.common.white, 0.06) },
                }}
              >
                <ListItemIcon sx={{ color: isActive ? 'white' : alpha(theme.palette.common.white, 0.5), minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'white' : alpha(theme.palette.common.white, 0.7),
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, bgcolor: 'background.default', position: 'relative' }} className="ftf-topo-bg">
        <Container maxWidth="lg" sx={{ py: { xs: 2.5, md: 4 }, position: 'relative', zIndex: 1 }}>
          <Outlet />
        </Container>
      </Box>

      <Box
        component="footer"
        sx={{
          py: 4,
          px: 3,
          bgcolor: 'primary.dark',
          borderTop: `1px solid ${alpha(theme.palette.common.white, 0.06)}`,
        }}
      >
        <Container maxWidth="lg">
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2}>
            <Box sx={{ textAlign: { xs: 'center', md: 'left' } }}>
              <Box
                component="img"
                src="/logo.png"
                alt="Fly the Farm"
                sx={{ height: 36, width: 'auto', mb: 1, opacity: 0.7 }}
              />
              <Typography variant="caption" sx={{ color: alpha(theme.palette.common.white, 0.3), display: 'block' }}>
                &copy; {new Date().getFullYear()} &mdash; Chemical data for reference only. Always read the product label.
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography
                variant="overline"
                sx={{
                  color: alpha(theme.palette.common.white, 0.35),
                  fontSize: '0.6rem',
                  display: 'block',
                  mb: 0.25,
                }}
              >
                Proud Partner
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: alpha(theme.palette.common.white, 0.5),
                  fontWeight: 800,
                  fontFamily: '"Outfit", system-ui, sans-serif',
                  letterSpacing: '0.05em',
                }}
              >
                DJI Agriculture
              </Typography>
            </Box>
            <Box sx={{ textAlign: { xs: 'center', md: 'right' } }}>
              <Typography
                variant="caption"
                sx={{
                  color: alpha(theme.palette.common.white, 0.25),
                  fontFamily: '"Outfit", system-ui, sans-serif',
                  letterSpacing: '0.04em',
                }}
              >
                flythefarm.com.au
              </Typography>
            </Box>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
