import React from 'react';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import AirplanemodeActiveIcon from '@mui/icons-material/AirplanemodeActive';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CalculateIcon from '@mui/icons-material/Calculate';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import GavelIcon from '@mui/icons-material/Gavel';
import GrassIcon from '@mui/icons-material/Grass';
import HomeIcon from '@mui/icons-material/Home';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { UserRole } from '../contexts/AuthContext';

export interface NavigationItem {
  label: string;
  shortLabel: string;
  path: string;
  icon: React.ReactNode;
  roles: UserRole[];
  entitlement?: string;
  activePrefixes?: string[];
}

export interface NavigationGroup {
  id: string;
  label: string;
  items: NavigationItem[];
}

const organisationRoles: UserRole[] = ['admin', 'contractor'];

export const HOME_NAV_ITEM: NavigationItem = {
  label: 'Home', shortLabel: 'Home', path: '/', icon: <HomeIcon />, roles: organisationRoles,
};

export const CLIENT_RESOURCE_LINKS: NavigationItem[] = [
  { label: 'Clients', shortLabel: 'Clients', path: '/jobs', icon: <PeopleIcon />, roles: ['admin', 'contractor', 'client'], activePrefixes: ['/jobs/client'] },
  { label: 'Properties', shortLabel: 'Properties', path: '/jobs?view=properties', icon: <GrassIcon />, roles: ['admin', 'contractor', 'client'] },
  { label: 'Fields', shortLabel: 'Fields', path: '/jobs?view=fields', icon: <GrassIcon />, roles: ['admin', 'contractor', 'client'] },
  { label: 'Jobs', shortLabel: 'Jobs', path: '/jobs?view=jobs', icon: <AssignmentIcon />, roles: ['admin', 'contractor', 'client'] },
];

export const ORGANISATION_NAV_GROUPS: NavigationGroup[] = [
  { id: 'clients', label: 'CLIENTS', items: CLIENT_RESOURCE_LINKS },
  { id: 'operations', label: 'OPERATIONS', items: [
    { label: 'Missions', shortLabel: 'Missions', path: '/missions', icon: <FlightTakeoffIcon />, roles: organisationRoles },
    { label: 'Calculator', shortLabel: 'Calculator', path: '/calculator', icon: <CalculateIcon />, roles: organisationRoles },
  ] },
  { id: 'fleet', label: 'FLEET', items: [
    { label: 'Aircraft', shortLabel: 'Aircraft', path: '/aircraft', icon: <AirplanemodeActiveIcon />, roles: organisationRoles },
    { label: 'Equipment Kits & Fleet', shortLabel: 'Fleet', path: '/fleet-work-packs', icon: <LocalShippingIcon />, roles: organisationRoles },
  ] },
  { id: 'people', label: 'PEOPLE', items: [{ label: 'Personnel', shortLabel: 'Personnel', path: '/personnel', icon: <PeopleIcon />, roles: organisationRoles }] },
  { id: 'compliance', label: 'COMPLIANCE', items: [
    { label: 'CASA Compliance', shortLabel: 'CASA', path: '/compliance', icon: <GavelIcon />, roles: organisationRoles },
    { label: 'Checklists', shortLabel: 'Checklists', path: '/compliance/checklists', icon: <AssignmentIcon />, roles: organisationRoles },
    { label: 'JSA System', shortLabel: 'JSA', path: '/jsa', icon: <SecurityIcon />, roles: organisationRoles },
  ] },
  { id: 'intelligence', label: 'INTELLIGENCE', items: [
    { label: 'Chemical Database', shortLabel: 'Database', path: '/database', icon: <GrassIcon />, roles: ['admin', 'contractor', 'client'] },
    { label: 'Legacy Ask FTF', shortLabel: 'Legacy Ask FTF', path: '/ask-ftf', icon: <SmartToyIcon />, roles: organisationRoles, entitlement: 'legacyAskFtf' },
  ] },
  { id: 'reports', label: 'REPORTS', items: [
    { label: 'Quotes', shortLabel: 'Quotes', path: '/quotes', icon: <ReceiptLongIcon />, roles: organisationRoles },
    { label: 'Financials', shortLabel: 'Financials', path: '/financials', icon: <AccountBalanceIcon />, roles: organisationRoles },
  ] },
  { id: 'organisation', label: 'ORGANISATION', items: [
    { label: 'Settings', shortLabel: 'Settings', path: '/license-settings', icon: <SettingsIcon />, roles: organisationRoles },
    { label: 'Administration', shortLabel: 'Admin', path: '/admin', icon: <AdminPanelSettingsIcon />, roles: ['admin'] },
  ] },
];

function pathnameOnly(path: string) {
  return path.split('?')[0];
}

export function isNavigationItemActive(pathname: string, item: NavigationItem) {
  const path = pathnameOnly(item.path);
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`) || Boolean(item.activePrefixes?.some((prefix) => pathname.startsWith(prefix)));
}

export function findActiveNavigationGroup(pathname: string) {
  if (pathname === '/') return null;
  if (pathname.startsWith('/jobs')) return 'clients';
  return ORGANISATION_NAV_GROUPS.find((group) => group.items.some((item) => isNavigationItemActive(pathname, item)))?.id || null;
}
