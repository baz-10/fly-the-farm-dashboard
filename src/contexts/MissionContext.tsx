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
import MissionErrorBoundary from '../components/MissionErrorBoundary';
import { clearSharedCollection, deleteSharedRecord, PERSISTENCE_KEYS, readSharedCollection, writeSharedCollection } from '../services/persistence';
import { runMissionOperation } from '../utils/missionOperation';

// Enhanced mission record with version tracking for optimistic locking
interface MissionWithVersion extends MissionRecord {
  version: number;
}

type MissionDraftInput = Omit<
  MissionRecord,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'lastModifiedBy' | 'auditTrail' | 'approvals'
>;

// Split Context Types for Better Performance
interface MissionDataContextType {
  missions: MissionRecord[];
  missionTemplates: MissionTemplate[];
  isLoading: boolean;
  error: string | null;
  statistics: MissionStatistics | null;
}

interface MissionOperationsContextType {
  createMission: (mission: MissionDraftInput) => Promise<string>;
  createAuthorizedMission: (mission: MissionDraftInput, digitalSignature: string, comments?: string, existingMissionId?: string) => Promise<string>;
  updateMission: (id: string, updates: Partial<Omit<MissionRecord, 'id' | 'createdAt' | 'createdBy' | 'auditTrail'>>, expectedVersion?: number) => Promise<void>;
  deleteMission: (id: string) => Promise<void>;
  getMissionById: (id: string) => MissionRecord | undefined;

}

interface MissionWorkflowContextType {
  transitionMissionStatus: (id: string, toStatus: MissionStatus, comments?: string) => Promise<void>;
  validateStatusTransition: (fromStatus: MissionStatus, toStatus: MissionStatus, mission: MissionRecord) => MissionValidationError[];
  getValidNextStatuses: (currentStatus: MissionStatus) => MissionStatus[];
}

interface MissionApprovalContextType {
  approveMission: (id: string, approvalType: 'planning' | 'flying' | 'completion' | 'final', digitalSignature: string, comments?: string) => Promise<void>;
  rejectMission: (id: string, approvalType: 'planning' | 'flying' | 'completion' | 'final', reason: string) => Promise<void>;
  checkApprovalRequirements: (mission: MissionRecord, approvalType: 'planning' | 'flying' | 'completion' | 'final') => MissionValidationError[];

}

interface MissionComponentsContextType {
  updateJSARecord: (missionId: string, jsa: JSARecord) => Promise<void>;
  addBoundaryFile: (missionId: string, boundaryFile: BoundaryFile) => Promise<void>;
  removeBoundaryFile: (missionId: string, boundaryFileId: string) => Promise<void>;
  updateFlightPlan: (missionId: string, flightPlan: FlightPlan) => Promise<void>;
  updateFlightExecution: (missionId: string, flightExecution: FlightExecution) => Promise<void>;
}

interface MissionSearchContextType {
  searchMissions: (criteria: MissionSearchCriteria) => MissionRecord[];
  getMissionsByStatus: (status: MissionStatus) => MissionRecord[];
  getMissionsByType: (type: MissionType) => MissionRecord[];
  getMissionsByPriority: (priority: MissionPriority) => MissionRecord[];
  getMissionsByDateRange: (startDate: string, endDate: string) => MissionRecord[];
  getUpcomingMissions: (days?: number) => MissionRecord[];
  getOverdueMissions: () => MissionRecord[];

}

interface MissionAnalyticsContextType {
  calculateStatistics: () => MissionStatistics;
  getMissionsForUser: (userId: string) => MissionRecord[];
  getMissionStatusHistory: (id: string) => MissionAuditEntry[];
}

interface MissionValidationContextType {
  validateMission: (mission: Partial<MissionRecord>) => MissionValidationError[];
  validateMissionReadiness: (id: string, targetStatus: MissionStatus) => MissionValidationError[];
}

interface MissionAircraftContextType {
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
}

interface MissionTemplateContextType {
  createTemplate: (template: Omit<MissionTemplate, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<string>;
  updateTemplate: (id: string, updates: Partial<Omit<MissionTemplate, 'id' | 'createdAt' | 'createdBy'>>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  getTemplateById: (id: string) => MissionTemplate | undefined;
  createMissionFromTemplate: (templateId: string, overrides: Partial<MissionRecord>) => Promise<string>;
}

interface MissionDataManagementContextType {
  loadData: () => Promise<void>;
  saveData: () => Promise<void>;
  clearData: () => Promise<void>;
  exportMissionData: (missionIds?: string[]) => string;
  importMissionData: (data: string) => Promise<void>;
  getMissionVersion: (id: string) => number; // For optimistic locking
}

// Consolidated Context Type for Backwards Compatibility
interface MissionContextType extends
  MissionDataContextType,
  MissionOperationsContextType,
  MissionWorkflowContextType,
  MissionApprovalContextType,
  MissionComponentsContextType,
  MissionSearchContextType,
  MissionAnalyticsContextType,
  MissionValidationContextType,
  MissionAircraftContextType,
  MissionTemplateContextType,
  MissionDataManagementContextType {}

// Default Context Value
const defaultContext: MissionContextType = {
  missions: [],
  missionTemplates: [],
  isLoading: false,
  error: null,
  statistics: null,
  createMission: async () => '',
  createAuthorizedMission: async () => '',
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
  getMissionVersion: () => 1,
};

// Create Context
const MissionContext = createContext<MissionContextType>(defaultContext);

// Storage Keys
const STORAGE_KEY = PERSISTENCE_KEYS.missions;
const TEMPLATES_STORAGE_KEY = PERSISTENCE_KEYS.missionTemplates;

// Helper Functions
const generateId = (): string => {
  return `mission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const generateMissionNumber = (): string => {
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString().slice(-6);
  return `MSN-${year}-${timestamp}`;
};

// Data validation for loaded mission data
const validateMissionRecord = (data: any): data is MissionRecord => {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.id === 'string' &&
    typeof data.missionName === 'string' &&
    typeof data.status === 'string' &&
    typeof data.createdAt === 'string' &&
    typeof data.updatedAt === 'string'
  );
};

const validateMissionArray = (data: any): data is MissionRecord[] => {
  return Array.isArray(data) && data.every(validateMissionRecord);
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
export const validateMissionData = (
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

  const selectedKitId = mission.aircraftConfiguration?.kitId;
  const selectedConfigurationId = mission.aircraftConfiguration?.configurationId;

  if (!selectedKitId && !selectedConfigurationId) {
    errors.push({
      field: 'aircraftConfiguration.configurationId',
      message: 'Equipment kit is required',
      severity: 'error',
      code: 'REQUIRED_FIELD'
    });
  } else if (aircraftContext && mission.aircraftConfiguration?.aircraftId) {
    const configuration = selectedConfigurationId
      ? aircraftContext.getConfigurationById(selectedConfigurationId)
      : undefined;
    const kitId = selectedKitId || configuration?.kitId;
    const kit = kitId ? aircraftContext.getEquipmentKitById(kitId) : undefined;

    if (selectedConfigurationId && !configuration) {
      errors.push({
        field: 'aircraftConfiguration.configurationId',
        message: 'Selected configuration does not exist',
        severity: 'error',
        code: 'INVALID_CONFIGURATION'
      });
    } else if (!kit) {
      errors.push({
        field: 'aircraftConfiguration.kitId',
        message: 'Selected equipment kit does not exist',
        severity: 'error',
        code: 'INVALID_KIT'
      });
    } else {
      const aircraft = aircraftContext.getAircraftById(mission.aircraftConfiguration.aircraftId);

      if (configuration && configuration.aircraftId !== mission.aircraftConfiguration.aircraftId) {
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

export const validateStatusTransitionRules = (
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
      if (!mission.aircraftConfiguration.aircraftId || (
        !mission.aircraftConfiguration.kitId && !mission.aircraftConfiguration.configurationId
      )) {
        errors.push({
          field: 'aircraftConfiguration',
          message: 'Aircraft and equipment configuration must be selected',
          severity: 'error',
          code: 'INCOMPLETE_CONFIGURATION'
        });
      } else if (aircraftContext) {
        // Validate aircraft availability and operational status
        const aircraft = aircraftContext.getAircraftById(mission.aircraftConfiguration.aircraftId);
        const configuration = mission.aircraftConfiguration.configurationId
          ? aircraftContext.getConfigurationById(mission.aircraftConfiguration.configurationId)
          : undefined;
        const kitId = mission.aircraftConfiguration.kitId || configuration?.kitId;
        const kit = kitId ? aircraftContext.getEquipmentKitById(kitId) : undefined;

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

        if (mission.aircraftConfiguration.configurationId && !configuration) {
          errors.push({
            field: 'aircraftConfiguration.configurationId',
            message: 'Selected configuration does not exist',
            severity: 'error',
            code: 'INVALID_CONFIGURATION'
          });
        } else if (!kit) {
          errors.push({
            field: 'aircraftConfiguration.kitId',
            message: 'Selected equipment kit does not exist',
            severity: 'error',
            code: 'INVALID_KIT'
          });
        } else {
          // Validate configuration safety (weight and balance within limits)
          if (configuration && !configuration.weightAndBalance.withinLimits) {
            errors.push({
              field: 'aircraftConfiguration.configurationId',
              message: 'Aircraft-kit configuration weight and balance is not within safe limits',
              severity: 'error',
              code: 'CONFIGURATION_UNSAFE'
            });
          }

          // Validate equipment kit availability
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

      if (!mission.complianceChecks.environmentalClearance) {
        errors.push({
          field: 'complianceChecks.environmentalClearance',
          message: 'Environmental clearance warning is active and should be acknowledged before approval',
          severity: 'warning',
          code: 'ENVIRONMENTAL_CLEARANCE_WARNING'
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

  // Refs for cleanup and ordered persistence
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const hasLoadedRef = useRef(false);
  const versionMapRef = useRef<Map<string, number>>(new Map());

  const { user } = useAuth();
  const {
    getAircraftById,
    getEquipmentKitById,
    getConfigurationById,
    validateConfiguration,
    getAircraftConfigurations
  } = useAircraft();

  // Enhanced error handling
  const safeOperation = useCallback(<T,>(
    operation: () => T,
    errorMessage: string,
    throwOnError = false,
  ): T | null => {
    setError(null);
    return runMissionOperation(
      operation,
      errorMessage,
      (message, error) => {
        setError(message);
        console.error(message, error);
      },
      throwOnError,
    );
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

  // Enhanced async data loading with validation
  const loadData = useCallback(async () => {
    hasLoadedRef.current = false;
    setIsLoading(true);
    setError(null);

    try {
      const loadedMissions = await readSharedCollection<MissionRecord>(STORAGE_KEY);
      const missionsData = validateMissionArray(loadedMissions)
        ? loadedMissions
        : [];

      if (loadedMissions.length > 0 && missionsData.length === 0) {
        console.warn('Invalid mission data detected, using empty array');
      }

      const templatesData = await readSharedCollection<MissionTemplate>(TEMPLATES_STORAGE_KEY);

      // Initialize version map for optimistic locking
      const versionMap = new Map<string, number>();
      missionsData.forEach((mission: MissionRecord) => {
        versionMap.set(mission.id, 1); // Start with version 1 for existing missions
      });
      versionMapRef.current = versionMap;

      setMissions(missionsData);
      setMissionTemplates(templatesData);
    } catch (error) {
      const message = `Failed to load data: ${error instanceof Error ? error.message : String(error)}`;
      setError(message);
      console.error(message, error);
    } finally {
      hasLoadedRef.current = true;
      setIsLoading(false);
    }
  }, []);

  // Save snapshots in order so a slower request cannot overwrite newer state.
  const saveData = useCallback(async () => {
    const missionsSnapshot = missions;
    const templatesSnapshot = missionTemplates;
    const persistSnapshot = async () => {
      await Promise.all([
        writeSharedCollection(STORAGE_KEY, missionsSnapshot),
        writeSharedCollection(TEMPLATES_STORAGE_KEY, templatesSnapshot),
      ]);
    };

    const queuedSave = saveQueueRef.current
      .catch(() => undefined)
      .then(persistSnapshot);
    saveQueueRef.current = queuedSave;
    await queuedSave;
  }, [missions, missionTemplates]);

  // Clear all data
  const clearData = useCallback(async () => {
    setMissions([]);
    setMissionTemplates([]);
    setStatistics(null);
    try {
      await Promise.all([
        clearSharedCollection(STORAGE_KEY),
        clearSharedCollection(TEMPLATES_STORAGE_KEY),
      ]);
    } catch (error) {
      const message = `Failed to clear mission data: ${error instanceof Error ? error.message : String(error)}`;
      setError(message);
      console.error(message, error);
    }
  }, []);

  // Mission CRUD Operations
  const createMission = useCallback(async (missionData: MissionDraftInput): Promise<string> => {
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
        jsaRecord: {
          ...missionData.jsaRecord,
          missionId: id,
        },
        boundaryFiles: missionData.boundaryFiles.map(file => ({
          ...file,
          missionId: id,
        })),
        approvals,
        auditTrail: [initialAuditEntry],
        createdAt: now,
        updatedAt: now,
        createdBy: user.id,
        lastModifiedBy: user.id,
      };

      setMissions(prev => [...prev, newMission]);

      // Initialize version tracking for new mission
      versionMapRef.current.set(id, 1);

      return id;
    }, 'Failed to create mission') || '';
  }, [safeOperation, user, createAuditEntry, getAircraftById, getEquipmentKitById, getConfigurationById, validateConfiguration]);

  const createAuthorizedMission = useCallback(async (
    missionData: MissionDraftInput,
    digitalSignature: string,
    comments?: string,
    existingMissionId?: string
  ): Promise<string> => {
    if (!user) {
      throw new Error('User must be authenticated to authorize missions');
    }

    return safeOperation(() => {
      if (user.role !== 'contractor' && user.role !== 'admin') {
        throw new Error('Only CRP (Chief Remote Pilot) or admin users can authorize missions');
      }

      const existingMission = existingMissionId
        ? missions.find(mission => mission.id === existingMissionId)
        : undefined;

      if (existingMissionId && !existingMission) {
        throw new Error(`Mission with ID ${existingMissionId} not found`);
      }

      if (existingMission && ['Flying', 'Completed', 'Locked'].includes(existingMission.status)) {
        throw new Error(`Cannot re-authorize a mission in ${existingMission.status} status`);
      }

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

      const id = existingMission?.id || generateId();
      const now = new Date().toISOString();
      const missionNumber = existingMission?.missionNumber || generateMissionNumber();
      const baseApprovals: MissionApprovals = existingMission?.approvals || {
        missionId: id,
        createdAt: now,
        updatedAt: now,
      };

      const baseAuditTrail = existingMission
        ? [
            ...existingMission.auditTrail,
            createAuditEntry(
              id,
              'updated',
              [{ field: 'mission', oldValue: 'draft', newValue: 'authorized update' }],
              undefined,
              comments
            ),
          ]
        : [
            createAuditEntry(
              id,
              'created',
              [{ field: 'mission', oldValue: null, newValue: 'created' }],
              undefined,
              comments
            ),
          ];

      const planningMission: MissionRecord = {
        ...missionData,
        id,
        missionNumber,
        status: 'Planning',
        jsaRecord: {
          ...missionData.jsaRecord,
          missionId: id,
        },
        boundaryFiles: missionData.boundaryFiles.map(file => ({
          ...file,
          missionId: id,
        })),
        approvals: {
          ...baseApprovals,
          missionId: id,
          planningApproval: {
            approvedBy: user.id,
            approvedAt: now,
            digitalSignature,
            comments,
          },
          updatedAt: now,
        },
        auditTrail: baseAuditTrail,
        createdAt: existingMission?.createdAt || now,
        updatedAt: now,
        createdBy: existingMission?.createdBy || user.id,
        lastModifiedBy: user.id,
      };

      const readinessErrors = validateStatusTransitionRules('Planning', 'Approved', planningMission, {
        getAircraftById,
        getEquipmentKitById,
        getConfigurationById,
        validateConfiguration
      });
      const readinessCriticalErrors = readinessErrors.filter(error => error.severity === 'error');

      if (readinessCriticalErrors.length > 0) {
        throw new Error(`Authorization failed: ${readinessCriticalErrors.map(e => e.message).join(', ')}`);
      }

      const approvalAudit = createAuditEntry(
        id,
        'approved',
        [{ field: 'approvals.planning', oldValue: null, newValue: 'approved' }],
        undefined,
        comments
      );

      const transitionAudit = createAuditEntry(
        id,
        'status-changed',
        [{ field: 'status', oldValue: 'Planning', newValue: 'Approved' }],
        {
          fromStatus: 'Planning',
          toStatus: 'Approved',
          reason: comments,
          approvalRequired: true,
          validationPassed: true,
        },
        comments
      );

      const approvedMission: MissionRecord = {
        ...planningMission,
        status: 'Approved',
        updatedAt: now,
        auditTrail: [...planningMission.auditTrail, approvalAudit, transitionAudit],
      };

      setMissions(prev => {
        const existingIndex = prev.findIndex(mission => mission.id === id);
        if (existingIndex === -1) {
          return [...prev, approvedMission];
        }

        const next = [...prev];
        next[existingIndex] = approvedMission;
        return next;
      });

      const currentVersion = versionMapRef.current.get(id) || 0;
      versionMapRef.current.set(id, currentVersion + 1);

      return id;
    }, 'Failed to authorize mission', true) || '';
  }, [
    safeOperation,
    user,
    missions,
    createAuditEntry,
    getAircraftById,
    getEquipmentKitById,
    getConfigurationById,
    validateConfiguration,
  ]);

  const updateMission = useCallback(async (
    id: string,
    updates: Partial<Omit<MissionRecord, 'id' | 'createdAt' | 'createdBy' | 'auditTrail'>>,
    expectedVersion?: number
  ): Promise<void> => {
    if (!user) {
      throw new Error('User must be authenticated to update missions');
    }

    safeOperation(() => {
      if (!id) {
        throw new Error('Mission ID is required');
      }

      const missionIndex = missions.findIndex(mission => mission.id === id);
      if (missionIndex === -1) {
        throw new Error(`Mission with ID ${id} not found`);
      }

      const currentMission = missions[missionIndex];

      // Check if mission is locked
      if (currentMission.status === 'Locked') {
        throw new Error('Cannot modify locked missions');
      }

      // Optimistic locking check
      const currentVersion = versionMapRef.current.get(id) || 1;
      if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
        throw new Error(`Mission has been modified by another user. Expected version ${expectedVersion}, current version ${currentVersion}`);
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

      // Increment version for optimistic locking
      const newVersion = currentVersion + 1;
      versionMapRef.current.set(id, newVersion);

      const newMissions = [...missions];
      newMissions[missionIndex] = updatedMission;
      setMissions(newMissions);

      return true; // Return success indicator
    }, 'Failed to update mission', true);
  }, [safeOperation, user, createAuditEntry, missions]);

  const deleteMission = useCallback(async (id: string) => {
    if (!user) {
      throw new Error('User must be authenticated to delete missions');
    }

    if (!id) throw new Error('Mission ID is required');
    const mission = missions.find((candidate) => candidate.id === id);
    if (!mission) throw new Error(`Mission with ID ${id} not found`);
    if (mission.status === 'Flying') throw new Error('Cannot delete missions that are currently flying');
    if (mission.status === 'Locked') throw new Error('Cannot delete locked missions');

    await deleteSharedRecord(STORAGE_KEY, id);
    setMissions((previous) => previous.filter((candidate) => candidate.id !== id));
  }, [missions, user]);

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
    }, 'Failed to transition mission status', true);
  }, [missions, user, safeOperation, createAuditEntry, getAircraftById, getEquipmentKitById, getConfigurationById, validateConfiguration]);

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
    }, 'Failed to approve mission', true);
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
    }, 'Failed to update flight plan', true);
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
    }, 'Failed to update flight execution', true);
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

    await deleteSharedRecord(TEMPLATES_STORAGE_KEY, id);
    setMissionTemplates((previous) => previous.filter((template) => template.id !== id));
  }, [user]);

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

  // Get mission version for optimistic locking
  const getMissionVersion = useCallback((id: string): number => {
    return versionMapRef.current.get(id) || 1;
  }, []);

  // Auto-save the latest render snapshot. The previous implementation retained
  // the first Planning snapshot and silently discarded later workflow states.
  useEffect(() => {
    if (!hasLoadedRef.current) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveData().catch((error) => {
        console.error('Auto-save failed:', error);
        setError('Auto-save failed. Your changes may not be saved.');
      });
    }, 250);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [missions, missionTemplates, saveData]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate statistics when missions change
  useEffect(() => {
    const calculateStats = async () => {
      try {
        const stats = calculateStatistics();
        setStatistics(stats);
      } catch (error) {
        console.error('Failed to calculate statistics:', error);
      }
    };

    calculateStats();
  }, [missions, calculateStatistics]);

  // Cleanup resources on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Memoized function groups for performance optimization
  const missionOperations = useMemo(() => ({
    createMission,
    createAuthorizedMission,
    updateMission,
    deleteMission,
    getMissionById,
  }), [createMission, createAuthorizedMission, updateMission, deleteMission, getMissionById]);

  const workflowOperations = useMemo(() => ({
    transitionMissionStatus,
    validateStatusTransition,
    getValidNextStatuses,
  }), [transitionMissionStatus, validateStatusTransition, getValidNextStatuses]);

  const approvalOperations = useMemo(() => ({
    approveMission,
    rejectMission,
    checkApprovalRequirements,
  }), [approveMission, rejectMission, checkApprovalRequirements]);

  const componentOperations = useMemo(() => ({
    updateJSARecord,
    addBoundaryFile,
    removeBoundaryFile,
    updateFlightPlan,
    updateFlightExecution,
  }), [updateJSARecord, addBoundaryFile, removeBoundaryFile, updateFlightPlan, updateFlightExecution]);

  const searchOperations = useMemo(() => ({
    searchMissions,
    getMissionsByStatus,
    getMissionsByType,
    getMissionsByPriority,
    getMissionsByDateRange,
    getUpcomingMissions,
    getOverdueMissions,
  }), [searchMissions, getMissionsByStatus, getMissionsByType, getMissionsByPriority, getMissionsByDateRange, getUpcomingMissions, getOverdueMissions]);

  const analyticsOperations = useMemo(() => ({
    calculateStatistics,
    getMissionsForUser,
    getMissionStatusHistory,
  }), [calculateStatistics, getMissionsForUser, getMissionStatusHistory]);

  const validationOperations = useMemo(() => ({
    validateMission,
    validateMissionReadiness,
  }), [validateMission, validateMissionReadiness]);

  const aircraftOperations = useMemo(() => ({
    validateAircraftAvailability,
    getCompatibleConfigurations,
    calculateMissionCost,
  }), [validateAircraftAvailability, getCompatibleConfigurations, calculateMissionCost]);

  const templateOperations = useMemo(() => ({
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplateById,
    createMissionFromTemplate,
  }), [createTemplate, updateTemplate, deleteTemplate, getTemplateById, createMissionFromTemplate]);

  const dataOperations = useMemo(() => ({
    loadData,
    saveData,
    clearData,
    exportMissionData,
    importMissionData,
    getMissionVersion,
  }), [loadData, saveData, clearData, exportMissionData, importMissionData, getMissionVersion]);

  // Core data state (most frequently accessed)
  const coreState = useMemo(() => ({
    missions,
    missionTemplates,
    isLoading,
    error,
    statistics,
  }), [missions, missionTemplates, isLoading, error, statistics]);

  // Optimized context value with grouped dependencies
  const contextValue: MissionContextType = useMemo(() => ({
    // Spread core state
    ...coreState,

    // Spread operation groups
    ...missionOperations,
    ...workflowOperations,
    ...approvalOperations,
    ...componentOperations,
    ...searchOperations,
    ...analyticsOperations,
    ...validationOperations,
    ...aircraftOperations,
    ...templateOperations,
    ...dataOperations,
  }), [
    // Grouped dependencies - dramatically reduced from 38+ to 11
    coreState,
    missionOperations,
    workflowOperations,
    approvalOperations,
    componentOperations,
    searchOperations,
    analyticsOperations,
    validationOperations,
    aircraftOperations,
    templateOperations,
    dataOperations,
  ]);

  return (
    <MissionErrorBoundary
      onError={(error, errorId) => {
        console.error('Mission system error:', { errorId, error });
        // Could integrate with external error reporting service here
      }}
      fallback={(error, retry) => (
        <div style={{
          padding: '20px',
          border: '1px solid #ff6b6b',
          borderRadius: '8px',
          backgroundColor: '#fff5f5',
          margin: '20px 0'
        }}>
          <h3 style={{ color: '#d63031', marginBottom: '12px' }}>
            Mission System Error
          </h3>
          <p style={{ marginBottom: '16px' }}>
            The mission management system encountered an error. Please try refreshing or contact support if the issue persists.
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={retry}
              style={{
                padding: '8px 16px',
                backgroundColor: '#00b894',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Retry
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px',
                backgroundColor: '#636e72',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Refresh Page
            </button>
          </div>
        </div>
      )}
    >
      <MissionContext.Provider value={contextValue}>
        {children}
      </MissionContext.Provider>
    </MissionErrorBoundary>
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
