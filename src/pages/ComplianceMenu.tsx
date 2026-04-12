import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Button,
  useTheme,
  alpha,
} from '@mui/material';
import GavelIcon from '@mui/icons-material/Gavel';
import ScienceIcon from '@mui/icons-material/Science';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import SecurityIcon from '@mui/icons-material/Security';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import ShieldIcon from '@mui/icons-material/Shield';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

interface ComplianceArea {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  route: string;
  status: 'available' | 'coming-soon';
  priority: 'high' | 'medium' | 'low';
}

const COMPLIANCE_AREAS: ComplianceArea[] = [
  {
    id: 'chemical',
    title: 'Chemical Compliance & Recording',
    description: 'APVMA federal requirements and state-specific chemical application regulations, spray diaries, and record keeping.',
    icon: <ScienceIcon />,
    route: '/compliance/chemical',
    status: 'available',
    priority: 'high',
  },
  {
    id: 'flight',
    title: 'CASA Flight Log Compliance',
    description: 'Comprehensive flight logging system meeting CASA and Manual of Standards requirements for drone operations.',
    icon: <FlightTakeoffIcon />,
    route: '/compliance/flight',
    status: 'available',
    priority: 'high',
  },
  {
    id: 'transport',
    title: 'Chemical Transport & Storage',
    description: 'Dangerous goods transport requirements, storage compliance, and handling protocols for agricultural chemicals.',
    icon: <LocalShippingIcon />,
    route: '/compliance/transport',
    status: 'available',
    priority: 'high',
  },
  {
    id: 'licensing',
    title: 'Operator Licensing & Certification',
    description: 'Professional applicator certifications, drone operator licenses, and ongoing training requirements.',
    icon: <AssignmentTurnedInIcon />,
    route: '/compliance/licensing',
    status: 'available',
    priority: 'medium',
  },
  {
    id: 'environmental',
    title: 'Environmental Protection',
    description: 'Waterway protection, buffer zones, sensitive area compliance, and environmental impact assessments.',
    icon: <ShieldIcon />,
    route: '/compliance/environmental',
    status: 'available',
    priority: 'high',
  },
  {
    id: 'safety',
    title: 'Safety & PPE Compliance',
    description: 'Personal protective equipment requirements, safety protocols, and workplace health and safety compliance.',
    icon: <SecurityIcon />,
    route: '/compliance/safety',
    status: 'available',
    priority: 'medium',
  },
  {
    id: 'documentation',
    title: 'Documentation & Audit Trails',
    description: 'Record retention requirements, audit preparation, and compliance documentation management.',
    icon: <DocumentScannerIcon />,
    route: '/compliance/documentation',
    status: 'available',
    priority: 'low',
  },
];

export default function ComplianceMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();

  const handleAreaClick = (area: ComplianceArea) => {
    if (area.status === 'available') {
      navigate(area.route);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return { bg: alpha('#d32f2f', 0.1), color: '#d32f2f', label: 'High Priority' };
      case 'medium':
        return { bg: alpha('#ff9800', 0.1), color: '#ff9800', label: 'Medium Priority' };
      case 'low':
        return { bg: alpha('#388e3c', 0.1), color: '#388e3c', label: 'Low Priority' };
      default:
        return { bg: alpha('#757575', 0.1), color: '#757575', label: 'Standard' };
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <GavelIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'primary.dark', fontSize: { xs: '1.8rem', md: '2.2rem' } }}>
              Compliance Management
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 400, mt: 1 }}>
              Agricultural Chemical & Operational Compliance
            </Typography>
          </Box>
        </Box>

        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 900, lineHeight: 1.6 }}>
          Comprehensive compliance management for agricultural drone operations in Australia.
          Navigate federal APVMA requirements and state-specific regulations to maintain full operational compliance.
        </Typography>
      </Box>

      {/* Compliance Areas Grid */}
      <Grid container spacing={3}>
        {COMPLIANCE_AREAS.map((area) => {
          const priorityInfo = getPriorityColor(area.priority);
          const isActive = location.pathname === area.route;

          return (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={area.id}>
              <Card
                elevation={0}
                sx={{
                  height: '100%',
                  border: `2px solid ${isActive ? theme.palette.primary.main : alpha(theme.palette.primary.main, 0.1)}`,
                  borderRadius: '16px',
                  cursor: area.status === 'available' ? 'pointer' : 'default',
                  transition: 'all 0.3s ease',
                  opacity: area.status === 'coming-soon' ? 0.6 : 1,
                  '&:hover': area.status === 'available' ? {
                    transform: 'translateY(-4px)',
                    boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.15)}`,
                    borderColor: theme.palette.primary.main,
                  } : {},
                  bgcolor: isActive ? alpha(theme.palette.primary.main, 0.02) : 'background.paper',
                }}
                onClick={() => handleAreaClick(area)}
              >
                <CardContent sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  {/* Header */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: '12px',
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        color: 'primary.main',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: 24,
                      }}
                    >
                      {area.icon}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, lineHeight: 1.3 }}>
                        {area.title}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                        <Box
                          sx={{
                            px: 1.5,
                            py: 0.5,
                            borderRadius: '8px',
                            bgcolor: priorityInfo.bg,
                            color: priorityInfo.color,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                          }}
                        >
                          {priorityInfo.label}
                        </Box>
                        {area.status === 'coming-soon' && (
                          <Box
                            sx={{
                              px: 1.5,
                              py: 0.5,
                              borderRadius: '8px',
                              bgcolor: alpha('#757575', 0.1),
                              color: '#757575',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                            }}
                          >
                            Coming Soon
                          </Box>
                        )}
                      </Box>
                    </Box>
                  </Box>

                  {/* Description */}
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      flex: 1,
                      lineHeight: 1.6,
                      mb: 3,
                    }}
                  >
                    {area.description}
                  </Typography>

                  {/* Action Button */}
                  {area.status === 'available' && (
                    <Button
                      variant={isActive ? 'contained' : 'outlined'}
                      endIcon={<ArrowForwardIcon />}
                      sx={{
                        borderRadius: '10px',
                        fontWeight: 700,
                        py: 1,
                        alignSelf: 'flex-start',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAreaClick(area);
                      }}
                    >
                      {isActive ? 'Currently Viewing' : 'Access Compliance Area'}
                    </Button>
                  )}

                  {area.status === 'coming-soon' && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.disabled',
                        fontStyle: 'italic',
                        alignSelf: 'flex-start',
                      }}
                    >
                      Development in progress
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Footer Note */}
      <Box sx={{ mt: 6, p: 3, bgcolor: alpha(theme.palette.warning.main, 0.05), borderRadius: '12px' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, color: 'warning.dark' }}>
          Important Compliance Notice
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          This compliance management system is designed to assist with regulatory adherence but does not replace
          professional legal or regulatory advice. Always verify current requirements with relevant authorities and
          consult with compliance experts for your specific operational context.
        </Typography>
      </Box>
    </Box>
  );
}