import React from 'react';
import PlatformBrand from '../brand/PlatformBrand';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  InputBase,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import AirplanemodeActiveIcon from '@mui/icons-material/AirplanemodeActive';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CalculateIcon from '@mui/icons-material/Calculate';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import GavelIcon from '@mui/icons-material/Gavel';
import GrassIcon from '@mui/icons-material/Grass';
import HomeIcon from '@mui/icons-material/Home';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SearchIcon from '@mui/icons-material/Search';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { useAuth } from '../contexts/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  admin: 'FTF Admin',
  contractor: 'Contractor',
  client: 'Client',
};

const NAV_ITEMS: Array<{ label: string; shortLabel: string; path: string; icon: React.ReactNode; roles: string[]; entitlement?: string }> = [
  { label: 'Operations', shortLabel: 'Operations', path: '/', icon: <HomeIcon />, roles: ['admin', 'contractor'] },
  { label: 'Database', shortLabel: 'Database', path: '/database', icon: <GrassIcon />, roles: ['admin', 'contractor', 'client'] },
  { label: 'Calculator', shortLabel: 'Calculator', path: '/calculator', icon: <CalculateIcon />, roles: ['admin', 'contractor'] },
  { label: 'Jobs', shortLabel: 'Jobs', path: '/jobs', icon: <AssignmentIcon />, roles: ['admin', 'contractor', 'client'] },
  { label: 'Aircraft', shortLabel: 'Aircraft', path: '/aircraft', icon: <AirplanemodeActiveIcon />, roles: ['admin', 'contractor'] },
  { label: 'Personnel', shortLabel: 'Personnel', path: '/personnel', icon: <PeopleIcon />, roles: ['admin', 'contractor'] },
  { label: 'Fleet & Packs', shortLabel: 'Fleet', path: '/fleet-work-packs', icon: <LocalShippingIcon />, roles: ['admin', 'contractor'] },
  { label: 'Missions', shortLabel: 'Missions', path: '/missions', icon: <FlightTakeoffIcon />, roles: ['admin', 'contractor'] },
  { label: 'JSA System', shortLabel: 'JSA', path: '/jsa', icon: <SecurityIcon />, roles: ['admin', 'contractor'] },
  { label: 'Quotes', shortLabel: 'Quotes', path: '/quotes', icon: <ReceiptLongIcon />, roles: ['admin', 'contractor'] },
  { label: 'Financials', shortLabel: 'Financials', path: '/financials', icon: <AccountBalanceIcon />, roles: ['admin', 'contractor'] },
  { label: 'Legacy Ask FTF', shortLabel: 'Legacy Ask FTF', path: '/ask-ftf', icon: <SmartToyIcon />, roles: ['admin', 'contractor'], entitlement: 'legacyAskFtf' },
  { label: 'Compliance', shortLabel: 'Compliance', path: '/compliance', icon: <GavelIcon />, roles: ['admin', 'contractor'] },
  { label: 'Settings', shortLabel: 'Settings', path: '/license-settings', icon: <SettingsIcon />, roles: ['admin', 'contractor'] },
  { label: 'Admin', shortLabel: 'Admin', path: '/admin', icon: <AdminPanelSettingsIcon />, roles: ['admin'] },
];

function isRouteActive(pathname: string, path: string) {
  return path === '/' ? pathname === '/' : pathname.startsWith(path);
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [accountAnchor, setAccountAnchor] = React.useState<null | HTMLElement>(null);
  const [search, setSearch] = React.useState('');

  const navItems = NAV_ITEMS.filter((item) =>
    (!user?.role || item.roles.includes(user.role))
    && (!item.entitlement || Boolean(user?.entitlements?.includes(item.entitlement)))
  );

  const navigateAndClose = (path: string) => {
    setDrawerOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    setAccountAnchor(null);
    logout();
    navigate('/login');
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    if (!query) {
      navigate('/database');
      return;
    }
    navigate(`/search?q=${encodeURIComponent(query)}&mode=chemical`);
    setSearch('');
  };

  const navList = (expanded: boolean) => (
    <List sx={{ px: expanded ? 1.25 : 0.75, py: 1, flex: 1 }}>
      {navItems.map((item) => {
        const active = isRouteActive(location.pathname, item.path);
        const button = (
          <ListItemButton
            key={item.path}
            selected={active}
            onClick={() => navigateAndClose(item.path)}
            aria-label={item.label}
            sx={{
              minHeight: expanded ? 46 : 50,
              mb: 0.4,
              px: expanded ? 1.25 : 0.5,
              borderRadius: '8px',
              color: active ? 'white' : alpha(theme.palette.common.white, 0.68),
              justifyContent: expanded ? 'flex-start' : 'center',
              flexDirection: expanded ? 'row' : 'column',
              gap: expanded ? 0 : 0.3,
              '&.Mui-selected': {
                bgcolor: alpha(theme.palette.common.white, 0.12),
                color: 'white',
                '&:hover': { bgcolor: alpha(theme.palette.common.white, 0.14) },
              },
              '&:hover': {
                bgcolor: alpha(theme.palette.common.white, 0.09),
                color: 'white',
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: expanded ? 38 : 0,
                color: 'inherit',
                justifyContent: 'center',
                '& .MuiSvgIcon-root': { fontSize: expanded ? 20 : 18 },
              }}
            >
              {item.icon}
            </ListItemIcon>
            {expanded ? (
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ fontSize: '0.86rem', fontWeight: active ? 800 : 650 }}
              />
            ) : (
              <Typography sx={{ fontSize: '0.56rem', fontWeight: 750, lineHeight: 1.05, textAlign: 'center' }}>
                {item.shortLabel}
              </Typography>
            )}
          </ListItemButton>
        );

        return expanded ? button : <Tooltip key={item.path} title={item.label} placement="right">{button}</Tooltip>;
      })}
    </List>
  );

  return (
    <Box className="ftf-grain" sx={{ minHeight: '100vh', display: 'flex', bgcolor: '#f3f7f3' }}>
      <Box
        component="aside"
        sx={{
          width: 88,
          display: { xs: 'none', lg: 'flex' },
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
          bgcolor: '#062407',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          zIndex: 5,
        }}
      >
        <Box onClick={() => navigate('/')} sx={{ mx: 'auto', my: 1.5, cursor: 'pointer' }}>
          <PlatformBrand compact inverse />
        </Box>
        {navList(false)}
        <Tooltip title="Sign out" placement="right">
          <IconButton onClick={handleLogout} aria-label="Sign out" sx={{ color: alpha(theme.palette.common.white, 0.68), m: 1 }}>
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Drawer
        open={!isDesktop && drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: 280, bgcolor: '#062407', color: 'white' } }}
      >
        <Box sx={{ px: 2.5, py: 2 }}>
          <PlatformBrand inverse />
        </Box>
        <Divider sx={{ borderColor: alpha(theme.palette.common.white, 0.1) }} />
        {navList(true)}
        <Button startIcon={<LogoutIcon />} onClick={handleLogout} sx={{ justifyContent: 'flex-start', m: 1.25, color: 'rgba(255,255,255,0.72)' }}>
          Sign out
        </Button>
      </Drawer>

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack
          component="header"
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{
            minHeight: 64,
            px: { xs: 1.5, md: 2.5 },
            py: 1,
            position: 'sticky',
            top: 0,
            zIndex: 4,
            bgcolor: '#062407',
            color: 'white',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <IconButton onClick={() => setDrawerOpen(true)} aria-label="Open navigation" sx={{ color: 'white', display: { lg: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Box sx={{ display: { xs: 'block', lg: 'none' } }}><PlatformBrand compact inverse /></Box>

          <Box
            component="form"
            onSubmit={handleSearch}
            sx={{
              ml: { xs: 'auto', sm: 0 },
              width: { xs: 40, sm: 330, md: 430 },
              height: 38,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: { xs: 1, sm: 1.5 },
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.16)',
              bgcolor: 'rgba(0,0,0,0.14)',
            }}
          >
            <IconButton type="submit" aria-label="Search chemical database" size="small" sx={{ p: 0, color: alpha(theme.palette.common.white, 0.68) }}>
              <SearchIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <InputBase
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search chemical database..."
              inputProps={{ 'aria-label': 'Search chemical database' }}
              sx={{
                color: 'white',
                flex: 1,
                display: { xs: 'none', sm: 'flex' },
                fontSize: '0.82rem',
                '& input::placeholder': { color: alpha(theme.palette.common.white, 0.7), opacity: 1 },
              }}
            />
          </Box>

          <Box sx={{ flex: 1 }} />
          {user && (
            <Button
              color="inherit"
              onClick={(event) => setAccountAnchor(event.currentTarget)}
              sx={{ minWidth: 0, px: { xs: 0.5, md: 1 }, textTransform: 'none', color: 'white' }}
            >
              <Stack direction="row" alignItems="center" spacing={1}>
                <Avatar sx={{ width: 34, height: 34, bgcolor: '#e7f3e6', color: '#062407', fontWeight: 800 }}>
                  {user.name?.[0] || 'F'}
                </Avatar>
                <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'left' }}>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, lineHeight: 1.1 }}>{user.name}</Typography>
                  <Typography sx={{ fontSize: '0.62rem', color: alpha(theme.palette.common.white, 0.68) }}>
                    {ROLE_LABELS[user.role] || user.role}
                  </Typography>
                </Box>
              </Stack>
            </Button>
          )}
          <Menu anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={() => setAccountAnchor(null)}>
            <Box sx={{ px: 2, py: 1.25, minWidth: 220 }}>
              <Typography variant="body2" fontWeight={800}>{user?.name}</Typography>
              <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
            </Box>
            {user?.role !== 'client' && (
              <MenuItem onClick={() => { setAccountAnchor(null); navigate('/license-settings'); }}>
                <SettingsIcon fontSize="small" sx={{ mr: 1.25 }} /> Licence settings
              </MenuItem>
            )}
            <Divider />
            <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
              <LogoutIcon fontSize="small" sx={{ mr: 1.25 }} /> Sign out
            </MenuItem>
          </Menu>
        </Stack>

        <Box
          component="main"
          className="ftf-topo-bg"
          sx={{ minHeight: 'calc(100vh - 64px)', px: { xs: 2, md: 3 }, py: { xs: 2.5, md: 3 }, position: 'relative' }}
        >
          <Box sx={{ width: '100%', maxWidth: 1800, mx: 'auto', position: 'relative', zIndex: 1 }}>
            <Outlet />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
