import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import { useAuth } from '../contexts/AuthContext';
import { GroupedNavigation } from './navigation/GroupedNavigation';

const ROLE_LABELS: Record<string, string> = {
  admin: 'FTF Admin',
  contractor: 'Contractor',
  client: 'Client',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [accountAnchor, setAccountAnchor] = React.useState<null | HTMLElement>(null);
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    if (isDesktop) setDrawerOpen(false);
  }, [isDesktop]);

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

  return (
    <Box
      className="ftf-grain"
      data-testid="application-shell"
      sx={{ minHeight: '100vh', display: 'flex', bgcolor: '#f3f7f3' }}
    >
      {isDesktop && (
        <Box
          component="aside"
          sx={{
            width: 88,
            display: 'flex',
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
          <Box
            component="img"
            src="/logo.png"
            alt="Fly the Farm"
            onClick={() => navigate('/')}
            sx={{ width: 62, mx: 'auto', my: 1.5, cursor: 'pointer' }}
          />
          <GroupedNavigation
            expanded={false}
            pathname={location.pathname}
            role={user?.role}
            userId={user?.id || 'anonymous'}
            onNavigate={navigateAndClose}
          />
          <Tooltip title="Sign out" placement="right">
            <IconButton onClick={handleLogout} aria-label="Sign out" sx={{ color: alpha(theme.palette.common.white, 0.68), m: 1 }}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {!isDesktop && (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          PaperProps={{ sx: { width: 280, bgcolor: '#062407', color: 'white' } }}
        >
          <Box sx={{ px: 2.5, py: 2 }}>
            <Box component="img" src="/logo.png" alt="Fly the Farm" sx={{ height: 44, width: 'auto' }} />
          </Box>
          <Divider sx={{ borderColor: alpha(theme.palette.common.white, 0.1) }} />
          <GroupedNavigation
            expanded
            pathname={location.pathname}
            role={user?.role}
            userId={user?.id || 'anonymous'}
            onNavigate={navigateAndClose}
          />
          <Button startIcon={<LogoutIcon />} onClick={handleLogout} sx={{ justifyContent: 'flex-start', m: 1.25, color: 'rgba(255,255,255,0.72)' }}>
            Sign out
          </Button>
        </Drawer>
      )}

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
          <Box component="img" src="/logo.png" alt="Fly the Farm" sx={{ height: 38, display: { xs: 'block', lg: 'none' } }} />

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
