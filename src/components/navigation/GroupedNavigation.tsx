import React from 'react';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import {
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import { UserRole } from '../../contexts/AuthContext';
import {
  getActiveGroupId,
  getVisibleNavigationGroups,
  isRouteActive,
  NavigationGroupId,
} from '../../navigation/navigationConfig';
import {
  readNavigationExpansion,
  writeNavigationExpansion,
} from '../../services/navigationPreferenceStore';

interface GroupedNavigationProps {
  expanded: boolean;
  pathname: string;
  role?: UserRole;
  userId: string;
  onNavigate(path: string): void;
}

const groupIcons: Record<NavigationGroupId, React.ReactNode> = {
  daily: <TodayOutlinedIcon />,
  resources: <Inventory2OutlinedIcon />,
  safety: <VerifiedUserOutlinedIcon />,
  commercial: <AccountBalanceOutlinedIcon />,
  support: <HelpOutlineIcon />,
};

function initialOpenGroups(userId: string, activeGroupId?: NavigationGroupId): Set<NavigationGroupId> {
  return new Set<NavigationGroupId>([
    ...readNavigationExpansion(userId),
    'daily',
    ...(activeGroupId ? [activeGroupId] : []),
  ]);
}

export function GroupedNavigation({
  expanded,
  pathname,
  role,
  userId,
  onNavigate,
}: GroupedNavigationProps) {
  const groups = React.useMemo(() => getVisibleNavigationGroups(role), [role]);
  const activeGroupId = getActiveGroupId(pathname, groups);
  const instanceId = React.useId();
  const [expansion, setExpansion] = React.useState(() => ({
    userId,
    openGroups: initialOpenGroups(userId, activeGroupId),
  }));
  const currentUserOpenGroups = expansion.userId === userId
    ? expansion.openGroups
    : initialOpenGroups(userId, activeGroupId);
  const openGroups = activeGroupId && !currentUserOpenGroups.has(activeGroupId)
    ? new Set([...Array.from(currentUserOpenGroups), activeGroupId])
    : currentUserOpenGroups;

  React.useEffect(() => {
    const nextUserOpenGroups = initialOpenGroups(userId, activeGroupId);
    setExpansion(current => {
      if (current.userId !== userId) {
        return { userId, openGroups: nextUserOpenGroups };
      }
      if (!activeGroupId || current.openGroups.has(activeGroupId)) return current;
      return {
        userId,
        openGroups: new Set([...Array.from(current.openGroups), activeGroupId]),
      };
    });
  }, [activeGroupId, userId]);

  const toggleGroup = (groupId: NavigationGroupId) => {
    const next = new Set(openGroups);
    if (groupId === activeGroupId) {
      next.add(groupId);
    } else if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    setExpansion({ userId, openGroups: next });
    writeNavigationExpansion(userId, Array.from(next));
  };

  return (
    <List aria-label="Primary navigation" sx={{ px: expanded ? 1.25 : 0.75, py: 1, flex: 1 }}>
      {groups.map(group => {
        const isOpen = openGroups.has(group.id);
        const itemsId = `${instanceId}-navigation-group-${group.id}`;
        const heading = (
          <ListItemButton
            aria-controls={isOpen ? itemsId : undefined}
            aria-expanded={isOpen}
            aria-label={group.label}
            onClick={() => toggleGroup(group.id)}
            sx={{
              minHeight: expanded ? 38 : 44,
              px: expanded ? 1.25 : 0.5,
              borderRadius: '8px',
              justifyContent: expanded ? 'flex-start' : 'center',
              color: 'rgba(255, 255, 255, 0.92)',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                color: '#fff',
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: expanded ? 36 : 0,
                color: 'inherit',
                justifyContent: 'center',
                '& .MuiSvgIcon-root': { fontSize: expanded ? 19 : 20 },
              }}
            >
              {groupIcons[group.id]}
            </ListItemIcon>
            {expanded && (
              <>
                <ListItemText
                  primary={group.label}
                  primaryTypographyProps={{ fontSize: '0.72rem', fontWeight: 800 }}
                />
                {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </>
            )}
          </ListItemButton>
        );

        return (
          <React.Fragment key={group.id}>
            {expanded ? heading : (
              <Tooltip title={group.label} placement="right">
                {heading}
              </Tooltip>
            )}
            <Collapse in={isOpen} timeout="auto" unmountOnExit>
              <List id={itemsId} component="div" disablePadding>
                {group.items.map(item => {
                  const active = isRouteActive(pathname, item.path);
                  const link = (
                    <ListItemButton
                      component="a"
                      href={item.path}
                      selected={active}
                      aria-current={active ? 'page' : undefined}
                      aria-label={item.label}
                      onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
                        event.preventDefault();
                        onNavigate(item.path);
                      }}
                      sx={{
                        minHeight: expanded ? 44 : 48,
                        mb: 0.4,
                        ml: expanded ? 1 : 0,
                        px: expanded ? 1.25 : 0.5,
                        borderRadius: '8px',
                        color: 'rgba(255, 255, 255, 0.92)',
                        justifyContent: expanded ? 'flex-start' : 'center',
                        flexDirection: expanded ? 'row' : 'column',
                        gap: expanded ? 0 : 0.3,
                        '&:hover': {
                          backgroundColor: 'rgba(255, 255, 255, 0.12)',
                          color: '#fff',
                        },
                        '&.Mui-selected': {
                          backgroundColor: 'rgba(255, 255, 255, 0.2)',
                          color: '#fff',
                          '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.28)',
                          },
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
                        <Typography sx={{ fontSize: '0.56rem', fontWeight: 750, lineHeight: 1.05 }}>
                          {item.shortLabel}
                        </Typography>
                      )}
                    </ListItemButton>
                  );

                  return expanded ? (
                    <React.Fragment key={item.path}>{link}</React.Fragment>
                  ) : (
                    <Tooltip key={item.path} title={item.label} placement="right">
                      {link}
                    </Tooltip>
                  );
                })}
              </List>
            </Collapse>
          </React.Fragment>
        );
      })}
    </List>
  );
}
