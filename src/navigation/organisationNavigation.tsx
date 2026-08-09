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
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import { UserRole } from '../contexts/AuthContext';

export interface NavigationItem {
  label: string;
  shortLabel: string;
  path: string;
  icon: React.ReactNode;
  roles: UserRole[];
  entitlement?: string;
  activePrefixes?: string[];
  moduleCode: string;
  workflowCode?: string;
  context?: 'INCOMPLETE_ONBOARDING';
}

export interface NavigationGroup {
  id: string;
  label: string;
  items: NavigationItem[];
}

const organisationRoles: UserRole[] = ['admin', 'contractor'];

export const HOME_NAV_ITEM: NavigationItem = {
  label: 'Home', shortLabel: 'Home', path: '/', icon: <HomeIcon />, roles: organisationRoles, moduleCode: 'home',
};

export const GETTING_STARTED_NAV_ITEM: NavigationItem = {
  label: 'Getting Started', shortLabel: 'Start', path: '/getting-started', icon: <ChecklistRoundedIcon />,
  roles: ['admin'], moduleCode: 'organisation-onboarding', context: 'INCOMPLETE_ONBOARDING',
};

export const CLIENT_RESOURCE_LINKS: NavigationItem[] = [
  { label: 'Clients', shortLabel: 'Clients', path: '/jobs', icon: <PeopleIcon />, roles: ['admin', 'contractor', 'client'], activePrefixes: ['/jobs/client'], moduleCode: 'clients' },
  { label: 'Properties', shortLabel: 'Properties', path: '/jobs?view=properties', icon: <GrassIcon />, roles: ['admin', 'contractor', 'client'], moduleCode: 'properties' },
  { label: 'Fields', shortLabel: 'Fields', path: '/jobs?view=fields', icon: <GrassIcon />, roles: ['admin', 'contractor', 'client'], moduleCode: 'fields' },
  { label: 'Jobs', shortLabel: 'Jobs', path: '/jobs?view=jobs', icon: <AssignmentIcon />, roles: ['admin', 'contractor', 'client'], moduleCode: 'jobs' },
];

export const ORGANISATION_NAV_GROUPS: NavigationGroup[] = [
  { id: 'clients', label: 'CLIENTS', items: CLIENT_RESOURCE_LINKS },
  { id: 'operations', label: 'OPERATIONS', items: [
    { label: 'Missions', shortLabel: 'Missions', path: '/missions', icon: <FlightTakeoffIcon />, roles: organisationRoles, moduleCode: 'mission-register' },
    { label: 'Calculator', shortLabel: 'Calculator', path: '/calculator', icon: <CalculateIcon />, roles: organisationRoles, moduleCode: 'spray-calculator' },
  ] },
  { id: 'fleet', label: 'FLEET', items: [
    { label: 'Aircraft', shortLabel: 'Aircraft', path: '/aircraft', icon: <AirplanemodeActiveIcon />, roles: organisationRoles, moduleCode: 'aircraft' },
    { label: 'Equipment Kits & Fleet', shortLabel: 'Fleet', path: '/fleet-work-packs', icon: <LocalShippingIcon />, roles: organisationRoles, moduleCode: 'fleet-work-packs' },
  ] },
  { id: 'people', label: 'PEOPLE', items: [{ label: 'Personnel', shortLabel: 'Personnel', path: '/personnel', icon: <PeopleIcon />, roles: organisationRoles, moduleCode: 'personnel' }] },
  { id: 'compliance', label: 'COMPLIANCE', items: [
    { label: 'CASA Compliance', shortLabel: 'CASA', path: '/compliance', icon: <GavelIcon />, roles: organisationRoles, moduleCode: 'casa-compliance' },
    { label: 'Checklists', shortLabel: 'Checklists', path: '/compliance/checklists', icon: <AssignmentIcon />, roles: organisationRoles, moduleCode: 'controlled-checklists' },
    { label: 'JSA System', shortLabel: 'JSA', path: '/jsa', icon: <SecurityIcon />, roles: organisationRoles, moduleCode: 'mission-jsa' },
  ] },
  { id: 'intelligence', label: 'INTELLIGENCE', items: [
    { label: 'Chemical Database', shortLabel: 'Database', path: '/database', icon: <GrassIcon />, roles: ['admin', 'contractor', 'client'], moduleCode: 'chemical-database' },
    { label: 'Operational Intelligence', shortLabel: 'Operational Intelligence', path: '/ask-ftf', icon: <SmartToyIcon />, roles: organisationRoles, entitlement: 'legacyAskFtf', moduleCode: 'operational-intelligence' },
  ] },
  { id: 'reports', label: 'REPORTS', items: [
    { label: 'Quotes', shortLabel: 'Quotes', path: '/quotes', icon: <ReceiptLongIcon />, roles: organisationRoles, moduleCode: 'quotes' },
    { label: 'Financials', shortLabel: 'Financials', path: '/financials', icon: <AccountBalanceIcon />, roles: organisationRoles, moduleCode: 'financials' },
  ] },
  { id: 'organisation', label: 'ORGANISATION', items: [
    GETTING_STARTED_NAV_ITEM,
    { label: 'Settings', shortLabel: 'Settings', path: '/license-settings', icon: <SettingsIcon />, roles: organisationRoles, moduleCode: 'licences-credentials' },
    { label: 'Administration', shortLabel: 'Admin', path: '/admin', icon: <AdminPanelSettingsIcon />, roles: ['admin'], moduleCode: 'organisation-administration' },
  ] },
];

export function getOrganisationNavigationGroups({ gettingStartedIncomplete }: { gettingStartedIncomplete: boolean }) {
  return ORGANISATION_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.context !== 'INCOMPLETE_ONBOARDING' || gettingStartedIncomplete),
  }));
}

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
