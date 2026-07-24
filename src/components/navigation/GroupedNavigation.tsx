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

export function GroupedNavigation({
  expanded,
  pathname,
  role,
  userId,
  onNavigate,
}: GroupedNavigationProps) {
  const groups = React.useMemo(() => getVisibleNavigationGroups(role), [role]);
  const activeGroupId = getActiveGroupId(pathname, groups);
  const [openGroups, setOpenGroups] = React.useState<Set<NavigationGroupId>>(
    () => new Set<NavigationGroupId>([
      ...readNavigationExpansion(userId),
      'daily',
      ...(activeGroupId ? [activeGroupId] : []),
    ]),
  );

  React.useEffect(() => {
    if (!activeGroupId) return;
    setOpenGroups(current => {
      if (current.has(activeGroupId)) return current;
      return new Set([...Array.from(current), activeGroupId]);
    });
  }, [activeGroupId]);

  const toggleGroup = (groupId: NavigationGroupId) => {
    setOpenGroups(current => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      writeNavigationExpansion(userId, Array.from(next));
      return next;
    });
  };

  return (
    <List aria-label="Primary navigation" sx={{ px: expanded ? 1.25 : 0.75, py: 1, flex: 1 }}>
      {groups.map(group => {
        const isOpen = openGroups.has(group.id);
        const itemsId = `navigation-group-${group.id}`;
        const heading = (
          <ListItemButton
            aria-controls={itemsId}
            aria-expanded={isOpen}
            aria-label={group.label}
            onClick={() => toggleGroup(group.id)}
            sx={{
              minHeight: expanded ? 38 : 44,
              px: expanded ? 1.25 : 0.5,
              borderRadius: '8px',
              justifyContent: expanded ? 'flex-start' : 'center',
              color: 'inherit',
              opacity: 0.82,
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
                        color: 'inherit',
                        justifyContent: expanded ? 'flex-start' : 'center',
                        flexDirection: expanded ? 'row' : 'column',
                        gap: expanded ? 0 : 0.3,
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
