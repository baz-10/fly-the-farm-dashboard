import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  MissionRecord,
  MissionStatus,
  MissionType,
  MissionPriority,
  MissionSearchCriteria,
  MissionStatistics,
  MissionValidationError,
  JSARecord,
  JSAStatus,
  JSAType,
  BoundaryFile,
  FlightPlan,
  FlightExecution,
  MissionApprovals,
  MissionAuditEntry,
  ApprovalStatus,
  MissionTemplate,
} from '../types/mission';
import { useAuth } from './AuthContext';
import { useAircraft } from './AircraftContext';

// Context Type Definition
interface MissionContextType {
  // State
  missions: MissionRecord[];
  missionTemplates: MissionTemplate[];
  isLoading: boolean;
  error: string | null;
  statistics: MissionStatistics | null;

  // Mission CRUD Operations
  createMission: (mission: Omit<MissionRecord, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'lastModifiedBy' | 'auditTrail' | 'approvals'>) => Promise<string>;
  updateMission: (id: string, updates: Partial<Omit<MissionRecord, 'id' | 'createdAt' | 'createdBy' | 'auditTrail'>>) => Promise<void>;
  deleteMission: (id: string) => Promise<void>;
  getMissionById: (id: string) => MissionRecord | undefined;

  // Status Workflow Management
  transitionMissionStatus: (id: string, toStatus: MissionStatus, comments?: string) => Promise<void>;
  validateStatusTransition: (fromStatus: MissionStatus, toStatus: MissionStatus, mission: MissionRecord) => MissionValidationError[];
  getValidNextStatuses: (currentStatus: MissionStatus) => MissionStatus[];

  // Approval Management
  approveMission: (id: string, approvalType: 'planning' | 'flying' | 'completion' | 'final', digitalSignature: string, comments?: string) => Promise<void>;
  rejectMission: (id: string, approvalType: 'planning' | 'flying' | 'completion' | 'final', reason: string) => Promise<void>;
  checkApprovalRequirements: (mission: MissionRecord, approvalType: 'planning' | 'flying' | 'completion' | 'final') => MissionValidationError[];

  // Component Management
  updateJSARecord: (missionId: string, jsa: JSARecord) => Promise<void>;
  addBoundaryFile: (missionId: string, boundaryFile: BoundaryFile) => Promise<void>;
  removeBoundaryFile: (missionId: string, boundaryFileId: string) => Promise<void>;
  updateFlightPlan: (missionId: string, flightPlan: FlightPlan) => Promise<void>;
  updateFlightExecution: (missionId: string, flightExecution: FlightExecution) => Promise<void>;

  // Search and Filtering
  searchMissions: (criteria: MissionSearchCriteria) => MissionRecord[];
  getMissionsByStatus: (status: MissionStatus) => MissionRecord[];
  getMissionsByType: (type: MissionType) => MissionRecord[];
  getMissionsByPriority: (priority: MissionPriority) => MissionRecord[];
  getMissionsByDateRange: (startDate: string, endDate: string) => MissionRecord[];
  getUpcomingMissions: (days?: number) => MissionRecord[];
  getOverdueMissions: () => MissionRecord[];

  // Statistics and Analytics
  calculateStatistics: () => MissionStatistics;
  getMissionsForUser: (userId: string) => MissionRecord[];
  getMissionStatusHistory: (id: string) => MissionAuditEntry[];

  // Validation Functions
  validateMission: (mission: Partial<MissionRecord>) => MissionValidationError[];
  validateMissionReadiness: (id: string, targetStatus: MissionStatus) => MissionValidationError[];

  // Aircraft Integration Functions
  validateAircraftAvailability: (aircraftId: string, startDate: string, endDate?: string) => {
    available: boolean;
    conflicts: string[];
    recommendations: string[];
  };
  getCompatibleConfigurations: (aircraftId: string) => Array<{
    configuration: any;
    kit: any;
    compatibilityScore: number;
  }>;
  calculateMissionCost: (missionData: Partial<MissionRecord>) => {
    aircraftCost: number;
    equipmentCost: number;
    totalCost: number;
    breakdown: Record<string, number>;
  };

  // Template Management
  createTemplate: (template: Omit<MissionTemplate, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<string>;
  updateTemplate: (id: string, updates: Partial<Omit<MissionTemplate, 'id' | 'createdAt' | 'createdBy'>>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  getTemplateById: (id: string) => MissionTemplate | undefined;
  createMissionFromTemplate: (templateId: string, overrides: Partial<MissionRecord>) => Promise<string>;

  // Data Management
  loadData: () => Promise<void>;
  saveData: () => Promise<void>;
  clearData: () => Promise<void>;
  exportMissionData: (missionIds?: string[]) => string;
  importMissionData: (data: string) => Promise<void>;
}

// Default Context Value
const defaultContext: MissionContextType = {
  missions: [],
  missionTemplates: [],
  isLoading: false,
  error: null,
  statistics: null,
  createMission: async () => '',
  updateMission: async () => {},
  deleteMission: async () => {},
  getMissionById: () => undefined,
  transitionMissionStatus: async () => {},
  validateStatusTransition: () => [],
  getValidNextStatuses: () => [],
  approveMission: async () => {},
  rejectMission: async () => {},
  checkApprovalRequirements: () => [],
  updateJSARecord: async () => {},
  addBoundaryFile: async () => {},
  removeBoundaryFile: async () => {},
  updateFlightPlan: async () => {},
  updateFlightExecution: async () => {},
  searchMissions: () => [],
  getMissionsByStatus: () => [],
  getMissionsByType: () => [],
  getMissionsByPriority: () => [],
  getMissionsByDateRange: () => [],
  getUpcomingMissions: () => [],
  getOverdueMissions: () => [],
  calculateStatistics: () => ({} as MissionStatistics),
  getMissionsForUser: () => [],
  getMissionStatusHistory: () => [],
  validateMission: () => [],
  validateMissionReadiness: () => [],
  validateAircraftAvailability: () => ({ available: false, conflicts: [], recommendations: [] }),
  getCompatibleConfigurations: () => [],
  calculateMissionCost: () => ({ aircraftCost: 0, equipmentCost: 0, totalCost: 0, breakdown: {} }),
  createTemplate: async () => '',
  updateTemplate: async () => {},
  deleteTemplate: async () => {},
  getTemplateById: () => undefined,
  createMissionFromTemplate: async () => '',
  loadData: async () => {},
  saveData: async () => {},
  clearData: async () => {},
  exportMissionData: () => '',
  importMissionData: async () => {},
};

// Create Context
const MissionContext = createContext<MissionContextType>(defaultContext);

// Storage Keys
const STORAGE_KEY = 'ftf_missions';
const TEMPLATES_STORAGE_KEY = 'ftf_mission_templates';

// Helper Functions
const generateId = (): string => {
  return `mission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const generateMissionNumber = (): string => {
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString().slice(-6);
  return `MSN-${year}-${timestamp}`;
};

// Debounce utility
const debounce = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

// Safe localStorage operations
const safeLocalStorageOperation = <T extends unknown>(
  operation: () => T,
  fallback: T,
  errorMessage: string
): T => {
  try {
    return operation();
  } catch (error) {
    console.error(errorMessage, error);
    return fallback;
  }
};

// Status Transition Validation Rules
const STATUS_TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  'Planning': ['Approved'],
  'Approved': ['Planning', 'Flying'], // Can go back to planning for changes
  'Flying': ['Approved', 'Completed'], // Can go back to approved if mission aborted
  'Completed': ['Flying', 'Locked'], // Can go back to flying for additional work
  'Locked': [], // Terminal state - no transitions allowed
};

// Role-based permissions
const getValidActionsForRole = (userRole: string): string[] => {
  switch (userRole) {
    case 'admin':
      return ['create', 'update', 'delete', 'approve', 'reject', 'transition'];
    case 'contractor': // CRP role
      return ['create', 'update', 'approve', 'reject', 'transition'];
    case 'client':
      return ['view']; // Clients can only view their missions
    default:
      return [];
  }
};

// Validation Functions
const validateMissionData = (
  mission: Partial<MissionRecord>,
  aircraftContext?: {
    getAircraftById: (id: string) => any;
    getEquipmentKitById: (id: string) => any;
    getConfigurationById: (id: string) => any;
    validateConfiguration: (aircraftId: string, kitId: string) => boolean;
  }
): MissionValidationError[] => {
  const errors: MissionValidationError[] = [];

  if (!mission.missionName?.trim()) {
    errors.push({
      field: 'missionName',
      message: 'Mission name is required',
      severity: 'error',
      code: 'REQUIRED_FIELD'
    });
  }

  if (!mission.clientId?.trim()) {
    errors.push({
      field: 'clientId',
      message: 'Client selection is required',
      severity: 'error',
      code: 'REQUIRED_FIELD'
    });
  }

  if (!mission.scheduledDate) {
    errors.push({
      field: 'scheduledDate',
      message: 'Scheduled date is required',
      severity: 'error',
      code: 'REQUIRED_FIELD'
    });
  } else if (new Date(mission.scheduledDate) < new Date()) {
    errors.push({
      field: 'scheduledDate',
      message: 'Scheduled date cannot be in the past',
      severity: 'warning',
      code: 'PAST_DATE'
    });
  }

  // Enhanced aircraft validation with Aircraft Context integration
  if (!mission.aircraftConfiguration?.aircraftId) {
    errors.push({
      field: 'aircraftConfiguration.aircraftId',
      message: 'Aircraft selection is required',
      severity: 'error',
      code: 'REQUIRED_FIELD'
    });
  } else if (aircraftContext) {
    // Validate aircraft exists and is available
    const aircraft = aircraftContext.getAircraftById(mission.aircraftConfiguration.aircraftId);
    if (!aircraft) {
      errors.push({
        field: 'aircraftConfiguration.aircraftId',
        message: 'Selected aircraft does not exist',
        severity: 'error',
        code: 'INVALID_AIRCRAFT'
      });
    } else if (aircraft.status !== 'operational') {
      errors.push({
        field: 'aircraftConfiguration.aircraftId',
        message: `Aircraft is not operational (current status: ${aircraft.status})`,
        severity: 'error',
        code: 'AIRCRAFT_UNAVAILABLE'
      });
    }
  }

  if (!mission.aircraftConfiguration?.configurationId) {
    errors.push({
      field: 'aircraftConfiguration.configurationId',
      message: 'Equipment configuration is required',
      severity: 'error',
      code: 'REQUIRED_FIELD'
    });
  } else if (aircraftContext && mission.aircraftConfiguration?.aircraftId) {
    // Validate configuration exists and is compatible
    const configuration = aircraftContext.getConfigurationById(mission.aircraftConfiguration.configurationId);
    if (!configuration) {
      errors.push({
        field: 'aircraftConfiguration.configurationId',
        message: 'Selected configuration does not exist',
        severity: 'error',
        code: 'INVALID_CONFIGURATION'
      });
    } else {
      // Check if configuration matches aircraft and equipment kit compatibility
      const aircraft = aircraftContext.getAircraftById(mission.aircraftConfiguration.aircraftId);
      const kit = aircraftContext.getEquipmentKitById(configuration.kitId);

      if (configuration.aircraftId !== mission.aircraftConfiguration.aircraftId) {
        errors.push({
          field: 'aircraftConfiguration.configurationId',
          message: 'Configuration does not match selected aircraft',
          severity: 'error',
          code: 'CONFIGURATION_MISMATCH'
        });
      }

      if (kit && kit.operationalData.status !== 'available') {
        errors.push({
          field: 'aircraftConfiguration.configurationId',
          message: `Equipment kit is not available (current status: ${kit.operationalData.status})`,
          severity: 'error',
          code: 'KIT_UNAVAILABLE'
        });
      }

      // Validate aircraft-kit compatibility
      if (aircraft && kit && !aircraftContext.validateConfiguration(aircraft.id, kit.id)) {
        errors.push({
          field: 'aircraftConfiguration.configurationId',
          message: 'Selected aircraft and equipment kit are not compatible',
          severity: 'error',
          code: 'INCOMPATIBLE_CONFIGURATION'
        });
      }
    }
  }

  return errors;
};

const validateStatusTransitionRules = (
  fromStatus: MissionStatus,
  toStatus: MissionStatus,
  mission: MissionRecord,
  aircraftContext?: {
    getAircraftById: (id: string) => any;
    getEquipmentKitById: (id: string) => any;
    getConfigurationById: (id: string) => any;
    validateConfiguration: (aircraftId: string, kitId: string) => boolean;
  }
): MissionValidationError[] => {
  const errors: MissionValidationError[] = [];
  const validTransitions = STATUS_TRANSITIONS[fromStatus] || [];

  if (!validTransitions.includes(toStatus)) {
    errors.push({
      field: 'status',
      message: `Invalid transition from ${fromStatus} to ${toStatus}`,
      severity: 'error',
      code: 'INVALID_TRANSITION'
    });
    return errors;
  }

  // Business rule validations for specific transitions
  switch (toStatus) {
    case 'Approved':
      if (mission.jsaRecord.status !== 'approved') {
        errors.push({
          field: 'jsaRecord.status',
          message: 'JSA must be completed and approved before mission approval',
          severity: 'error',
          code: 'JSA_NOT_APPROVED'
        });
      }

      if (mission.boundaryFiles.length === 0) {
        errors.push({
          field: 'boundaryFiles',
          message: 'At least one boundary file must be uploaded',
          severity: 'error',
          code: 'NO_BOUNDARY_FILES'
        });
      }

      // Enhanced aircraft configuration validation using Aircraft Context
      if (!mission.aircraftConfiguration.aircraftId || !mission.aircraftConfiguration.configurationId) {
        errors.push({
          field: 'aircraftConfiguration',
          message: 'Aircraft and equipment configuration must be selected',
          severity: 'error',
          code: 'INCOMPLETE_CONFIGURATION'
        });
      } else if (aircraftContext) {
        // Validate aircraft availability and operational status
        const aircraft = aircraftContext.getAircraftById(mission.aircraftConfiguration.aircraftId);
        const configuration = aircraftContext.getConfigurationById(mission.aircraftConfiguration.configurationId);

        if (!aircraft) {
          errors.push({
            field: 'aircraftConfiguration.aircraftId',
            message: 'Selected aircraft does not exist',
            severity: 'error',
            code: 'INVALID_AIRCRAFT'
          });
        } else {
          // Check aircraft operational status
          if (aircraft.status !== 'operational') {
            errors.push({
              field: 'aircraftConfiguration.aircraftId',
              message: `Aircraft must be operational for mission approval (current status: ${aircraft.status})`,
              severity: 'error',
              code: 'AIRCRAFT_NOT_OPERATIONAL'
            });
          }

          // Check maintenance currency
          const now = new Date();
          const nextInspection = new Date(aircraft.maintenanceDates.nextInspectionDue);
          const nextMajorService = new Date(aircraft.maintenanceDates.nextMajorServiceDue);
          const missionDate = new Date(mission.scheduledDate);

          if (missionDate >= nextInspection) {
            errors.push({
              field: 'aircraftConfiguration.aircraftId',
              message: 'Aircraft inspection is due before mission date',
              severity: 'error',
              code: 'INSPECTION_DUE'
            });
          }

          if (missionDate >= nextMajorService) {
            errors.push({
              field: 'aircraftConfiguration.aircraftId',
              message: 'Aircraft major service is due before mission date',
              severity: 'error',
              code: 'MAJOR_SERVICE_DUE'
            });
          }

          // Check insurance validity
          const insuranceExpiry = new Date(aircraft.insurance.expiryDate);
          if (missionDate >= insuranceExpiry) {
            errors.push({
              field: 'aircraftConfiguration.aircraftId',
              message: 'Aircraft insurance expires before mission date',
              severity: 'error',
              code: 'INSURANCE_EXPIRED'
            });
          }
        }

        if (!configuration) {
          errors.push({
            field: 'aircraftConfiguration.configurationId',
            message: 'Selected configuration does not exist',
            severity: 'error',
            code: 'INVALID_CONFIGURATION'
          });
        } else {
          // Validate configuration safety (weight and balance within limits)
          if (!configuration.weightAndBalance.withinLimits) {
            errors.push({
              field: 'aircraftConfiguration.configurationId',
              message: 'Aircraft-kit configuration weight and balance is not within safe limits',
              severity: 'error',
              code: 'CONFIGURATION_UNSAFE'
            });
          }

          // Validate equipment kit availability
          const kit = aircraftContext.getEquipmentKitById(configuration.kitId);
          if (kit && kit.operationalData.status !== 'available') {
            errors.push({
              field: 'aircraftConfiguration.configurationId',
              message: `Equipment kit is not available (status: ${kit.operationalData.status})`,
              severity: 'error',
              code: 'KIT_UNAVAILABLE'
            });
          }

          // Check compatibility one more time
          if (aircraft && kit && !aircraftContext.validateConfiguration(aircraft.id, kit.id)) {
            errors.push({
              field: 'aircraftConfiguration',
              message: 'Aircraft and equipment kit configuration is not valid',
              severity: 'error',
              code: 'INVALID_AIRCRAFT_KIT_COMBINATION'
            });
          }
        }
      }

      if (!mission.complianceChecks.casaNotification) {
        errors.push({
          field: 'complianceChecks.casaNotification',
          message: 'CASA notification is required',
          severity: 'error',
          code: 'COMPLIANCE_CHECK_FAILED'
        });
      }

      if (!mission.complianceChecks.insuranceCoverage) {
        errors.push({
          field: 'complianceChecks.insuranceCoverage',
          message: 'Insurance coverage verification is required',
          severity: 'error',
          code: 'COMPLIANCE_CHECK_FAILED'
        });
      }
      break;

    case 'Flying':
      if (!mission.flightPlan) {
        errors.push({
          field: 'flightPlan',
          message: 'Flight plan must be created before starting flight',
          severity: 'error',
          code: 'NO_FLIGHT_PLAN'
        });
      }

      if (!mission.approvals.flyingAuthorization) {
        errors.push({
          field: 'approvals.flyingAuthorization',
          message: 'CRP authorization required before starting flight',
          severity: 'error',
          code: 'NO_FLYING_AUTHORIZATION'
        });
      }
      break;

    case 'Completed':
      if (!mission.flightExecution) {
        errors.push({
          field: 'flightExecution',
          message: 'Flight execution data must be recorded',
          severity: 'error',
          code: 'NO_FLIGHT_EXECUTION'
        });
      }
      break;

    case 'Locked':
      if (!mission.flightExecution) {
        errors.push({
          field: 'flightExecution',
          message: 'Flight execution data is required for final lock',
          severity: 'error',
          code: 'NO_FLIGHT_EXECUTION'
        });
      }

      if (!mission.financialActual) {
        errors.push({
          field: 'financialActual',
          message: 'Actual financial data must be recorded',
          severity: 'error',
          code: 'NO_ACTUAL_FINANCIALS'
        });
      }

      if (!mission.approvals.finalApproval) {
        errors.push({
          field: 'approvals.finalApproval',
          message: 'CRP final approval required for locking mission',
          severity: 'error',
          code: 'NO_FINAL_APPROVAL'
        });
      }
      break;
  }

  return errors;
};

// Mission Provider Component
export function MissionProvider({ children }: { children: React.ReactNode }) {
  const [missions, setMissions] = useState<MissionRecord[]>([]);
  const [missionTemplates, setMissionTemplates] = useState<MissionTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statistics, setStatistics] = useState<MissionStatistics | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { user } = useAuth();
  const {
    getAircraftById,
    getEquipmentKitById,
    getConfigurationById,
    validateConfiguration,
    getAvailableAircraft,
    getAircraftConfigurations
  } = useAircraft();

  // Enhanced error handling
  const safeOperation = useCallback(<T,>(operation: () => T, errorMessage: string): T | null => {
    try {
      setError(null);
      return operation();
    } catch (error) {
      const message = `${errorMessage}: ${error instanceof Error ? error.message : String(error)}`;
      setError(message);
      console.error(message, error);
      return null;
    }
  }, []);

  // Create audit entry
  const createAuditEntry = useCallback((
    missionId: string,
    action: MissionAuditEntry['action'],
    changes: MissionAuditEntry['changes'],
    statusTransition?: MissionAuditEntry['statusTransition'],
    comments?: string
  ): MissionAuditEntry => {
    return {
      id: generateId(),
      missionId,
      timestamp: new Date().toISOString(),
      userId: user?.id || 'system',
      action,
      changes,
      statusTransition,
      comments,
    };
  }, [user?.id]);

  // Load data from localStorage
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const missionsData = safeOperation(() => {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    }, 'Failed to load mission data from localStorage');

    const templatesData = safeOperation(() => {
      const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    }, 'Failed to load template data from localStorage');

    if (missionsData) {
      setMissions(missionsData);
    }

    if (templatesData) {
      setMissionTemplates(templatesData);
    }

    setIsLoading(false);
  }, [safeOperation]);

  // Save data to localStorage
  const saveData = useCallback(async () => {
    safeOperation(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(missions));
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(missionTemplates));
      return true;
    }, 'Failed to save mission data to localStorage');
  }, [missions, missionTemplates, safeOperation]);

  // Debounced save function
  const debouncedSave = useCallback(
    debounce(() => {
      saveData();
    }, 1000),
    [saveData]
  );

  // Clear all data
  const clearData = useCallback(async () => {
    setMissions([]);
    setMissionTemplates([]);
    setStatistics(null);
    safeOperation(
      () => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TEMPLATES_STORAGE_KEY);
        return true;
      },
      'Failed to clear mission data from localStorage'
    );
  }, [safeOperation]);

  // Mission CRUD Operations
  const createMission = useCallback(async (missionData: Omit<MissionRecord, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'lastModifiedBy' | 'auditTrail' | 'approvals'>): Promise<string> => {
    if (!user) {
      throw new Error('User must be authenticated to create missions');
    }

    return safeOperation(() => {
      // Validate mission data
      const validationErrors = validateMissionData(missionData, {
        getAircraftById,
        getEquipmentKitById,
        getConfigurationById,
        validateConfiguration
      });
      const criticalErrors = validationErrors.filter(error => error.severity === 'error');

      if (criticalErrors.length > 0) {
        throw new Error(`Validation failed: ${criticalErrors.map(e => e.message).join(', ')}`);
      }

      const id = generateId();
      const now = new Date().toISOString();
      const missionNumber = generateMissionNumber();

      // Initialize empty approvals
      const approvals: MissionApprovals = {
        missionId: id,
        createdAt: now,
        updatedAt: now,
      };

      // Create initial audit entry
      const initialAuditEntry = createAuditEntry(
        id,
        'created',
        [
          { field: 'mission', oldValue: null, newValue: 'created' },
        ]
      );

      const newMission: MissionRecord = {
        ...missionData,
        id,
        missionNumber,
        status: 'Planning',
        approvals,
        auditTrail: [initialAuditEntry],
        createdAt: now,
        updatedAt: now,
        createdBy: user.id,
        lastModifiedBy: user.id,
      };

      setMissions(prev => [...prev, newMission]);
      return id;
    }, 'Failed to create mission') || '';
  }, [safeOperation, user, createAuditEntry]);

  const updateMission = useCallback(async (id: string, updates: Partial<Omit<MissionRecord, 'id' | 'createdAt' | 'createdBy' | 'auditTrail'>>) => {
    if (!user) {
      throw new Error('User must be authenticated to update missions');
    }

    safeOperation(() => {
      if (!id) {
        throw new Error('Mission ID is required');
      }

      setMissions(prev => {
        const missionIndex = prev.findIndex(mission => mission.id === id);
        if (missionIndex === -1) {
          throw new Error(`Mission with ID ${id} not found`);
        }

        const currentMission = prev[missionIndex];

        // Check if mission is locked
        if (currentMission.status === 'Locked') {
          throw new Error('Cannot modify locked missions');
        }

        // Create audit entries for changes
        const changes = Object.entries(updates).map(([field, newValue]) => ({
          field,
          oldValue: (currentMission as any)[field],
          newValue,
        }));

        const auditEntry = createAuditEntry(id, 'updated', changes);

        const updatedMission = {
          ...currentMission,
          ...updates,
          updatedAt: new Date().toISOString(),
          lastModifiedBy: user.id,
          auditTrail: [...currentMission.auditTrail, auditEntry],
        };

        const newMissions = [...prev];
        newMissions[missionIndex] = updatedMission;
        return newMissions;
      });
    }, 'Failed to update mission');
  }, [safeOperation, user, createAuditEntry]);

  const deleteMission = useCallback(async (id: string) => {
    if (!user) {
      throw new Error('User must be authenticated to delete missions');
    }

    safeOperation(() => {
      if (!id) {
        throw new Error('Mission ID is required');
      }

      setMissions(prev => {
        const mission = prev.find(m => m.id === id);
        if (!mission) {
          throw new Error(`Mission with ID ${id} not found`);
        }

        // Check if mission can be deleted
        if (mission.status === 'Flying') {
          throw new Error('Cannot delete missions that are currently flying');
        }

        if (mission.status === 'Locked') {
          throw new Error('Cannot delete locked missions');
        }

        return prev.filter(mission => mission.id !== id);
      });
    }, 'Failed to delete mission');
  }, [safeOperation, user]);

  const getMissionById = useCallback((id: string): MissionRecord | undefined => {
    return missions.find(m => m.id === id);
  }, [missions]);

  // Status Workflow Management
  const getValidNextStatuses = useCallback((currentStatus: MissionStatus): MissionStatus[] => {
    return STATUS_TRANSITIONS[currentStatus] || [];
  }, []);

  const validateStatusTransition = useCallback((
    fromStatus: MissionStatus,
    toStatus: MissionStatus,
    mission: MissionRecord
  ): MissionValidationError[] => {
    return validateStatusTransitionRules(fromStatus, toStatus, mission, {
      getAircraftById,
      getEquipmentKitById,
      getConfigurationById,
      validateConfiguration
    });
  }, [getAircraftById, getEquipmentKitById, getConfigurationById, validateConfiguration]);

  const transitionMissionStatus = useCallback(async (id: string, toStatus: MissionStatus, comments?: string) => {
    if (!user) {
      throw new Error('User must be authenticated to transition mission status');
    }

    safeOperation(() => {
      const mission = missions.find(m => m.id === id);
      if (!mission) {
        throw new Error(`Mission with ID ${id} not found`);
      }

      const validationErrors = validateStatusTransitionRules(mission.status, toStatus, mission, {
        getAircraftById,
        getEquipmentKitById,
        getConfigurationById,
        validateConfiguration
      });
      const criticalErrors = validationErrors.filter(error => error.severity === 'error');

      if (criticalErrors.length > 0) {
        throw new Error(`Status transition validation failed: ${criticalErrors.map(e => e.message).join(', ')}`);
      }

      // Check role permissions for certain transitions
      if ((toStatus === 'Approved' || toStatus === 'Locked') && user.role !== 'contractor' && user.role !== 'admin') {
        throw new Error('Only CRP (Chief Remote Pilot) can approve missions');
      }

      const auditEntry = createAuditEntry(
        id,
        'status-changed',
        [{ field: 'status', oldValue: mission.status, newValue: toStatus }],
        {
          fromStatus: mission.status,
          toStatus,
          reason: comments,
          approvalRequired: toStatus === 'Approved' || toStatus === 'Locked',
          validationPassed: criticalErrors.length === 0,
        },
        comments
      );

      setMissions(prev =>
        prev.map(m =>
          m.id === id
            ? {
                ...m,
                status: toStatus,
                updatedAt: new Date().toISOString(),
                lastModifiedBy: user.id,
                auditTrail: [...m.auditTrail, auditEntry],
              }
            : m
        )
      );
    }, 'Failed to transition mission status');
  }, [missions, user, safeOperation, createAuditEntry]);

  // Approval Management
  const approveMission = useCallback(async (
    id: string,
    approvalType: 'planning' | 'flying' | 'completion' | 'final',
    digitalSignature: string,
    comments?: string
  ) => {
    if (!user) {
      throw new Error('User must be authenticated to approve missions');
    }

    safeOperation(() => {
      if (user.role !== 'contractor' && user.role !== 'admin') {
        throw new Error('Only CRP (Chief Remote Pilot) can approve missions');
      }

      const mission = missions.find(m => m.id === id);
      if (!mission) {
        throw new Error(`Mission with ID ${id} not found`);
      }

      const now = new Date().toISOString();
      const approvals = { ...mission.approvals };

      switch (approvalType) {
        case 'planning':
          approvals.planningApproval = {
            approvedBy: user.id,
            approvedAt: now,
            digitalSignature,
            comments,
          };
          break;
        case 'flying':
          approvals.flyingAuthorization = {
            authorizedBy: user.id,
            authorizedAt: now,
            digitalSignature,
            preFlightChecklistCompleted: true,
            weatherConditionsAcceptable: true,
            crpAvailable: true,
            comments,
          };
          break;
        case 'completion':
          approvals.completionApproval = {
            approvedBy: user.id,
            approvedAt: now,
            digitalSignature,
            postFlightChecklistCompleted: true,
            allDataCaptured: true,
            clientNotified: true,
            comments,
          };
          break;
        case 'final':
          approvals.finalApproval = {
            approvedBy: user.id,
            approvedAt: now,
            digitalSignature,
            invoiceGenerated: true,
            dataDelivered: true,
            clientSatisfied: true,
            noOutstandingIssues: true,
            archivalComplete: true,
            comments,
          };
          break;
      }

      approvals.updatedAt = now;

      const auditEntry = createAuditEntry(
        id,
        'approved',
        [{ field: `approvals.${approvalType}`, oldValue: null, newValue: 'approved' }],
        undefined,
        comments
      );

      setMissions(prev =>
        prev.map(m =>
          m.id === id
            ? {
                ...m,
                approvals,
                updatedAt: now,
                lastModifiedBy: user.id,
                auditTrail: [...m.auditTrail, auditEntry],
              }
            : m
        )
      );
    }, 'Failed to approve mission');
  }, [missions, user, safeOperation, createAuditEntry]);

  const rejectMission = useCallback(async (
    id: string,
    approvalType: 'planning' | 'flying' | 'completion' | 'final',
    reason: string
  ) => {
    if (!user) {
      throw new Error('User must be authenticated to reject missions');
    }

    safeOperation(() => {
      if (user.role !== 'contractor' && user.role !== 'admin') {
        throw new Error('Only CRP (Chief Remote Pilot) can reject missions');
      }

      const mission = missions.find(m => m.id === id);
      if (!mission) {
        throw new Error(`Mission with ID ${id} not found`);
      }

      const auditEntry = createAuditEntry(
        id,
        'rejected',
        [{ field: `approvals.${approvalType}`, oldValue: null, newValue: 'rejected' }],
        undefined,
        reason
      );

      setMissions(prev =>
        prev.map(m =>
          m.id === id
            ? {
                ...m,
                updatedAt: new Date().toISOString(),
                lastModifiedBy: user.id,
                auditTrail: [...m.auditTrail, auditEntry],
              }
            : m
        )
      );
    }, 'Failed to reject mission');
  }, [missions, user, safeOperation, createAuditEntry]);

  const checkApprovalRequirements = useCallback((
    mission: MissionRecord,
    approvalType: 'planning' | 'flying' | 'completion' | 'final'
  ): MissionValidationError[] => {
    const errors: MissionValidationError[] = [];

    switch (approvalType) {
      case 'planning':
        if (mission.jsaRecord.status !== 'approved') {
          errors.push({
            field: 'jsaRecord.status',
            message: 'JSA must be approved before mission can be approved',
            severity: 'error',
            code: 'JSA_NOT_APPROVED'
          });
        }
        break;
      case 'flying':
        if (!mission.approvals.planningApproval) {
          errors.push({
            field: 'approvals.planningApproval',
            message: 'Mission must be approved before flying authorization',
            severity: 'error',
            code: 'PLANNING_NOT_APPROVED'
          });
        }
        break;
      case 'completion':
        if (!mission.flightExecution) {
          errors.push({
            field: 'flightExecution',
            message: 'Flight execution data required for completion approval',
            severity: 'error',
            code: 'NO_FLIGHT_EXECUTION'
          });
        }
        break;
      case 'final':
        if (!mission.approvals.completionApproval) {
          errors.push({
            field: 'approvals.completionApproval',
            message: 'Mission must be completed before final approval',
            severity: 'error',
            code: 'COMPLETION_NOT_APPROVED'
          });
        }
        break;
    }

    return errors;
  }, []);

  // Component Management Functions
  const updateJSARecord = useCallback(async (missionId: string, jsa: JSARecord) => {
    if (!user) {
      throw new Error('User must be authenticated to update JSA records');
    }

    safeOperation(() => {
      setMissions(prev =>
        prev.map(m =>
          m.id === missionId
            ? {
                ...m,
                jsaRecord: jsa,
                updatedAt: new Date().toISOString(),
                lastModifiedBy: user.id,
                auditTrail: [
                  ...m.auditTrail,
                  createAuditEntry(missionId, 'updated', [
                    { field: 'jsaRecord', oldValue: m.jsaRecord, newValue: jsa }
                  ])
                ],
              }
            : m
        )
      );
    }, 'Failed to update JSA record');
  }, [user, safeOperation, createAuditEntry]);

  const addBoundaryFile = useCallback(async (missionId: string, boundaryFile: BoundaryFile) => {
    if (!user) {
      throw new Error('User must be authenticated to add boundary files');
    }

    safeOperation(() => {
      setMissions(prev =>
        prev.map(m =>
          m.id === missionId
            ? {
                ...m,
                boundaryFiles: [...m.boundaryFiles, boundaryFile],
                updatedAt: new Date().toISOString(),
                lastModifiedBy: user.id,
                auditTrail: [
                  ...m.auditTrail,
                  createAuditEntry(missionId, 'updated', [
                    { field: 'boundaryFiles', oldValue: m.boundaryFiles.length, newValue: m.boundaryFiles.length + 1 }
                  ])
                ],
              }
            : m
        )
      );
    }, 'Failed to add boundary file');
  }, [user, safeOperation, createAuditEntry]);

  const removeBoundaryFile = useCallback(async (missionId: string, boundaryFileId: string) => {
    if (!user) {
      throw new Error('User must be authenticated to remove boundary files');
    }

    safeOperation(() => {
      setMissions(prev =>
        prev.map(m =>
          m.id === missionId
            ? {
                ...m,
                boundaryFiles: m.boundaryFiles.filter(f => f.id !== boundaryFileId),
                updatedAt: new Date().toISOString(),
                lastModifiedBy: user.id,
                auditTrail: [
                  ...m.auditTrail,
                  createAuditEntry(missionId, 'updated', [
                    { field: 'boundaryFiles', oldValue: m.boundaryFiles.length, newValue: m.boundaryFiles.length - 1 }
                  ])
                ],
              }
            : m
        )
      );
    }, 'Failed to remove boundary file');
  }, [user, safeOperation, createAuditEntry]);

  const updateFlightPlan = useCallback(async (missionId: string, flightPlan: FlightPlan) => {
    if (!user) {
      throw new Error('User must be authenticated to update flight plans');
    }

    safeOperation(() => {
      setMissions(prev =>
        prev.map(m =>
          m.id === missionId
            ? {
                ...m,
                flightPlan,
                updatedAt: new Date().toISOString(),
                lastModifiedBy: user.id,
                auditTrail: [
                  ...m.auditTrail,
                  createAuditEntry(missionId, 'updated', [
                    { field: 'flightPlan', oldValue: m.flightPlan, newValue: flightPlan }
                  ])
                ],
              }
            : m
        )
      );
    }, 'Failed to update flight plan');
  }, [user, safeOperation, createAuditEntry]);

  const updateFlightExecution = useCallback(async (missionId: string, flightExecution: FlightExecution) => {
    if (!user) {
      throw new Error('User must be authenticated to update flight execution');
    }

    safeOperation(() => {
      setMissions(prev =>
        prev.map(m =>
          m.id === missionId
            ? {
                ...m,
                flightExecution,
                updatedAt: new Date().toISOString(),
                lastModifiedBy: user.id,
                auditTrail: [
                  ...m.auditTrail,
                  createAuditEntry(missionId, 'updated', [
                    { field: 'flightExecution', oldValue: m.flightExecution, newValue: flightExecution }
                  ])
                ],
              }
            : m
        )
      );
    }, 'Failed to update flight execution');
  }, [user, safeOperation, createAuditEntry]);

  // Search and Filtering Functions
  const searchMissions = useCallback((criteria: MissionSearchCriteria): MissionRecord[] => {
    let filteredMissions = [...missions];

    // Text search
    if (criteria.searchTerm) {
      const term = criteria.searchTerm.toLowerCase();
      filteredMissions = filteredMissions.filter(mission =>
        mission.missionName.toLowerCase().includes(term) ||
        mission.missionNumber.toLowerCase().includes(term) ||
        mission.description.toLowerCase().includes(term) ||
        mission.location.name.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (criteria.statuses && criteria.statuses.length > 0) {
      filteredMissions = filteredMissions.filter(mission =>
        criteria.statuses!.includes(mission.status)
      );
    }

    // Date range filter
    if (criteria.dateRange) {
      const startDate = new Date(criteria.dateRange.startDate);
      const endDate = new Date(criteria.dateRange.endDate);
      filteredMissions = filteredMissions.filter(mission => {
        const missionDate = new Date(mission.scheduledDate);
        return missionDate >= startDate && missionDate <= endDate;
      });
    }

    // Mission type filter
    if (criteria.missionTypes && criteria.missionTypes.length > 0) {
      filteredMissions = filteredMissions.filter(mission =>
        criteria.missionTypes!.includes(mission.missionType)
      );
    }

    // Priority filter
    if (criteria.priorities && criteria.priorities.length > 0) {
      filteredMissions = filteredMissions.filter(mission =>
        criteria.priorities!.includes(mission.priority)
      );
    }

    // Client filter
    if (criteria.clientIds && criteria.clientIds.length > 0) {
      filteredMissions = filteredMissions.filter(mission =>
        criteria.clientIds!.includes(mission.clientId)
      );
    }

    // Aircraft filter
    if (criteria.aircraftIds && criteria.aircraftIds.length > 0) {
      filteredMissions = filteredMissions.filter(mission =>
        criteria.aircraftIds!.includes(mission.aircraftConfiguration.aircraftId)
      );
    }

    // Cost range filter
    if (criteria.costRange) {
      filteredMissions = filteredMissions.filter(mission =>
        mission.financialEstimate.totalEstimatedCost >= criteria.costRange!.minimum &&
        mission.financialEstimate.totalEstimatedCost <= criteria.costRange!.maximum
      );
    }

    // Sorting
    if (criteria.sortBy) {
      filteredMissions.sort((a, b) => {
        let aValue: any, bValue: any;

        switch (criteria.sortBy) {
          case 'scheduledDate':
            aValue = new Date(a.scheduledDate);
            bValue = new Date(b.scheduledDate);
            break;
          case 'createdDate':
            aValue = new Date(a.createdAt);
            bValue = new Date(b.createdAt);
            break;
          case 'missionNumber':
            aValue = a.missionNumber;
            bValue = b.missionNumber;
            break;
          case 'priority':
            const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
            aValue = priorityOrder[a.priority];
            bValue = priorityOrder[b.priority];
            break;
          case 'status':
            aValue = a.status;
            bValue = b.status;
            break;
          case 'estimatedCost':
            aValue = a.financialEstimate.totalEstimatedCost;
            bValue = b.financialEstimate.totalEstimatedCost;
            break;
          default:
            aValue = criteria.sortBy ? a[criteria.sortBy as keyof MissionRecord] : '';
            bValue = criteria.sortBy ? b[criteria.sortBy as keyof MissionRecord] : '';
        }

        if (criteria.sortOrder === 'desc') {
          return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
        } else {
          return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        }
      });
    }

    // Pagination
    if (criteria.page && criteria.limit) {
      const startIndex = (criteria.page - 1) * criteria.limit;
      const endIndex = startIndex + criteria.limit;
      filteredMissions = filteredMissions.slice(startIndex, endIndex);
    }

    return filteredMissions;
  }, [missions]);

  const getMissionsByStatus = useCallback((status: MissionStatus): MissionRecord[] => {
    return missions.filter(mission => mission.status === status);
  }, [missions]);

  const getMissionsByType = useCallback((type: MissionType): MissionRecord[] => {
    return missions.filter(mission => mission.missionType === type);
  }, [missions]);

  const getMissionsByPriority = useCallback((priority: MissionPriority): MissionRecord[] => {
    return missions.filter(mission => mission.priority === priority);
  }, [missions]);

  const getMissionsByDateRange = useCallback((startDate: string, endDate: string): MissionRecord[] => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return missions.filter(mission => {
      const missionDate = new Date(mission.scheduledDate);
      return missionDate >= start && missionDate <= end;
    });
  }, [missions]);

  const getUpcomingMissions = useCallback((days: number = 7): MissionRecord[] => {
    const now = new Date();
    const future = new Date();
    future.setDate(now.getDate() + days);

    return missions.filter(mission => {
      const missionDate = new Date(mission.scheduledDate);
      return missionDate >= now && missionDate <= future;
    });
  }, [missions]);

  const getOverdueMissions = useCallback((): MissionRecord[] => {
    const now = new Date();
    return missions.filter(mission => {
      const missionDate = new Date(mission.scheduledDate);
      return missionDate < now && mission.status !== 'Completed' && mission.status !== 'Locked';
    });
  }, [missions]);

  // Statistics Calculation
  const calculateStatistics = useCallback((): MissionStatistics => {
    const missionsByStatus = missions.reduce((acc, mission) => {
      acc[mission.status] = (acc[mission.status] || 0) + 1;
      return acc;
    }, {} as Record<MissionStatus, number>);

    const missionsByType = missions.reduce((acc, mission) => {
      acc[mission.missionType] = (acc[mission.missionType] || 0) + 1;
      return acc;
    }, {} as Record<MissionType, number>);

    const missionsByPriority = missions.reduce((acc, mission) => {
      acc[mission.priority] = (acc[mission.priority] || 0) + 1;
      return acc;
    }, {} as Record<MissionPriority, number>);

    const totalEstimatedRevenue = missions.reduce((sum, mission) =>
      sum + mission.financialEstimate.totalEstimatedCost, 0
    );

    const completedMissions = missions.filter(m => m.financialActual);
    const totalActualRevenue = completedMissions.reduce((sum, mission) =>
      sum + (mission.financialActual?.totalActualCost || 0), 0
    );

    const totalFlightHours = completedMissions.reduce((sum, mission) =>
      sum + (mission.flightExecution?.actualFlightData.totalFlightTime || 0), 0
    ) / 60; // Convert minutes to hours

    const totalAreaCovered = completedMissions.reduce((sum, mission) =>
      sum + (mission.flightExecution?.results.areaCompleted || 0), 0
    );

    const successfulMissions = missions.filter(m =>
      m.flightExecution?.results.missionStatus === 'successful'
    ).length;

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

    const statistics: MissionStatistics = {
      totalMissions: missions.length,
      missionsByStatus,
      missionsByType,
      missionsByPriority,
      totalEstimatedRevenue,
      totalActualRevenue,
      averageMissionValue: missions.length > 0 ? totalEstimatedRevenue / missions.length : 0,
      profitMargin: totalActualRevenue > 0 ? ((totalActualRevenue - totalEstimatedRevenue) / totalActualRevenue) * 100 : 0,
      totalFlightHours,
      totalAreaCovered,
      averageFlightTime: completedMissions.length > 0 ? totalFlightHours / completedMissions.length : 0,
      successRate: missions.length > 0 ? (successfulMissions / missions.length) * 100 : 0,
      missionsThisWeek: missions.filter(m => new Date(m.createdAt) >= startOfWeek).length,
      missionsThisMonth: missions.filter(m => new Date(m.createdAt) >= startOfMonth).length,
      missionsThisQuarter: missions.filter(m => new Date(m.createdAt) >= startOfQuarter).length,
      upcomingMissions: getUpcomingMissions(7).length,
      overdueMissions: getOverdueMissions().length,
      onTimeCompletionRate: 0, // Would need more complex calculation
      averageSetupTime: 0, // Would need flight execution data analysis
      equipmentUtilizationRate: 0, // Would need aircraft usage analysis
    };

    setStatistics(statistics);
    return statistics;
  }, [missions, getUpcomingMissions, getOverdueMissions]);

  const getMissionsForUser = useCallback((userId: string): MissionRecord[] => {
    return missions.filter(mission =>
      mission.createdBy === userId ||
      mission.lastModifiedBy === userId ||
      mission.auditTrail.some(entry => entry.userId === userId)
    );
  }, [missions]);

  const getMissionStatusHistory = useCallback((id: string): MissionAuditEntry[] => {
    const mission = missions.find(m => m.id === id);
    return mission ? mission.auditTrail.filter(entry => entry.action === 'status-changed') : [];
  }, [missions]);

  // Validation Functions
  const validateMission = useCallback((mission: Partial<MissionRecord>): MissionValidationError[] => {
    return validateMissionData(mission, {
      getAircraftById,
      getEquipmentKitById,
      getConfigurationById,
      validateConfiguration
    });
  }, [getAircraftById, getEquipmentKitById, getConfigurationById, validateConfiguration]);

  const validateMissionReadiness = useCallback((id: string, targetStatus: MissionStatus): MissionValidationError[] => {
    const mission = missions.find(m => m.id === id);
    if (!mission) {
      return [{ field: 'mission', message: 'Mission not found', severity: 'error', code: 'NOT_FOUND' }];
    }

    return validateStatusTransitionRules(mission.status, targetStatus, mission, {
      getAircraftById,
      getEquipmentKitById,
      getConfigurationById,
      validateConfiguration
    });
  }, [missions, getAircraftById, getEquipmentKitById, getConfigurationById, validateConfiguration]);

  // Aircraft Integration Helper Functions
  const validateAircraftAvailability = useCallback((aircraftId: string, startDate: string, endDate?: string): {
    available: boolean;
    conflicts: string[];
    recommendations: string[];
  } => {
    const aircraft = getAircraftById(aircraftId);
    const conflicts: string[] = [];
    const recommendations: string[] = [];

    if (!aircraft) {
      conflicts.push('Aircraft not found');
      return { available: false, conflicts, recommendations };
    }

    // Check operational status
    if (aircraft.status !== 'operational') {
      conflicts.push(`Aircraft is not operational (status: ${aircraft.status})`);
    }

    // Check maintenance schedule
    const missionStart = new Date(startDate);
    const nextInspection = new Date(aircraft.maintenanceDates.nextInspectionDue);
    const nextMajorService = new Date(aircraft.maintenanceDates.nextMajorServiceDue);

    if (missionStart >= nextInspection) {
      conflicts.push('Inspection due before mission date');
      recommendations.push('Schedule inspection or select another aircraft');
    }

    if (missionStart >= nextMajorService) {
      conflicts.push('Major service due before mission date');
      recommendations.push('Schedule major service or select another aircraft');
    }

    // Check insurance validity
    const insuranceExpiry = new Date(aircraft.insurance.expiryDate);
    if (missionStart >= insuranceExpiry) {
      conflicts.push('Insurance expires before mission date');
      recommendations.push('Renew insurance or select another aircraft');
    }

    // Check for conflicting missions
    const missionEnd = endDate ? new Date(endDate) : new Date(missionStart.getTime() + 24 * 60 * 60 * 1000); // Default to 24h if no end date
    const conflictingMissions = missions.filter(mission => {
      if (mission.aircraftConfiguration.aircraftId !== aircraftId) return false;
      if (['Cancelled', 'Completed', 'Locked'].includes(mission.status)) return false;

      const missionDate = new Date(mission.scheduledDate);
      return missionDate >= missionStart && missionDate <= missionEnd;
    });

    if (conflictingMissions.length > 0) {
      conflicts.push(`${conflictingMissions.length} conflicting mission(s) scheduled`);
      recommendations.push('Reschedule mission or use different aircraft');
    }

    return {
      available: conflicts.length === 0,
      conflicts,
      recommendations
    };
  }, [getAircraftById, missions]);

  const getCompatibleConfigurations = useCallback((aircraftId: string): Array<{
    configuration: any;
    kit: any;
    compatibilityScore: number;
  }> => {
    const aircraft = getAircraftById(aircraftId);
    if (!aircraft) return [];

    const configurations = getAircraftConfigurations(aircraftId);

    return configurations
      .map(config => {
        const kit = getEquipmentKitById(config.kitId);
        let compatibilityScore = 0;

        // Base compatibility
        if (kit && validateConfiguration(aircraftId, kit.id)) {
          compatibilityScore += 50;
        }

        // Equipment availability
        if (kit?.operationalData.status === 'available') {
          compatibilityScore += 20;
        }

        // Configuration validity (weight and balance within limits)
        if (config.weightAndBalance.withinLimits) {
          compatibilityScore += 20;
        }

        // Recent usage (prefer frequently used configs)
        const recentUsage = missions.filter(m =>
          m.aircraftConfiguration.configurationId === config.id &&
          m.status === 'Completed'
        ).length;
        compatibilityScore += Math.min(recentUsage * 2, 10);

        return {
          configuration: config,
          kit,
          compatibilityScore
        };
      })
      .filter(item => item.compatibilityScore > 0)
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore);
  }, [getAircraftById, getAircraftConfigurations, getEquipmentKitById, validateConfiguration, missions]);

  const calculateMissionCost = useCallback((missionData: Partial<MissionRecord>): {
    aircraftCost: number;
    equipmentCost: number;
    totalCost: number;
    breakdown: Record<string, number>;
  } => {
    const breakdown: Record<string, number> = {};
    let aircraftCost = 0;
    let equipmentCost = 0;

    if (missionData.aircraftConfiguration?.aircraftId && missionData.aircraftConfiguration?.configurationId) {
      const configuration = getConfigurationById(missionData.aircraftConfiguration.configurationId);

      if (configuration) {
        // Aircraft base cost
        aircraftCost = configuration.pricingModel.baseRate || 0;
        breakdown['Aircraft Base Rate'] = aircraftCost;

        // Equipment cost
        const kit = getEquipmentKitById(configuration.kitId);
        if (kit) {
          equipmentCost = kit.financialData.maintenanceCostPerHour || 0;
          breakdown['Equipment Maintenance Rate'] = equipmentCost;
        }

        // Area-based pricing adjustments (using performance data if available)
        const totalArea = missionData.boundaryFiles?.[0]?.analysis?.geometry?.totalArea;
        if (totalArea && configuration.performance.sprayRate?.hectaresPerHour) {
          const hoursRequired = totalArea / configuration.performance.sprayRate.hectaresPerHour;
          const areaCost = hoursRequired * aircraftCost;
          breakdown['Area Coverage Time'] = areaCost;
          aircraftCost += areaCost;
        }

        // Additional fees
        if (configuration.pricingModel.additionalFees) {
          let additionalCost = 0;
          configuration.pricingModel.additionalFees.forEach(fee => {
            additionalCost += fee.amount;
            breakdown[fee.description] = fee.amount;
          });
          equipmentCost += additionalCost;
        }
      }
    }

    return {
      aircraftCost,
      equipmentCost,
      totalCost: aircraftCost + equipmentCost,
      breakdown
    };
  }, [getConfigurationById, getEquipmentKitById]);

  // Template Management
  const createTemplate = useCallback(async (templateData: Omit<MissionTemplate, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>): Promise<string> => {
    if (!user) {
      throw new Error('User must be authenticated to create templates');
    }

    return safeOperation(() => {
      const id = generateId();
      const now = new Date().toISOString();

      const newTemplate: MissionTemplate = {
        ...templateData,
        id,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      };

      setMissionTemplates(prev => [...prev, newTemplate]);
      return id;
    }, 'Failed to create mission template') || '';
  }, [user, safeOperation]);

  const updateTemplate = useCallback(async (id: string, updates: Partial<Omit<MissionTemplate, 'id' | 'createdAt' | 'createdBy'>>) => {
    if (!user) {
      throw new Error('User must be authenticated to update templates');
    }

    safeOperation(() => {
      setMissionTemplates(prev =>
        prev.map(template =>
          template.id === id
            ? { ...template, ...updates, updatedAt: new Date().toISOString() }
            : template
        )
      );
    }, 'Failed to update mission template');
  }, [user, safeOperation]);

  const deleteTemplate = useCallback(async (id: string) => {
    if (!user) {
      throw new Error('User must be authenticated to delete templates');
    }

    safeOperation(() => {
      setMissionTemplates(prev => prev.filter(template => template.id !== id));
    }, 'Failed to delete mission template');
  }, [user, safeOperation]);

  const getTemplateById = useCallback((id: string): MissionTemplate | undefined => {
    return missionTemplates.find(t => t.id === id);
  }, [missionTemplates]);

  const createMissionFromTemplate = useCallback(async (templateId: string, overrides: Partial<MissionRecord>): Promise<string> => {
    const template = missionTemplates.find(t => t.id === templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Create mission with template defaults and overrides
    const missionData = {
      missionName: `Mission from ${template.name}`,
      missionType: template.missionType,
      priority: template.defaults.priority,
      description: template.description,
      estimatedDuration: template.defaults.estimatedDuration,
      weatherRequirements: template.defaults.weatherRequirements,
      jsaRecord: {
        id: generateId(),
        missionId: '', // Will be set after mission creation
        jsaType: template.defaults.jsaType,
        status: 'pending' as JSAStatus,
        jsaNumber: `JSA-${Date.now()}`,
        hazardIdentification: [],
        safetyRequirements: template.defaults.safetyRequirements || {
          personnelRequirements: {
            minimumCrewSize: 2,
            requiredQualifications: [],
            requiredTraining: [],
          },
          equipmentRequirements: {
            requiredSafetyEquipment: [],
            emergencyEquipment: [],
            communicationEquipment: [],
            backupSystems: [],
          },
          operationalConstraints: {
            weatherLimitations: [],
            proximityRestrictions: [],
            specialProcedures: [],
          },
        },
        emergencyProcedures: {
          communicationPlan: {
            primaryContact: '',
            secondaryContact: '',
            emergencyServices: [],
          },
          evacuationPlan: '',
          equipmentFailureProcedures: [],
          medicalEmergencyPlan: '',
        },
        signOffs: {
          pilot: {
            userId: '',
            signature: '',
            signedAt: '',
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      boundaryFiles: [],
      complianceChecks: {
        casaNotification: false,
        airspaceApproval: false,
        localPermits: false,
        environmentalClearance: false,
        insuranceCoverage: false,
      },
      financialEstimate: {
        aircraftCost: 0,
        equipmentCost: 0,
        personnelCost: 0,
        travelCost: 0,
        totalEstimatedCost: 0,
      },
      ...overrides,
    };

    return createMission(missionData as any);
  }, [missionTemplates, createMission]);

  // Data Export/Import
  const exportMissionData = useCallback((missionIds?: string[]): string => {
    const missionsToExport = missionIds
      ? missions.filter(m => missionIds.includes(m.id))
      : missions;

    const exportData = {
      missions: missionsToExport,
      templates: missionTemplates,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };

    return JSON.stringify(exportData, null, 2);
  }, [missions, missionTemplates]);

  const importMissionData = useCallback(async (data: string) => {
    if (!user) {
      throw new Error('User must be authenticated to import data');
    }

    safeOperation(() => {
      const importedData = JSON.parse(data);

      if (importedData.missions && Array.isArray(importedData.missions)) {
        setMissions(prev => [...prev, ...importedData.missions]);
      }

      if (importedData.templates && Array.isArray(importedData.templates)) {
        setMissionTemplates(prev => [...prev, ...importedData.templates]);
      }
    }, 'Failed to import mission data');
  }, [user, safeOperation]);

  // Auto-save when data changes
  useEffect(() => {
    if (missions.length > 0 || missionTemplates.length > 0) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      debouncedSave();
    }
  }, [missions, missionTemplates, debouncedSave]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate statistics when missions change
  useEffect(() => {
    calculateStatistics();
  }, [missions, calculateStatistics]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Memoized context value
  const contextValue: MissionContextType = useMemo(() => ({
    missions,
    missionTemplates,
    isLoading,
    error,
    statistics,
    createMission,
    updateMission,
    deleteMission,
    getMissionById,
    transitionMissionStatus,
    validateStatusTransition,
    getValidNextStatuses,
    approveMission,
    rejectMission,
    checkApprovalRequirements,
    updateJSARecord,
    addBoundaryFile,
    removeBoundaryFile,
    updateFlightPlan,
    updateFlightExecution,
    searchMissions,
    getMissionsByStatus,
    getMissionsByType,
    getMissionsByPriority,
    getMissionsByDateRange,
    getUpcomingMissions,
    getOverdueMissions,
    calculateStatistics,
    getMissionsForUser,
    getMissionStatusHistory,
    validateMission,
    validateMissionReadiness,
    validateAircraftAvailability,
    getCompatibleConfigurations,
    calculateMissionCost,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplateById,
    createMissionFromTemplate,
    loadData,
    saveData,
    clearData,
    exportMissionData,
    importMissionData,
  }), [
    missions,
    missionTemplates,
    isLoading,
    error,
    statistics,
    createMission,
    updateMission,
    deleteMission,
    getMissionById,
    transitionMissionStatus,
    validateStatusTransition,
    getValidNextStatuses,
    approveMission,
    rejectMission,
    checkApprovalRequirements,
    updateJSARecord,
    addBoundaryFile,
    removeBoundaryFile,
    updateFlightPlan,
    updateFlightExecution,
    searchMissions,
    getMissionsByStatus,
    getMissionsByType,
    getMissionsByPriority,
    getMissionsByDateRange,
    getUpcomingMissions,
    getOverdueMissions,
    calculateStatistics,
    getMissionsForUser,
    getMissionStatusHistory,
    validateMission,
    validateMissionReadiness,
    validateAircraftAvailability,
    getCompatibleConfigurations,
    calculateMissionCost,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplateById,
    createMissionFromTemplate,
    loadData,
    saveData,
    clearData,
    exportMissionData,
    importMissionData,
  ]);

  return (
    <MissionContext.Provider value={contextValue}>
      {children}
    </MissionContext.Provider>
  );
}

// Hook for using the context
export function useMission() {
  const context = useContext(MissionContext);
  if (!context) {
    throw new Error('useMission must be used within MissionProvider');
  }
  return context;
}