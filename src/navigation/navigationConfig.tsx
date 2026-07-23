import React from 'react';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import AirplanemodeActiveIcon from '@mui/icons-material/AirplanemodeActive';
import AssignmentIcon from '@mui/icons-material/Assignment';
import BuildCircleOutlinedIcon from '@mui/icons-material/BuildCircleOutlined';
import CalculateIcon from '@mui/icons-material/Calculate';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import GavelIcon from '@mui/icons-material/Gavel';
import GrassIcon from '@mui/icons-material/Grass';
import HomeIcon from '@mui/icons-material/Home';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { UserRole } from '../contexts/AuthContext';

export type NavigationGroupId = 'daily' | 'resources' | 'safety' | 'commercial' | 'support';

export interface NavigationItem {
  label: string;
  shortLabel: string;
  path: string;
  icon: React.ReactNode;
  roles: UserRole[];
}

export interface NavigationGroup {
  id: NavigationGroupId;
  label: string;
  items: NavigationItem[];
}

export const NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    id: 'daily',
    label: 'Daily operations',
    items: [
      { label: 'Operations', shortLabel: 'Operations', path: '/', icon: <HomeIcon />, roles: ['admin', 'contractor'] },
      { label: 'Missions', shortLabel: 'Missions', path: '/missions', icon: <FlightTakeoffIcon />, roles: ['admin', 'contractor'] },
      { label: 'Schedule', shortLabel: 'Schedule', path: '/schedule', icon: <CalendarMonthIcon />, roles: ['admin', 'contractor'] },
      { label: 'Weather', shortLabel: 'Weather', path: '/weather', icon: <CloudQueueIcon />, roles: ['admin', 'contractor'] },
      { label: 'Jobs', shortLabel: 'Jobs', path: '/jobs', icon: <AssignmentIcon />, roles: ['admin', 'contractor', 'client'] },
    ],
  },
  {
    id: 'resources',
    label: 'Operational resources',
    items: [
      { label: 'Aircraft', shortLabel: 'Aircraft', path: '/aircraft', icon: <AirplanemodeActiveIcon />, roles: ['admin', 'contractor'] },
      { label: 'Fleet & Packs', shortLabel: 'Fleet', path: '/fleet-work-packs', icon: <LocalShippingIcon />, roles: ['admin', 'contractor'] },
      { label: 'Maintenance', shortLabel: 'Maint.', path: '/maintenance', icon: <BuildCircleOutlinedIcon />, roles: ['admin', 'contractor'] },
      { label: 'Database', shortLabel: 'Database', path: '/database', icon: <GrassIcon />, roles: ['admin', 'contractor', 'client'] },
      { label: 'Calculator', shortLabel: 'Calculator', path: '/calculator', icon: <CalculateIcon />, roles: ['admin', 'contractor'] },
    ],
  },
  {
    id: 'safety',
    label: 'Safety and compliance',
    items: [
      { label: 'JSA System', shortLabel: 'JSA', path: '/jsa', icon: <SecurityIcon />, roles: ['admin', 'contractor'] },
      { label: 'Compliance', shortLabel: 'Compliance', path: '/compliance', icon: <GavelIcon />, roles: ['admin', 'contractor'] },
    ],
  },
  {
    id: 'commercial',
    label: 'Commercial',
    items: [
      { label: 'Quotes', shortLabel: 'Quotes', path: '/quotes', icon: <ReceiptLongIcon />, roles: ['admin', 'contractor'] },
      { label: 'Financials', shortLabel: 'Financials', path: '/financials', icon: <AccountBalanceIcon />, roles: ['admin', 'contractor'] },
    ],
  },
  {
    id: 'support',
    label: 'Support and administration',
    items: [
      { label: 'Ask FTF', shortLabel: 'Ask FTF', path: '/ask-ftf', icon: <SmartToyIcon />, roles: ['admin', 'contractor'] },
      { label: 'Settings', shortLabel: 'Settings', path: '/license-settings', icon: <SettingsIcon />, roles: ['admin', 'contractor'] },
      { label: 'Admin', shortLabel: 'Admin', path: '/admin', icon: <AdminPanelSettingsIcon />, roles: ['admin'] },
    ],
  },
];

export function getVisibleNavigationGroups(role?: UserRole): NavigationGroup[] {
  return NAVIGATION_GROUPS
    .map(group => ({ ...group, items: group.items.filter(item => !role || item.roles.includes(role)) }))
    .filter(group => group.items.length > 0);
}

export function isRouteActive(pathname: string, path: string): boolean {
  return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
}

export function getActiveGroupId(pathname: string, groups: NavigationGroup[]): NavigationGroupId | undefined {
  return groups.find(group => group.items.some(item => isRouteActive(pathname, item.path)))?.id;
}
