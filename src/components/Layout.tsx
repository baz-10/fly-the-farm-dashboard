import React from 'react';
import PlatformBrand from '../brand/PlatformBrand';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Collapse,
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
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import { useAuth } from '../contexts/AuthContext';
import { findActiveNavigationGroup, HOME_NAV_ITEM, isNavigationItemActive, ORGANISATION_NAV_GROUPS } from '../navigation/organisationNavigation';
import { getMaturityEntry } from '../productMaturity/registry';
import { MaturityBadge } from './productMaturity/MaturityBadge';
import { ProductMaturitySurface } from './productMaturity/ProductMaturitySurface';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Organisation Admin',
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
  const activeGroup = findActiveNavigationGroup(location.pathname);
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(() => new Set(activeGroup ? [activeGroup] : []));

  React.useEffect(() => {
    if (!activeGroup) return;
    setExpandedGroups((current) => current.has(activeGroup) ? current : new Set([...Array.from(current), activeGroup]));
  }, [activeGroup]);

  const navGroups = ORGANISATION_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      (!user?.role || item.roles.includes(user.role))
      && (!item.entitlement || Boolean(user?.entitlements?.includes(item.entitlement)))
    ),
  })).filter((group) => group.items.length > 0);

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

  const toggleGroup = (groupId: string) => setExpandedGroups((current) => {
    const next = new Set(current);
    if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
    return next;
  });

  const maturityEntryFor = (item: typeof HOME_NAV_ITEM) => getMaturityEntry(item.moduleCode, item.workflowCode);
  const maturityTooltipFor = (item: typeof HOME_NAV_ITEM) => {
    const maturity = maturityEntryFor(item).maturity;
    const label = maturity === 'BETA' ? 'Beta' : maturity === 'COMING_SOON' ? 'Coming Soon' : null;
    return label ? `${item.label} — ${label}` : item.label;
  };

  const navList = (expanded: boolean) => (
    <List component="nav" aria-label="Organisation navigation" sx={{ px: expanded ? 1.25 : 0.75, py: 1, flex: 1 }}>
      {(() => {
        const active = location.pathname === '/';
        const maturityEntry = maturityEntryFor(HOME_NAV_ITEM);
        const homeButton = <ListItemButton
          selected={active}
          onClick={() => navigateAndClose(HOME_NAV_ITEM.path)}
          aria-label="Home"
          aria-current={active ? 'page' : undefined}
          sx={{
            minHeight: expanded ? 46 : 48, mb: 1.1, px: expanded ? 1.25 : 0.5,
            borderRadius: '8px', color: active ? 'white' : alpha(theme.palette.common.white, 0.78),
            justifyContent: expanded ? 'flex-start' : 'center', flexDirection: expanded ? 'row' : 'column',
            gap: expanded ? 0 : 0.25, borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.1)}`,
            '&.Mui-selected': { bgcolor: alpha(theme.palette.common.white, 0.14), color: 'white' },
            '&:hover': { bgcolor: alpha(theme.palette.common.white, 0.09), color: 'white' },
          }}
        >
          <ListItemIcon sx={{ minWidth: expanded ? 34 : 0, color: 'inherit', justifyContent: 'center', '& .MuiSvgIcon-root': { fontSize: expanded ? 20 : 18 } }}>{HOME_NAV_ITEM.icon}</ListItemIcon>
          {expanded ? <><ListItemText primary="Home" primaryTypographyProps={{ fontSize: '0.84rem', fontWeight: active ? 850 : 700 }} /><MaturityBadge entry={maturityEntry} showComingSoon /></> : <Typography sx={{ fontSize: '0.52rem', fontWeight: 800, lineHeight: 1.05 }}>Home</Typography>}
        </ListItemButton>;
        return expanded ? homeButton : <Tooltip title={maturityTooltipFor(HOME_NAV_ITEM)} placement="right">{homeButton}</Tooltip>;
      })()}
      {navGroups.map((group) => {
        const open = expandedGroups.has(group.id);
        const groupActive = activeGroup === group.id;
        return <React.Fragment key={group.id}>
          <ListItemButton
            onClick={() => toggleGroup(group.id)}
            aria-label={`${group.label} navigation group`}
            aria-expanded={open}
            sx={{
              minHeight: expanded ? 38 : 42,
              mb: 0.2,
              px: expanded ? 1.25 : 0.4,
              borderRadius: '8px',
              color: groupActive ? 'white' : alpha(theme.palette.common.white, 0.68),
              justifyContent: expanded ? 'flex-start' : 'center',
              bgcolor: groupActive ? alpha(theme.palette.common.white, 0.08) : 'transparent',
              '&:hover': { bgcolor: alpha(theme.palette.common.white, 0.09), color: 'white' },
            }}
          >
            {expanded ? (
              <><ListItemText primary={group.label} primaryTypographyProps={{ fontSize: '0.69rem', letterSpacing: '0.09em', fontWeight: 850 }} />{open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}</>
            ) : (
              <Typography sx={{ fontSize: '0.48rem', fontWeight: 850, lineHeight: 1.05, textAlign: 'center' }}>{group.label}</Typography>
            )}
          </ListItemButton>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <List disablePadding>
              {group.items.map((item) => {
                const active = isNavigationItemActive(location.pathname, item);
                const maturityEntry = maturityEntryFor(item);
                const button = <ListItemButton key={item.path} selected={active} onClick={() => navigateAndClose(item.path)} aria-label={item.label} sx={{ minHeight: expanded ? 42 : 45, mb: 0.25, pl: expanded ? 2 : 0.5, pr: expanded ? 1 : 0.5, borderRadius: '8px', color: active ? 'white' : alpha(theme.palette.common.white, 0.68), justifyContent: expanded ? 'flex-start' : 'center', flexDirection: expanded ? 'row' : 'column', gap: expanded ? 0 : 0.25, '&.Mui-selected': { bgcolor: alpha(theme.palette.common.white, 0.14), color: 'white' }, '&:hover': { bgcolor: alpha(theme.palette.common.white, 0.09), color: 'white' } }}>
                  <ListItemIcon sx={{ minWidth: expanded ? 34 : 0, color: 'inherit', justifyContent: 'center', '& .MuiSvgIcon-root': { fontSize: expanded ? 19 : 17 } }}>{item.icon}</ListItemIcon>
                  {expanded ? <><ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.82rem', fontWeight: active ? 800 : 650 }} /><MaturityBadge entry={maturityEntry} showComingSoon /></> : <Typography sx={{ fontSize: '0.52rem', fontWeight: 750, lineHeight: 1.05, textAlign: 'center' }}>{item.shortLabel}</Typography>}
                </ListItemButton>;
                return expanded ? button : <Tooltip key={item.path} title={maturityTooltipFor(item)} placement="right">{button}</Tooltip>;
              })}
            </List>
          </Collapse>
        </React.Fragment>;
      })}
    </List>
  );

  return (
    <Box className="ftf-grain" sx={{ minHeight: '100vh', display: 'flex', bgcolor: '#f3f7f3' }}>
      <Box
        component="aside"
        sx={{
          width: 104,
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
            <ProductMaturitySurface pathname={location.pathname} search={location.search}>
              <Outlet />
            </ProductMaturitySurface>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
