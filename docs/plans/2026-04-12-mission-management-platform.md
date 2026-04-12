# Mission Management Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build comprehensive mission planning and execution system with 5-phase workflow, aircraft/kit management, JSA system, boundary analysis, and compliance tracking.

**Architecture:** Modular React TypeScript system with context-based state management, pluggable JSA/boundary analysis components, and enterprise-ready data structures for future cloud migration.

**Tech Stack:** React TypeScript, Material-UI v6, Context API, localStorage, file processing libraries (JSZip for KML/SHP), export libraries (jsPDF, xlsx)

---

## Foundation Tasks

### Task 1: Aircraft Management Data Models

**Files:**
- Create: `src/types/aircraft.ts`
- Create: `src/contexts/AircraftContext.tsx`
- Test: Create manual verification (no Jest setup in current project)

**Step 1: Create aircraft data models**

Create `src/types/aircraft.ts`:

```typescript
export interface Aircraft {
  id: string;
  registration: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  mtow: number; // kg
  maxAltitude: number; // ft AGL
  maxWindSpeed: number; // kts
  lastMaintenance: string; // ISO date
  nextMaintenanceDue: string; // ISO date
  insurancePolicyNumber: string;
  insuranceExpiry: string; // ISO date
  status: 'Available' | 'Maintenance' | 'In Use' | 'Retired';
  assignedKits: string[]; // Kit IDs
  operationalLimits: {
    maxPayload: number; // kg
    maxFlightTime: number; // minutes
    maxWindSpeed: number; // kts
  };
  documentation: {
    rcCertificate?: string;
    maintenanceLog?: string;
    operationsManual?: string;
  };
  createdAt: string;
  lastModified: string;
}

export interface EquipmentKit {
  id: string;
  name: string;
  type: 'Spray' | 'Survey' | 'Inspection' | 'Custom';
  description: string;
  specifications: {
    weight: number; // kg
    dimensions: string;
    powerRequirement?: number; // watts
    dataStorage?: string;
  };
  components: {
    name: string;
    model: string;
    serialNumber?: string;
    calibrationDue?: string;
  }[];
  operationalData: {
    setupTime: number; // minutes
    maxOperationTime: number; // minutes
    weatherLimits: {
      maxWindSpeed: number; // kts
      minVisibility: number; // km
      maxPrecipitation: string;
    };
  };
  financialData: {
    purchasePrice?: number;
    depreciationRate: number; // per year
    maintenanceCostPerHour: number;
    operationalCostPerHour: number;
  };
  compatibleAircraft: string[]; // Aircraft IDs
  createdAt: string;
  lastModified: string;
}

export interface AircraftKitConfiguration {
  aircraftId: string;
  kitId: string;
  configurationName: string;
  weightAndBalance: {
    totalWeight: number;
    cogPosition: string;
    approved: boolean;
    approvedBy?: string;
    approvalDate?: string;
  };
  operationalLimits: {
    maxAltitude: number;
    maxWindSpeed: number;
    maxFlightTime: number;
  };
  pricingModel: {
    baseRate: number; // per hour
    perHectareRate?: number;
    setupFee: number;
    rateMultiplier: number;
  };
}
```

**Step 2: Create aircraft management context**

Create `src/contexts/AircraftContext.tsx`:

```typescript
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Aircraft, EquipmentKit, AircraftKitConfiguration } from '../types/aircraft';

interface AircraftContextType {
  aircraft: Aircraft[];
  equipmentKits: EquipmentKit[];
  configurations: AircraftKitConfiguration[];
  isLoading: boolean;

  // Aircraft management
  addAircraft: (aircraft: Omit<Aircraft, 'id' | 'createdAt' | 'lastModified'>) => void;
  updateAircraft: (id: string, updates: Partial<Aircraft>) => void;
  removeAircraft: (id: string) => void;
  getAircraftById: (id: string) => Aircraft | undefined;
  getAvailableAircraft: () => Aircraft[];

  // Equipment kit management
  addEquipmentKit: (kit: Omit<EquipmentKit, 'id' | 'createdAt' | 'lastModified'>) => void;
  updateEquipmentKit: (id: string, updates: Partial<EquipmentKit>) => void;
  removeEquipmentKit: (id: string) => void;
  getEquipmentKitById: (id: string) => EquipmentKit | undefined;
  getCompatibleKits: (aircraftId: string) => EquipmentKit[];

  // Configuration management
  addConfiguration: (config: Omit<AircraftKitConfiguration, 'id'>) => void;
  updateConfiguration: (aircraftId: string, kitId: string, updates: Partial<AircraftKitConfiguration>) => void;
  getConfiguration: (aircraftId: string, kitId: string) => AircraftKitConfiguration | undefined;

  // Persistence
  saveData: () => Promise<void>;
  loadData: () => Promise<void>;
}

const AircraftContext = createContext<AircraftContextType | undefined>(undefined);

const STORAGE_KEY = 'ftf_aircraft_data';

export function AircraftProvider({ children }: { children: React.ReactNode }) {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [equipmentKits, setEquipmentKits] = useState<EquipmentKit[]>([]);
  const [configurations, setConfigurations] = useState<AircraftKitConfiguration[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load data from localStorage
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      setAircraft(stored.aircraft || []);
      setEquipmentKits(stored.equipmentKits || []);
      setConfigurations(stored.configurations || []);
    } catch (error) {
      console.error('Error loading aircraft data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save data to localStorage
  const saveData = useCallback(async () => {
    try {
      const dataToSave = {
        aircraft,
        equipmentKits,
        configurations,
        lastSaved: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (error) {
      console.error('Error saving aircraft data:', error);
      throw new Error('Failed to save aircraft data');
    }
  }, [aircraft, equipmentKits, configurations]);

  // Aircraft management functions
  const addAircraft = useCallback((aircraftData: Omit<Aircraft, 'id' | 'createdAt' | 'lastModified'>) => {
    const newAircraft: Aircraft = {
      ...aircraftData,
      id: `aircraft-${Date.now()}`,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };
    setAircraft(prev => [...prev, newAircraft]);
  }, []);

  const updateAircraft = useCallback((id: string, updates: Partial<Aircraft>) => {
    setAircraft(prev => prev.map(a =>
      a.id === id
        ? { ...a, ...updates, lastModified: new Date().toISOString() }
        : a
    ));
  }, []);

  const removeAircraft = useCallback((id: string) => {
    setAircraft(prev => prev.filter(a => a.id !== id));
    // Also remove related configurations
    setConfigurations(prev => prev.filter(c => c.aircraftId !== id));
  }, []);

  const getAircraftById = useCallback((id: string) => {
    return aircraft.find(a => a.id === id);
  }, [aircraft]);

  const getAvailableAircraft = useCallback(() => {
    return aircraft.filter(a => a.status === 'Available');
  }, [aircraft]);

  // Equipment kit management functions
  const addEquipmentKit = useCallback((kitData: Omit<EquipmentKit, 'id' | 'createdAt' | 'lastModified'>) => {
    const newKit: EquipmentKit = {
      ...kitData,
      id: `kit-${Date.now()}`,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };
    setEquipmentKits(prev => [...prev, newKit]);
  }, []);

  const updateEquipmentKit = useCallback((id: string, updates: Partial<EquipmentKit>) => {
    setEquipmentKits(prev => prev.map(k =>
      k.id === id
        ? { ...k, ...updates, lastModified: new Date().toISOString() }
        : k
    ));
  }, []);

  const removeEquipmentKit = useCallback((id: string) => {
    setEquipmentKits(prev => prev.filter(k => k.id !== id));
    // Also remove related configurations
    setConfigurations(prev => prev.filter(c => c.kitId !== id));
  }, []);

  const getEquipmentKitById = useCallback((id: string) => {
    return equipmentKits.find(k => k.id === id);
  }, [equipmentKits]);

  const getCompatibleKits = useCallback((aircraftId: string) => {
    return equipmentKits.filter(k =>
      k.compatibleAircraft.length === 0 || k.compatibleAircraft.includes(aircraftId)
    );
  }, [equipmentKits]);

  // Configuration management
  const addConfiguration = useCallback((configData: Omit<AircraftKitConfiguration, 'id'>) => {
    setConfigurations(prev => [...prev, configData]);
  }, []);

  const updateConfiguration = useCallback((aircraftId: string, kitId: string, updates: Partial<AircraftKitConfiguration>) => {
    setConfigurations(prev => prev.map(c =>
      c.aircraftId === aircraftId && c.kitId === kitId
        ? { ...c, ...updates }
        : c
    ));
  }, []);

  const getConfiguration = useCallback((aircraftId: string, kitId: string) => {
    return configurations.find(c => c.aircraftId === aircraftId && c.kitId === kitId);
  }, [configurations]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <AircraftContext.Provider
      value={{
        aircraft,
        equipmentKits,
        configurations,
        isLoading,
        addAircraft,
        updateAircraft,
        removeAircraft,
        getAircraftById,
        getAvailableAircraft,
        addEquipmentKit,
        updateEquipmentKit,
        removeEquipmentKit,
        getEquipmentKitById,
        getCompatibleKits,
        addConfiguration,
        updateConfiguration,
        getConfiguration,
        saveData,
        loadData,
      }}
    >
      {children}
    </AircraftContext.Provider>
  );
}

export function useAircraft() {
  const context = useContext(AircraftContext);
  if (!context) {
    throw new Error('useAircraft must be used within AircraftProvider');
  }
  return context;
}
```

**Step 3: Test by manual verification**

Manual test: Create a simple component to verify context works (add to existing page temporarily)

**Step 4: Commit**

```bash
git add src/types/aircraft.ts src/contexts/AircraftContext.tsx
git commit -m "feat: add aircraft and equipment kit management system"
```

---

### Task 2: Mission State Management System

**Files:**
- Create: `src/types/mission.ts`
- Create: `src/contexts/MissionContext.tsx`

**Step 1: Create mission data models**

Create `src/types/mission.ts`:

```typescript
export type MissionStatus = 'Planning' | 'Approved' | 'Flying' | 'Completed' | 'Locked';

export interface MissionLocation {
  siteName: string;
  coordinates: string; // lat,lng format
  elevation: number; // ft AGL
  nearbyAirfields: string[];
  address?: string;
  accessNotes?: string;
}

export interface BoundaryFile {
  fileName: string;
  fileType: 'SHP' | 'KML' | 'KMZ' | 'GeoJSON';
  uploadedAt: string;
  analysisType: 'Simple' | 'Smart' | 'Full GIS';
  analysisResults?: {
    area: number; // hectares
    perimeter: number; // meters
    obstacles?: string[];
    restrictedZones?: string[];
    suggestedFlightPattern?: string;
  };
  fileData: string; // base64 encoded file data
}

export interface JSARecord {
  jsaType: 'Standard' | 'Comprehensive' | 'Industry-Specific';
  industryType?: 'Crop Spraying' | 'Surveying' | 'Inspections';
  hazards: {
    id: string;
    hazard: string;
    likelihood: 'Low' | 'Medium' | 'High';
    consequence: 'Minor' | 'Moderate' | 'Major' | 'Catastrophic';
    riskLevel: 'Low' | 'Medium' | 'High' | 'Extreme';
    mitigation: string;
    residualRisk?: 'Low' | 'Medium' | 'High' | 'Extreme';
    responsible?: string;
    dueDate?: string;
  }[];
  overallRiskLevel: 'Low' | 'Medium' | 'High' | 'Extreme';
  approvalRequired: boolean;
  completedBy: string;
  completedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface FlightPlan {
  plannedFlightLines?: string; // KML data
  estimatedFlightTime: number; // minutes
  plannedAltitude: number; // ft AGL
  plannedSpeed: number; // m/s
  plannedPattern: string;
  weatherRequirements: {
    maxWindSpeed: number;
    minVisibility: number;
    maxPrecipitation: string;
  };
}

export interface FlightExecution {
  actualFlightLines?: string; // KML data
  actualFlightTime: number; // minutes
  actualAltitude: number; // ft AGL
  deviationAnalysis?: {
    spatialDeviation: number; // meters
    altitudeDeviation: number; // ft
    timeDeviation: number; // minutes
    coveragePercentage: number; // %
    weatherImpact?: string;
  };
  anomalies: string[];
  emergencyProcedures?: string[];
  batteriesUsed: string[];
  fuelUsed?: number;
}

export interface MissionApprovals {
  planningCompletedBy: string;
  planningCompletedAt: string;

  approvedBy?: string; // CRP signature
  approvedAt?: string;
  approvalComments?: string;

  executionCompletedBy?: string;
  executionCompletedAt?: string;

  finalApprovedBy?: string; // Final CRP signature
  finalApprovedAt?: string;
  locked?: boolean;
}

export interface MissionRecord {
  id: string;
  status: MissionStatus;

  // Basic Information
  missionName: string;
  missionType: 'Crop Spraying' | 'Surveying' | 'Inspection' | 'Other';
  description: string;
  scheduledDate: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';

  // Location and Boundaries
  location: MissionLocation;
  boundaries: BoundaryFile[];

  // Aircraft and Equipment
  aircraftId: string;
  equipmentKitIds: string[];
  aircraftConfiguration?: string; // Configuration name

  // Safety and Compliance
  jsaRecord?: JSARecord;
  flightAuthorizations: Array<{
    type: string;
    authorizationNumber?: string;
    validFrom: string;
    validTo: string;
    conditions: string[];
  }>;
  weatherConditions?: {
    recordedAt: string;
    windSpeed: number;
    windDirection: number;
    visibility: number;
    temperature: number;
    precipitation: string;
    suitable: boolean;
  };

  // Flight Planning and Execution
  flightPlan?: FlightPlan;
  flightExecution?: FlightExecution;

  // Financial Integration
  estimatedCosts?: {
    aircraftCost: number;
    equipmentCost: number;
    operationalCost: number;
    totalCost: number;
  };
  actualCosts?: {
    aircraftCost: number;
    equipmentCost: number;
    operationalCost: number;
    totalCost: number;
  };

  // Approvals and Signatures
  approvals: MissionApprovals;

  // Compliance Export
  compliancePackage?: {
    generatedAt: string;
    documents: {
      jsaReport?: string;
      flightLogPdf?: string;
      deviationAnalysis?: string;
      complianceChecklist?: string;
    };
    exported: boolean;
  };

  // Metadata
  createdAt: string;
  lastModified: string;
  createdBy: string;

  // Client Integration (if applicable)
  clientId?: string;
  propertyId?: string;
  fieldId?: string;
  jobId?: string;
}
```

**Step 2: Create mission management context**

Create `src/contexts/MissionContext.tsx`:

```typescript
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { MissionRecord, MissionStatus, JSARecord, BoundaryFile } from '../types/mission';
import { useAuth } from './AuthContext';

interface MissionContextType {
  missions: MissionRecord[];
  currentMission: MissionRecord | null;
  isLoading: boolean;

  // Mission CRUD operations
  createMission: (missionData: Partial<MissionRecord>) => string;
  updateMission: (missionId: string, updates: Partial<MissionRecord>) => void;
  deleteMission: (missionId: string) => void;
  getMissionById: (missionId: string) => MissionRecord | undefined;
  setCurrentMission: (missionId: string | null) => void;

  // Mission state transitions
  canTransitionToStatus: (missionId: string, newStatus: MissionStatus) => { allowed: boolean; reason?: string };
  transitionMissionStatus: (missionId: string, newStatus: MissionStatus, signature?: string) => void;

  // Mission components
  updateJSA: (missionId: string, jsa: JSARecord) => void;
  addBoundaryFile: (missionId: string, boundary: BoundaryFile) => void;
  updateFlightPlan: (missionId: string, flightPlan: Partial<MissionRecord['flightPlan']>) => void;
  updateFlightExecution: (missionId: string, execution: Partial<MissionRecord['flightExecution']>) => void;

  // Filtering and searching
  getMissionsByStatus: (status: MissionStatus) => MissionRecord[];
  getMissionsByDate: (startDate: string, endDate: string) => MissionRecord[];
  searchMissions: (query: string) => MissionRecord[];

  // Validation
  validateMissionForApproval: (missionId: string) => { valid: boolean; errors: string[] };
  validateMissionForCompletion: (missionId: string) => { valid: boolean; errors: string[] };

  // Persistence
  saveMissions: () => Promise<void>;
  loadMissions: () => Promise<void>;
}

const MissionContext = createContext<MissionContextType | undefined>(undefined);

const STORAGE_KEY = 'ftf_missions';

export function MissionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [missions, setMissions] = useState<MissionRecord[]>([]);
  const [currentMission, setCurrentMissionState] = useState<MissionRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load missions from localStorage
  const loadMissions = useCallback(async () => {
    setIsLoading(true);
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      setMissions(stored);
    } catch (error) {
      console.error('Error loading missions:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save missions to localStorage
  const saveMissions = useCallback(async () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(missions));
    } catch (error) {
      console.error('Error saving missions:', error);
      throw new Error('Failed to save missions');
    }
  }, [missions]);

  // Create new mission
  const createMission = useCallback((missionData: Partial<MissionRecord>): string => {
    const missionId = `mission-${Date.now()}`;
    const newMission: MissionRecord = {
      id: missionId,
      status: 'Planning',
      missionName: missionData.missionName || `Mission ${new Date().toLocaleDateString()}`,
      missionType: missionData.missionType || 'Other',
      description: missionData.description || '',
      scheduledDate: missionData.scheduledDate || new Date().toISOString().split('T')[0],
      priority: missionData.priority || 'Medium',
      location: missionData.location || {
        siteName: '',
        coordinates: '',
        elevation: 0,
        nearbyAirfields: [],
      },
      boundaries: [],
      aircraftId: missionData.aircraftId || '',
      equipmentKitIds: missionData.equipmentKitIds || [],
      flightAuthorizations: [],
      approvals: {
        planningCompletedBy: '',
        planningCompletedAt: '',
      },
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      createdBy: user?.id || 'unknown',
      ...missionData,
    };

    setMissions(prev => [...prev, newMission]);
    return missionId;
  }, [user]);

  // Update mission
  const updateMission = useCallback((missionId: string, updates: Partial<MissionRecord>) => {
    setMissions(prev => prev.map(m =>
      m.id === missionId
        ? { ...m, ...updates, lastModified: new Date().toISOString() }
        : m
    ));
  }, []);

  // Delete mission
  const deleteMission = useCallback((missionId: string) => {
    setMissions(prev => prev.filter(m => m.id !== missionId));
    if (currentMission?.id === missionId) {
      setCurrentMissionState(null);
    }
  }, [currentMission]);

  // Get mission by ID
  const getMissionById = useCallback((missionId: string) => {
    return missions.find(m => m.id === missionId);
  }, [missions]);

  // Set current mission
  const setCurrentMission = useCallback((missionId: string | null) => {
    if (missionId) {
      const mission = getMissionById(missionId);
      setCurrentMissionState(mission || null);
    } else {
      setCurrentMissionState(null);
    }
  }, [getMissionById]);

  // Validation functions
  const validateMissionForApproval = useCallback((missionId: string): { valid: boolean; errors: string[] } => {
    const mission = getMissionById(missionId);
    if (!mission) {
      return { valid: false, errors: ['Mission not found'] };
    }

    const errors: string[] = [];

    if (!mission.aircraftId) errors.push('Aircraft must be selected');
    if (mission.equipmentKitIds.length === 0) errors.push('At least one equipment kit must be selected');
    if (!mission.jsaRecord) errors.push('JSA must be completed');
    if (mission.boundaries.length === 0) errors.push('Mission boundary must be uploaded');
    if (!mission.location.siteName) errors.push('Site name is required');
    if (!mission.location.coordinates) errors.push('Site coordinates are required');
    if (!mission.flightPlan) errors.push('Flight plan must be completed');

    return { valid: errors.length === 0, errors };
  }, [getMissionById]);

  const validateMissionForCompletion = useCallback((missionId: string): { valid: boolean; errors: string[] } => {
    const mission = getMissionById(missionId);
    if (!mission) {
      return { valid: false, errors: ['Mission not found'] };
    }

    const errors: string[] = [];

    if (!mission.flightExecution?.actualFlightLines) {
      errors.push('Actual flight lines must be uploaded');
    }
    if (!mission.flightExecution?.actualFlightTime) {
      errors.push('Actual flight time must be recorded');
    }
    if (!mission.weatherConditions) {
      errors.push('Weather conditions must be recorded');
    }

    return { valid: errors.length === 0, errors };
  }, [getMissionById]);

  // Status transition validation
  const canTransitionToStatus = useCallback((missionId: string, newStatus: MissionStatus): { allowed: boolean; reason?: string } => {
    const mission = getMissionById(missionId);
    if (!mission) {
      return { allowed: false, reason: 'Mission not found' };
    }

    const currentStatus = mission.status;

    // Define valid transitions
    const validTransitions: Record<MissionStatus, MissionStatus[]> = {
      'Planning': ['Approved'],
      'Approved': ['Flying', 'Planning'], // Can go back to planning
      'Flying': ['Completed'],
      'Completed': ['Locked', 'Flying'], // Can go back to flying
      'Locked': [], // No transitions from locked
    };

    if (!validTransitions[currentStatus].includes(newStatus)) {
      return { allowed: false, reason: `Cannot transition from ${currentStatus} to ${newStatus}` };
    }

    // Additional validation for specific transitions
    if (newStatus === 'Approved') {
      const validation = validateMissionForApproval(missionId);
      if (!validation.valid) {
        return { allowed: false, reason: `Mission not ready for approval: ${validation.errors.join(', ')}` };
      }
    }

    if (newStatus === 'Locked') {
      const validation = validateMissionForCompletion(missionId);
      if (!validation.valid) {
        return { allowed: false, reason: `Mission not ready for locking: ${validation.errors.join(', ')}` };
      }
    }

    return { allowed: true };
  }, [getMissionById, validateMissionForApproval, validateMissionForCompletion]);

  // Transition mission status
  const transitionMissionStatus = useCallback((missionId: string, newStatus: MissionStatus, signature?: string) => {
    const validation = canTransitionToStatus(missionId, newStatus);
    if (!validation.allowed) {
      throw new Error(validation.reason || 'Transition not allowed');
    }

    const updates: Partial<MissionRecord> = { status: newStatus };

    // Add signature and timestamp for key transitions
    if (newStatus === 'Approved' && signature) {
      updates.approvals = {
        ...getMissionById(missionId)?.approvals,
        approvedBy: signature,
        approvedAt: new Date().toISOString(),
      };
    }

    if (newStatus === 'Locked' && signature) {
      updates.approvals = {
        ...getMissionById(missionId)?.approvals,
        finalApprovedBy: signature,
        finalApprovedAt: new Date().toISOString(),
        locked: true,
      };
    }

    updateMission(missionId, updates);
  }, [canTransitionToStatus, getMissionById, updateMission]);

  // Component update functions
  const updateJSA = useCallback((missionId: string, jsa: JSARecord) => {
    updateMission(missionId, { jsaRecord: jsa });
  }, [updateMission]);

  const addBoundaryFile = useCallback((missionId: string, boundary: BoundaryFile) => {
    const mission = getMissionById(missionId);
    if (mission) {
      const updatedBoundaries = [...mission.boundaries, boundary];
      updateMission(missionId, { boundaries: updatedBoundaries });
    }
  }, [getMissionById, updateMission]);

  const updateFlightPlan = useCallback((missionId: string, flightPlan: Partial<MissionRecord['flightPlan']>) => {
    const mission = getMissionById(missionId);
    if (mission) {
      updateMission(missionId, {
        flightPlan: { ...mission.flightPlan, ...flightPlan }
      });
    }
  }, [getMissionById, updateMission]);

  const updateFlightExecution = useCallback((missionId: string, execution: Partial<MissionRecord['flightExecution']>) => {
    const mission = getMissionById(missionId);
    if (mission) {
      updateMission(missionId, {
        flightExecution: { ...mission.flightExecution, ...execution }
      });
    }
  }, [getMissionById, updateMission]);

  // Filtering and search functions
  const getMissionsByStatus = useCallback((status: MissionStatus) => {
    return missions.filter(m => m.status === status);
  }, [missions]);

  const getMissionsByDate = useCallback((startDate: string, endDate: string) => {
    return missions.filter(m => m.scheduledDate >= startDate && m.scheduledDate <= endDate);
  }, [missions]);

  const searchMissions = useCallback((query: string) => {
    const lowerQuery = query.toLowerCase();
    return missions.filter(m =>
      m.missionName.toLowerCase().includes(lowerQuery) ||
      m.description.toLowerCase().includes(lowerQuery) ||
      m.location.siteName.toLowerCase().includes(lowerQuery)
    );
  }, [missions]);

  // Load missions on mount
  useEffect(() => {
    loadMissions();
  }, [loadMissions]);

  return (
    <MissionContext.Provider
      value={{
        missions,
        currentMission,
        isLoading,
        createMission,
        updateMission,
        deleteMission,
        getMissionById,
        setCurrentMission,
        canTransitionToStatus,
        transitionMissionStatus,
        updateJSA,
        addBoundaryFile,
        updateFlightPlan,
        updateFlightExecution,
        getMissionsByStatus,
        getMissionsByDate,
        searchMissions,
        validateMissionForApproval,
        validateMissionForCompletion,
        saveMissions,
        loadMissions,
      }}
    >
      {children}
    </MissionContext.Provider>
  );
}

export function useMission() {
  const context = useContext(MissionContext);
  if (!context) {
    throw new Error('useMission must be used within MissionProvider');
  }
  return context;
}
```

**Step 3: Test by manual verification**

Manual test: Check context creation and basic mission operations

**Step 4: Commit**

```bash
git add src/types/mission.ts src/contexts/MissionContext.tsx
git commit -m "feat: add mission state management with 5-phase workflow"
```

---

### Task 3: Aircraft Management UI Components

**Files:**
- Create: `src/pages/AircraftManagement.tsx`
- Create: `src/components/AircraftForm.tsx`
- Create: `src/components/EquipmentKitForm.tsx`

**Step 1: Create aircraft management page**

Create `src/pages/AircraftManagement.tsx`:

```typescript
import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  FlightTakeoff as AircraftIcon,
  Build as KitIcon,
} from '@mui/icons-material';
import { useAircraft } from '../contexts/AircraftContext';
import AircraftForm from '../components/AircraftForm';
import EquipmentKitForm from '../components/EquipmentKitForm';
import { Aircraft, EquipmentKit } from '../types/aircraft';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

export default function AircraftManagement() {
  const {
    aircraft,
    equipmentKits,
    addAircraft,
    updateAircraft,
    removeAircraft,
    addEquipmentKit,
    updateEquipmentKit,
    removeEquipmentKit,
    saveData,
  } = useAircraft();

  const [tabValue, setTabValue] = useState(0);
  const [aircraftDialogOpen, setAircraftDialogOpen] = useState(false);
  const [kitDialogOpen, setKitDialogOpen] = useState(false);
  const [editingAircraft, setEditingAircraft] = useState<Aircraft | null>(null);
  const [editingKit, setEditingKit] = useState<EquipmentKit | null>(null);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleAddAircraft = () => {
    setEditingAircraft(null);
    setAircraftDialogOpen(true);
  };

  const handleEditAircraft = (aircraft: Aircraft) => {
    setEditingAircraft(aircraft);
    setAircraftDialogOpen(true);
  };

  const handleDeleteAircraft = (aircraftId: string) => {
    if (window.confirm('Are you sure you want to delete this aircraft?')) {
      removeAircraft(aircraftId);
      saveData();
    }
  };

  const handleAddKit = () => {
    setEditingKit(null);
    setKitDialogOpen(true);
  };

  const handleEditKit = (kit: EquipmentKit) => {
    setEditingKit(kit);
    setKitDialogOpen(true);
  };

  const handleDeleteKit = (kitId: string) => {
    if (window.confirm('Are you sure you want to delete this equipment kit?')) {
      removeEquipmentKit(kitId);
      saveData();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Available':
        return 'success';
      case 'Maintenance':
        return 'warning';
      case 'In Use':
        return 'info';
      case 'Retired':
        return 'error';
      default:
        return 'default';
    }
  };

  const getKitTypeColor = (type: string) => {
    switch (type) {
      case 'Spray':
        return 'primary';
      case 'Survey':
        return 'secondary';
      case 'Inspection':
        return 'info';
      case 'Custom':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Aircraft & Equipment Management
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage your aircraft fleet and equipment configurations for mission planning
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab
            label={`Aircraft (${aircraft.length})`}
            icon={<AircraftIcon />}
            iconPosition="start"
          />
          <Tab
            label={`Equipment Kits (${equipmentKits.length})`}
            icon={<KitIcon />}
            iconPosition="start"
          />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="h6">Aircraft Fleet</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddAircraft}
          >
            Add Aircraft
          </Button>
        </Box>

        {aircraft.length === 0 ? (
          <Alert severity="info">
            No aircraft registered. Add your first aircraft to get started.
          </Alert>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Registration</TableCell>
                  <TableCell>Make & Model</TableCell>
                  <TableCell>MTOW</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Next Maintenance</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {aircraft.map((ac) => (
                  <TableRow key={ac.id}>
                    <TableCell>
                      <Typography variant="subtitle2" fontWeight="bold">
                        {ac.registration}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {ac.manufacturer} {ac.model}
                    </TableCell>
                    <TableCell>{ac.mtow} kg</TableCell>
                    <TableCell>
                      <Chip
                        label={ac.status}
                        color={getStatusColor(ac.status) as any}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {ac.nextMaintenanceDue ?
                        new Date(ac.nextMaintenanceDue).toLocaleDateString() :
                        'Not scheduled'
                      }
                    </TableCell>
                    <TableCell>
                      <IconButton onClick={() => handleEditAircraft(ac)} size="small">
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        onClick={() => handleDeleteAircraft(ac.id)}
                        size="small"
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="h6">Equipment Kits</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddKit}
          >
            Add Equipment Kit
          </Button>
        </Box>

        {equipmentKits.length === 0 ? (
          <Alert severity="info">
            No equipment kits configured. Add your first kit to get started.
          </Alert>
        ) : (
          <Grid container spacing={3}>
            {equipmentKits.map((kit) => (
              <Grid size={{ xs: 12, md: 6, lg: 4 }} key={kit.id}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                      <Typography variant="h6">{kit.name}</Typography>
                      <Chip
                        label={kit.type}
                        color={getKitTypeColor(kit.type) as any}
                        size="small"
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {kit.description}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Weight: {kit.specifications.weight} kg
                    </Typography>
                    <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                      <IconButton onClick={() => handleEditKit(kit)} size="small">
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        onClick={() => handleDeleteKit(kit.id)}
                        size="small"
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </TabPanel>

      {/* Aircraft Form Dialog */}
      <Dialog
        open={aircraftDialogOpen}
        onClose={() => setAircraftDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {editingAircraft ? 'Edit Aircraft' : 'Add New Aircraft'}
        </DialogTitle>
        <DialogContent>
          <AircraftForm
            aircraft={editingAircraft}
            onSave={(aircraftData) => {
              if (editingAircraft) {
                updateAircraft(editingAircraft.id, aircraftData);
              } else {
                addAircraft(aircraftData);
              }
              saveData();
              setAircraftDialogOpen(false);
            }}
            onCancel={() => setAircraftDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Equipment Kit Form Dialog */}
      <Dialog
        open={kitDialogOpen}
        onClose={() => setKitDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {editingKit ? 'Edit Equipment Kit' : 'Add New Equipment Kit'}
        </DialogTitle>
        <DialogContent>
          <EquipmentKitForm
            equipmentKit={editingKit}
            onSave={(kitData) => {
              if (editingKit) {
                updateEquipmentKit(editingKit.id, kitData);
              } else {
                addEquipmentKit(kitData);
              }
              saveData();
              setKitDialogOpen(false);
            }}
            onCancel={() => setKitDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Box>
  );
}
```

**Step 2: Create aircraft form component**

Create `src/components/AircraftForm.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Typography,
  Divider,
} from '@mui/material';
import { Aircraft } from '../types/aircraft';

interface AircraftFormProps {
  aircraft?: Aircraft | null;
  onSave: (data: Omit<Aircraft, 'id' | 'createdAt' | 'lastModified'>) => void;
  onCancel: () => void;
}

export default function AircraftForm({ aircraft, onSave, onCancel }: AircraftFormProps) {
  const [formData, setFormData] = useState({
    registration: '',
    manufacturer: '',
    model: '',
    serialNumber: '',
    mtow: 0,
    maxAltitude: 400,
    maxWindSpeed: 15,
    lastMaintenance: '',
    nextMaintenanceDue: '',
    insurancePolicyNumber: '',
    insuranceExpiry: '',
    status: 'Available' as Aircraft['status'],
    assignedKits: [] as string[],
    operationalLimits: {
      maxPayload: 0,
      maxFlightTime: 30,
      maxWindSpeed: 15,
    },
    documentation: {
      rcCertificate: '',
      maintenanceLog: '',
      operationsManual: '',
    },
  });

  useEffect(() => {
    if (aircraft) {
      setFormData({
        registration: aircraft.registration,
        manufacturer: aircraft.manufacturer,
        model: aircraft.model,
        serialNumber: aircraft.serialNumber,
        mtow: aircraft.mtow,
        maxAltitude: aircraft.maxAltitude,
        maxWindSpeed: aircraft.maxWindSpeed,
        lastMaintenance: aircraft.lastMaintenance,
        nextMaintenanceDue: aircraft.nextMaintenanceDue,
        insurancePolicyNumber: aircraft.insurancePolicyNumber,
        insuranceExpiry: aircraft.insuranceExpiry,
        status: aircraft.status,
        assignedKits: aircraft.assignedKits,
        operationalLimits: aircraft.operationalLimits,
        documentation: aircraft.documentation,
      });
    }
  }, [aircraft]);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNestedChange = (parent: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [parent]: { ...(prev as any)[parent], [field]: value }
    }));
  };

  const handleSubmit = () => {
    onSave(formData);
  };

  const isValid = formData.registration && formData.manufacturer && formData.model;

  return (
    <Box sx={{ pt: 2 }}>
      <Grid container spacing={3}>
        {/* Basic Information */}
        <Grid size={{ xs: 12 }}>
          <Typography variant="h6" gutterBottom>Basic Information</Typography>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Aircraft Registration *"
            value={formData.registration}
            onChange={(e) => handleChange('registration', e.target.value)}
            placeholder="e.g., VH-ABC"
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={formData.status}
              onChange={(e) => handleChange('status', e.target.value)}
            >
              <MenuItem value="Available">Available</MenuItem>
              <MenuItem value="Maintenance">Maintenance</MenuItem>
              <MenuItem value="In Use">In Use</MenuItem>
              <MenuItem value="Retired">Retired</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Manufacturer *"
            value={formData.manufacturer}
            onChange={(e) => handleChange('manufacturer', e.target.value)}
            placeholder="e.g., DJI, Freefly"
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Model *"
            value={formData.model}
            onChange={(e) => handleChange('model', e.target.value)}
            placeholder="e.g., Agras T40"
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Serial Number"
            value={formData.serialNumber}
            onChange={(e) => handleChange('serialNumber', e.target.value)}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="MTOW (kg)"
            type="number"
            value={formData.mtow || ''}
            onChange={(e) => handleChange('mtow', parseFloat(e.target.value) || 0)}
          />
        </Grid>

        {/* Operational Limits */}
        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 2 }} />
          <Typography variant="h6" gutterBottom>Operational Limits</Typography>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            label="Max Altitude (ft AGL)"
            type="number"
            value={formData.maxAltitude || ''}
            onChange={(e) => handleChange('maxAltitude', parseFloat(e.target.value) || 0)}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            label="Max Payload (kg)"
            type="number"
            value={formData.operationalLimits.maxPayload || ''}
            onChange={(e) => handleNestedChange('operationalLimits', 'maxPayload', parseFloat(e.target.value) || 0)}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            label="Max Flight Time (min)"
            type="number"
            value={formData.operationalLimits.maxFlightTime || ''}
            onChange={(e) => handleNestedChange('operationalLimits', 'maxFlightTime', parseFloat(e.target.value) || 0)}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <TextField
            fullWidth
            label="Max Wind Speed (kts)"
            type="number"
            value={formData.operationalLimits.maxWindSpeed || ''}
            onChange={(e) => handleNestedChange('operationalLimits', 'maxWindSpeed', parseFloat(e.target.value) || 0)}
          />
        </Grid>

        {/* Maintenance & Insurance */}
        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 2 }} />
          <Typography variant="h6" gutterBottom>Maintenance & Insurance</Typography>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Last Maintenance"
            type="date"
            value={formData.lastMaintenance}
            onChange={(e) => handleChange('lastMaintenance', e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Next Maintenance Due"
            type="date"
            value={formData.nextMaintenanceDue}
            onChange={(e) => handleChange('nextMaintenanceDue', e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Insurance Policy Number"
            value={formData.insurancePolicyNumber}
            onChange={(e) => handleChange('insurancePolicyNumber', e.target.value)}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Insurance Expiry"
            type="date"
            value={formData.insuranceExpiry}
            onChange={(e) => handleChange('insuranceExpiry', e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>

        {/* Form Actions */}
        <Grid size={{ xs: 12 }}>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
            <Button onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!isValid}
            >
              {aircraft ? 'Update' : 'Add'} Aircraft
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
```

**Step 3: Create equipment kit form component**

Create `src/components/EquipmentKitForm.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Typography,
  Divider,
  IconButton,
  Paper,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { EquipmentKit } from '../types/aircraft';

interface EquipmentKitFormProps {
  equipmentKit?: EquipmentKit | null;
  onSave: (data: Omit<EquipmentKit, 'id' | 'createdAt' | 'lastModified'>) => void;
  onCancel: () => void;
}

export default function EquipmentKitForm({ equipmentKit, onSave, onCancel }: EquipmentKitFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    type: 'Spray' as EquipmentKit['type'],
    description: '',
    specifications: {
      weight: 0,
      dimensions: '',
      powerRequirement: 0,
      dataStorage: '',
    },
    components: [
      { name: '', model: '', serialNumber: '', calibrationDue: '' }
    ],
    operationalData: {
      setupTime: 15,
      maxOperationTime: 30,
      weatherLimits: {
        maxWindSpeed: 15,
        minVisibility: 3,
        maxPrecipitation: 'Light Rain',
      },
    },
    financialData: {
      purchasePrice: 0,
      depreciationRate: 0.1,
      maintenanceCostPerHour: 0,
      operationalCostPerHour: 0,
    },
    compatibleAircraft: [] as string[],
  });

  useEffect(() => {
    if (equipmentKit) {
      setFormData({
        name: equipmentKit.name,
        type: equipmentKit.type,
        description: equipmentKit.description,
        specifications: equipmentKit.specifications,
        components: equipmentKit.components.length > 0 ? equipmentKit.components : [{ name: '', model: '', serialNumber: '', calibrationDue: '' }],
        operationalData: equipmentKit.operationalData,
        financialData: equipmentKit.financialData,
        compatibleAircraft: equipmentKit.compatibleAircraft,
      });
    }
  }, [equipmentKit]);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNestedChange = (parent: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [parent]: { ...(prev as any)[parent], [field]: value }
    }));
  };

  const handleDeepNestedChange = (parent: string, subParent: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [parent]: {
        ...(prev as any)[parent],
        [subParent]: { ...(prev as any)[parent][subParent], [field]: value }
      }
    }));
  };

  const addComponent = () => {
    setFormData(prev => ({
      ...prev,
      components: [...prev.components, { name: '', model: '', serialNumber: '', calibrationDue: '' }]
    }));
  };

  const removeComponent = (index: number) => {
    setFormData(prev => ({
      ...prev,
      components: prev.components.filter((_, i) => i !== index)
    }));
  };

  const updateComponent = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      components: prev.components.map((comp, i) =>
        i === index ? { ...comp, [field]: value } : comp
      )
    }));
  };

  const handleSubmit = () => {
    onSave(formData);
  };

  const isValid = formData.name && formData.type;

  return (
    <Box sx={{ pt: 2 }}>
      <Grid container spacing={3}>
        {/* Basic Information */}
        <Grid size={{ xs: 12 }}>
          <Typography variant="h6" gutterBottom>Basic Information</Typography>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <TextField
            fullWidth
            label="Kit Name *"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="e.g., Spray Kit - Large Tank"
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <FormControl fullWidth>
            <InputLabel>Kit Type *</InputLabel>
            <Select
              value={formData.type}
              onChange={(e) => handleChange('type', e.target.value)}
            >
              <MenuItem value="Spray">Spray</MenuItem>
              <MenuItem value="Survey">Survey</MenuItem>
              <MenuItem value="Inspection">Inspection</MenuItem>
              <MenuItem value="Custom">Custom</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <TextField
            fullWidth
            label="Description"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            multiline
            rows={3}
            placeholder="Describe the kit's purpose and capabilities"
          />
        </Grid>

        {/* Specifications */}
        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 2 }} />
          <Typography variant="h6" gutterBottom>Specifications</Typography>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Weight (kg)"
            type="number"
            value={formData.specifications.weight || ''}
            onChange={(e) => handleNestedChange('specifications', 'weight', parseFloat(e.target.value) || 0)}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Dimensions (L x W x H)"
            value={formData.specifications.dimensions}
            onChange={(e) => handleNestedChange('specifications', 'dimensions', e.target.value)}
            placeholder="e.g., 50cm x 30cm x 20cm"
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Power Requirement (watts)"
            type="number"
            value={formData.specifications.powerRequirement || ''}
            onChange={(e) => handleNestedChange('specifications', 'powerRequirement', parseFloat(e.target.value) || 0)}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Data Storage"
            value={formData.specifications.dataStorage || ''}
            onChange={(e) => handleNestedChange('specifications', 'dataStorage', e.target.value)}
            placeholder="e.g., 128GB SD Card"
          />
        </Grid>

        {/* Components */}
        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Components</Typography>
            <Button
              startIcon={<AddIcon />}
              onClick={addComponent}
              size="small"
            >
              Add Component
            </Button>
          </Box>
        </Grid>

        {formData.components.map((component, index) => (
          <Grid size={{ xs: 12 }} key={index}>
            <Paper sx={{ p: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle2">Component {index + 1}</Typography>
                {formData.components.length > 1 && (
                  <IconButton
                    onClick={() => removeComponent(index)}
                    size="small"
                    color="error"
                  >
                    <DeleteIcon />
                  </IconButton>
                )}
              </Box>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Component Name"
                    value={component.name}
                    onChange={(e) => updateComponent(index, 'name', e.target.value)}
                    placeholder="e.g., Tank, Camera, Sensor"
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Model"
                    value={component.model}
                    onChange={(e) => updateComponent(index, 'model', e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Serial Number"
                    value={component.serialNumber || ''}
                    onChange={(e) => updateComponent(index, 'serialNumber', e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Calibration Due"
                    type="date"
                    value={component.calibrationDue || ''}
                    onChange={(e) => updateComponent(index, 'calibrationDue', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        ))}

        {/* Operational Data */}
        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 2 }} />
          <Typography variant="h6" gutterBottom>Operational Parameters</Typography>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            label="Setup Time (minutes)"
            type="number"
            value={formData.operationalData.setupTime || ''}
            onChange={(e) => handleNestedChange('operationalData', 'setupTime', parseFloat(e.target.value) || 0)}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            label="Max Operation Time (minutes)"
            type="number"
            value={formData.operationalData.maxOperationTime || ''}
            onChange={(e) => handleNestedChange('operationalData', 'maxOperationTime', parseFloat(e.target.value) || 0)}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            label="Max Wind Speed (kts)"
            type="number"
            value={formData.operationalData.weatherLimits.maxWindSpeed || ''}
            onChange={(e) => handleDeepNestedChange('operationalData', 'weatherLimits', 'maxWindSpeed', parseFloat(e.target.value) || 0)}
          />
        </Grid>

        {/* Financial Data */}
        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 2 }} />
          <Typography variant="h6" gutterBottom>Financial Information</Typography>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Purchase Price ($)"
            type="number"
            value={formData.financialData.purchasePrice || ''}
            onChange={(e) => handleNestedChange('financialData', 'purchasePrice', parseFloat(e.target.value) || 0)}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Depreciation Rate (/year)"
            type="number"
            step="0.01"
            value={formData.financialData.depreciationRate || ''}
            onChange={(e) => handleNestedChange('financialData', 'depreciationRate', parseFloat(e.target.value) || 0)}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Maintenance Cost ($/hour)"
            type="number"
            value={formData.financialData.maintenanceCostPerHour || ''}
            onChange={(e) => handleNestedChange('financialData', 'maintenanceCostPerHour', parseFloat(e.target.value) || 0)}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            label="Operational Cost ($/hour)"
            type="number"
            value={formData.financialData.operationalCostPerHour || ''}
            onChange={(e) => handleNestedChange('financialData', 'operationalCostPerHour', parseFloat(e.target.value) || 0)}
          />
        </Grid>

        {/* Form Actions */}
        <Grid size={{ xs: 12 }}>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
            <Button onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!isValid}
            >
              {equipmentKit ? 'Update' : 'Add'} Equipment Kit
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
```

**Step 4: Add route to App.tsx**

Modify `src/App.tsx` to add aircraft management route:

```typescript
// Add import
import AircraftManagement from './pages/AircraftManagement';
import { AircraftProvider } from './contexts/AircraftContext';

// Update the UserLicenseProvider wrapper to include AircraftProvider
<ProtectedRoute>
  <UserLicenseProvider>
    <AircraftProvider>
      <Layout />
    </AircraftProvider>
  </UserLicenseProvider>
</ProtectedRoute>

// Add route
<Route path="/aircraft" element={<AircraftManagement />} />
```

**Step 5: Test by manual verification**

Navigate to `/aircraft` and test adding/editing aircraft and kits

**Step 6: Commit**

```bash
git add src/pages/AircraftManagement.tsx src/components/AircraftForm.tsx src/components/EquipmentKitForm.tsx src/App.tsx
git commit -m "feat: add aircraft and equipment kit management UI"
```

---

### Task 4: JSA System with Triple Dropdown

**Files:**
- Create: `src/components/JSASystem.tsx`
- Create: `src/components/JSAStandardTemplate.tsx`
- Create: `src/components/JSAComprehensiveBuilder.tsx`
- Create: `src/components/JSAIndustrySpecific.tsx`

**Step 1: Create main JSA system component**

Create `src/components/JSASystem.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Alert,
  Card,
  CardContent,
} from '@mui/material';
import JSAStandardTemplate from './JSAStandardTemplate';
import JSAComprehensiveBuilder from './JSAComprehensiveBuilder';
import JSAIndustrySpecific from './JSAIndustrySpecific';
import { JSARecord } from '../types/mission';

interface JSASystemProps {
  existingJSA?: JSARecord;
  onJSAComplete: (jsa: JSARecord) => void;
  disabled?: boolean;
}

type JSAType = 'Standard' | 'Comprehensive' | 'Industry-Specific';

export default function JSASystem({ existingJSA, onJSAComplete, disabled }: JSASystemProps) {
  const [selectedType, setSelectedType] = useState<JSAType | ''>('');
  const [industryType, setIndustryType] = useState<'Crop Spraying' | 'Surveying' | 'Inspections' | ''>('');
  const [currentJSA, setCurrentJSA] = useState<JSARecord | null>(existingJSA || null);

  useEffect(() => {
    if (existingJSA) {
      setSelectedType(existingJSA.jsaType);
      if (existingJSA.industryType) {
        setIndustryType(existingJSA.industryType);
      }
      setCurrentJSA(existingJSA);
    }
  }, [existingJSA]);

  const handleTypeChange = (type: JSAType) => {
    setSelectedType(type);
    setCurrentJSA(null); // Reset JSA when changing types
    if (type !== 'Industry-Specific') {
      setIndustryType('');
    }
  };

  const handleIndustryTypeChange = (industry: typeof industryType) => {
    setIndustryType(industry);
    setCurrentJSA(null); // Reset JSA when changing industry
  };

  const handleJSAChange = (jsa: JSARecord) => {
    setCurrentJSA(jsa);
    onJSAComplete(jsa);
  };

  const renderJSATypeDescription = (type: JSAType) => {
    switch (type) {
      case 'Standard':
        return 'Pre-defined hazard categories with risk ratings and standard mitigation controls. Quick completion for routine operations.';
      case 'Comprehensive':
        return 'Full custom JSA creation with unlimited hazards, detailed consequence analysis, and multiple mitigation strategies per hazard.';
      case 'Industry-Specific':
        return 'Templates tailored to different operation types with pre-populated common hazards for each industry.';
      default:
        return '';
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Job Safety Analysis (JSA)
      </Typography>

      {/* JSA Type Selection */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>JSA Type *</InputLabel>
            <Select
              value={selectedType}
              onChange={(e) => handleTypeChange(e.target.value as JSAType)}
              disabled={disabled}
            >
              <MenuItem value="Standard">Standard JSA Template</MenuItem>
              <MenuItem value="Comprehensive">Comprehensive JSA Builder</MenuItem>
              <MenuItem value="Industry-Specific">Industry-Specific JSA</MenuItem>
            </Select>
          </FormControl>

          {selectedType && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>{selectedType} JSA:</strong> {renderJSATypeDescription(selectedType)}
              </Typography>
            </Alert>
          )}

          {/* Industry Type Selection for Industry-Specific JSA */}
          {selectedType === 'Industry-Specific' && (
            <FormControl fullWidth>
              <InputLabel>Industry Type *</InputLabel>
              <Select
                value={industryType}
                onChange={(e) => handleIndustryTypeChange(e.target.value as typeof industryType)}
                disabled={disabled}
              >
                <MenuItem value="Crop Spraying">Crop Spraying</MenuItem>
                <MenuItem value="Surveying">Surveying</MenuItem>
                <MenuItem value="Inspections">Inspections</MenuItem>
              </Select>
            </FormControl>
          )}
        </CardContent>
      </Card>

      {/* Render appropriate JSA component based on selection */}
      {selectedType === 'Standard' && (
        <JSAStandardTemplate
          existingJSA={currentJSA}
          onJSAChange={handleJSAChange}
          disabled={disabled}
        />
      )}

      {selectedType === 'Comprehensive' && (
        <JSAComprehensiveBuilder
          existingJSA={currentJSA}
          onJSAChange={handleJSAChange}
          disabled={disabled}
        />
      )}

      {selectedType === 'Industry-Specific' && industryType && (
        <JSAIndustrySpecific
          industryType={industryType}
          existingJSA={currentJSA}
          onJSAChange={handleJSAChange}
          disabled={disabled}
        />
      )}
    </Box>
  );
}
```

**Step 2: Create standard JSA template component**

Create `src/components/JSAStandardTemplate.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Typography,
  Chip,
  Alert,
} from '@mui/material';
import { JSARecord } from '../types/mission';
import { useAuth } from '../contexts/AuthContext';

interface JSAStandardTemplateProps {
  existingJSA?: JSARecord | null;
  onJSAChange: (jsa: JSARecord) => void;
  disabled?: boolean;
}

const STANDARD_HAZARDS = [
  {
    id: 'weather',
    hazard: 'Adverse Weather Conditions',
    defaultLikelihood: 'Medium' as const,
    defaultConsequence: 'Major' as const,
    defaultMitigation: 'Monitor weather conditions, establish wind and visibility limits, abort mission if conditions deteriorate',
  },
  {
    id: 'obstacles',
    hazard: 'Collision with Obstacles (Trees, Power Lines, Buildings)',
    defaultLikelihood: 'Medium' as const,
    defaultConsequence: 'Catastrophic' as const,
    defaultMitigation: 'Conduct thorough site survey, maintain minimum clearance distances, use visual observers',
  },
  {
    id: 'wildlife',
    hazard: 'Wildlife Interference (Birds, Bats)',
    defaultLikelihood: 'Low' as const,
    defaultConsequence: 'Moderate' as const,
    defaultMitigation: 'Monitor for wildlife activity, avoid known nesting/roosting areas, maintain awareness during flight',
  },
  {
    id: 'mechanical',
    hazard: 'Mechanical Failure During Flight',
    defaultLikelihood: 'Low' as const,
    defaultConsequence: 'Major' as const,
    defaultMitigation: 'Complete pre-flight checks, maintain current maintenance schedule, plan emergency landing procedures',
  },
  {
    id: 'human',
    hazard: 'Human Error in Flight Operations',
    defaultLikelihood: 'Medium' as const,
    defaultConsequence: 'Major' as const,
    defaultMitigation: 'Follow standard operating procedures, maintain current pilot training, use checklists and verification',
  },
  {
    id: 'airspace',
    hazard: 'Unauthorized Airspace Entry',
    defaultLikelihood: 'Low' as const,
    defaultConsequence: 'Major' as const,
    defaultMitigation: 'Check NOTAM, obtain required airspace authorizations, program geofencing boundaries',
  },
  {
    id: 'ground',
    hazard: 'Ground Personnel Safety (Takeoff/Landing)',
    defaultLikelihood: 'Medium' as const,
    defaultConsequence: 'Moderate' as const,
    defaultMitigation: 'Establish safety zones, brief ground personnel, maintain clear communications',
  },
  {
    id: 'battery',
    hazard: 'Battery Failure or Insufficient Power',
    defaultLikelihood: 'Low' as const,
    defaultConsequence: 'Major' as const,
    defaultMitigation: 'Check battery condition, plan for battery life margins, carry spare batteries',
  },
];

export default function JSAStandardTemplate({ existingJSA, onJSAChange, disabled }: JSAStandardTemplateProps) {
  const { user } = useAuth();
  const [hazards, setHazards] = useState(() => {
    if (existingJSA?.hazards) {
      return existingJSA.hazards;
    }
    return STANDARD_HAZARDS.map(h => ({
      id: h.id,
      hazard: h.hazard,
      likelihood: h.defaultLikelihood,
      consequence: h.defaultConsequence,
      riskLevel: calculateRiskLevel(h.defaultLikelihood, h.defaultConsequence),
      mitigation: h.defaultMitigation,
      responsible: user?.name || '',
      dueDate: '',
    }));
  });

  function calculateRiskLevel(likelihood: string, consequence: string): 'Low' | 'Medium' | 'High' | 'Extreme' {
    const matrix: Record<string, Record<string, 'Low' | 'Medium' | 'High' | 'Extreme'>> = {
      'Low': { 'Minor': 'Low', 'Moderate': 'Low', 'Major': 'Medium', 'Catastrophic': 'High' },
      'Medium': { 'Minor': 'Low', 'Moderate': 'Medium', 'Major': 'High', 'Catastrophic': 'Extreme' },
      'High': { 'Minor': 'Medium', 'Moderate': 'High', 'Major': 'Extreme', 'Catastrophic': 'Extreme' },
    };
    return matrix[likelihood]?.[consequence] || 'Low';
  }

  const updateHazard = (id: string, field: string, value: string) => {
    setHazards(prev => prev.map(h => {
      if (h.id === id) {
        const updated = { ...h, [field]: value };
        // Recalculate risk level if likelihood or consequence changed
        if (field === 'likelihood' || field === 'consequence') {
          updated.riskLevel = calculateRiskLevel(updated.likelihood, updated.consequence);
        }
        return updated;
      }
      return h;
    }));
  };

  const getOverallRiskLevel = (): 'Low' | 'Medium' | 'High' | 'Extreme' => {
    const riskLevels = hazards.map(h => h.riskLevel);
    if (riskLevels.includes('Extreme')) return 'Extreme';
    if (riskLevels.includes('High')) return 'High';
    if (riskLevels.includes('Medium')) return 'Medium';
    return 'Low';
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Low': return 'success';
      case 'Medium': return 'warning';
      case 'High': return 'error';
      case 'Extreme': return 'error';
      default: return 'default';
    }
  };

  // Update parent component whenever hazards change
  useEffect(() => {
    const overallRiskLevel = getOverallRiskLevel();
    const jsa: JSARecord = {
      jsaType: 'Standard',
      hazards,
      overallRiskLevel,
      approvalRequired: ['High', 'Extreme'].includes(overallRiskLevel),
      completedBy: user?.name || '',
      completedAt: new Date().toISOString(),
    };
    onJSAChange(jsa);
  }, [hazards, user, onJSAChange]);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Standard JSA Template
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        Complete the risk assessment for each standard hazard. Risk levels are automatically calculated using the likelihood × consequence matrix.
      </Alert>

      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Hazard</TableCell>
              <TableCell>Likelihood</TableCell>
              <TableCell>Consequence</TableCell>
              <TableCell>Risk Level</TableCell>
              <TableCell>Mitigation Strategy</TableCell>
              <TableCell>Responsible</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {hazards.map((hazard) => (
              <TableRow key={hazard.id}>
                <TableCell sx={{ minWidth: 200 }}>
                  <Typography variant="body2" fontWeight="medium">
                    {hazard.hazard}
                  </Typography>
                </TableCell>
                <TableCell sx={{ minWidth: 120 }}>
                  <FormControl size="small" fullWidth>
                    <Select
                      value={hazard.likelihood}
                      onChange={(e) => updateHazard(hazard.id, 'likelihood', e.target.value)}
                      disabled={disabled}
                    >
                      <MenuItem value="Low">Low</MenuItem>
                      <MenuItem value="Medium">Medium</MenuItem>
                      <MenuItem value="High">High</MenuItem>
                    </Select>
                  </FormControl>
                </TableCell>
                <TableCell sx={{ minWidth: 120 }}>
                  <FormControl size="small" fullWidth>
                    <Select
                      value={hazard.consequence}
                      onChange={(e) => updateHazard(hazard.id, 'consequence', e.target.value)}
                      disabled={disabled}
                    >
                      <MenuItem value="Minor">Minor</MenuItem>
                      <MenuItem value="Moderate">Moderate</MenuItem>
                      <MenuItem value="Major">Major</MenuItem>
                      <MenuItem value="Catastrophic">Catastrophic</MenuItem>
                    </Select>
                  </FormControl>
                </TableCell>
                <TableCell sx={{ minWidth: 100 }}>
                  <Chip
                    label={hazard.riskLevel}
                    color={getRiskColor(hazard.riskLevel) as any}
                    size="small"
                    variant="filled"
                  />
                </TableCell>
                <TableCell sx={{ minWidth: 300 }}>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    value={hazard.mitigation}
                    onChange={(e) => updateHazard(hazard.id, 'mitigation', e.target.value)}
                    disabled={disabled}
                    placeholder="Describe mitigation strategies..."
                    size="small"
                  />
                </TableCell>
                <TableCell sx={{ minWidth: 150 }}>
                  <TextField
                    fullWidth
                    value={hazard.responsible || ''}
                    onChange={(e) => updateHazard(hazard.id, 'responsible', e.target.value)}
                    disabled={disabled}
                    placeholder="Responsible person"
                    size="small"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Overall Risk Assessment */}
      <Alert
        severity={getOverallRiskLevel() === 'Low' ? 'success' : getOverallRiskLevel() === 'Medium' ? 'warning' : 'error'}
      >
        <Typography variant="body2">
          <strong>Overall Risk Level: {getOverallRiskLevel()}</strong>
          {['High', 'Extreme'].includes(getOverallRiskLevel()) && (
            <> - Chief Remote Pilot approval required before mission commencement</>
          )}
        </Typography>
      </Alert>
    </Box>
  );
}
```

**Step 3: Create comprehensive JSA builder component**

Create `src/components/JSAComprehensiveBuilder.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Typography,
  Chip,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { JSARecord } from '../types/mission';
import { useAuth } from '../contexts/AuthContext';

interface JSAComprehensiveBuilderProps {
  existingJSA?: JSARecord | null;
  onJSAChange: (jsa: JSARecord) => void;
  disabled?: boolean;
}

interface HazardFormData {
  hazard: string;
  likelihood: 'Low' | 'Medium' | 'High';
  consequence: 'Minor' | 'Moderate' | 'Major' | 'Catastrophic';
  mitigation: string;
  responsible: string;
  dueDate: string;
}

export default function JSAComprehensiveBuilder({ existingJSA, onJSAChange, disabled }: JSAComprehensiveBuilderProps) {
  const { user } = useAuth();
  const [hazards, setHazards] = useState(() => existingJSA?.hazards || []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState<HazardFormData>({
    hazard: '',
    likelihood: 'Low',
    consequence: 'Minor',
    mitigation: '',
    responsible: user?.name || '',
    dueDate: '',
  });

  function calculateRiskLevel(likelihood: string, consequence: string): 'Low' | 'Medium' | 'High' | 'Extreme' {
    const matrix: Record<string, Record<string, 'Low' | 'Medium' | 'High' | 'Extreme'>> = {
      'Low': { 'Minor': 'Low', 'Moderate': 'Low', 'Major': 'Medium', 'Catastrophic': 'High' },
      'Medium': { 'Minor': 'Low', 'Moderate': 'Medium', 'Major': 'High', 'Catastrophic': 'Extreme' },
      'High': { 'Minor': 'Medium', 'Moderate': 'High', 'Major': 'Extreme', 'Catastrophic': 'Extreme' },
    };
    return matrix[likelihood]?.[consequence] || 'Low';
  }

  const getOverallRiskLevel = (): 'Low' | 'Medium' | 'High' | 'Extreme' => {
    if (hazards.length === 0) return 'Low';
    const riskLevels = hazards.map(h => h.riskLevel);
    if (riskLevels.includes('Extreme')) return 'Extreme';
    if (riskLevels.includes('High')) return 'High';
    if (riskLevels.includes('Medium')) return 'Medium';
    return 'Low';
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Low': return 'success';
      case 'Medium': return 'warning';
      case 'High': return 'error';
      case 'Extreme': return 'error';
      default: return 'default';
    }
  };

  const handleAddHazard = () => {
    setFormData({
      hazard: '',
      likelihood: 'Low',
      consequence: 'Minor',
      mitigation: '',
      responsible: user?.name || '',
      dueDate: '',
    });
    setEditingIndex(null);
    setDialogOpen(true);
  };

  const handleEditHazard = (index: number) => {
    const hazard = hazards[index];
    setFormData({
      hazard: hazard.hazard,
      likelihood: hazard.likelihood,
      consequence: hazard.consequence,
      mitigation: hazard.mitigation,
      responsible: hazard.responsible || '',
      dueDate: hazard.dueDate || '',
    });
    setEditingIndex(index);
    setDialogOpen(true);
  };

  const handleSaveHazard = () => {
    const riskLevel = calculateRiskLevel(formData.likelihood, formData.consequence);
    const hazardData = {
      id: editingIndex !== null ? hazards[editingIndex].id : `hazard-${Date.now()}`,
      hazard: formData.hazard,
      likelihood: formData.likelihood,
      consequence: formData.consequence,
      riskLevel,
      mitigation: formData.mitigation,
      responsible: formData.responsible,
      dueDate: formData.dueDate,
    };

    if (editingIndex !== null) {
      // Update existing hazard
      setHazards(prev => prev.map((h, i) => i === editingIndex ? hazardData : h));
    } else {
      // Add new hazard
      setHazards(prev => [...prev, hazardData]);
    }

    setDialogOpen(false);
  };

  const handleDeleteHazard = (index: number) => {
    if (window.confirm('Are you sure you want to delete this hazard?')) {
      setHazards(prev => prev.filter((_, i) => i !== index));
    }
  };

  // Update parent component whenever hazards change
  useEffect(() => {
    const overallRiskLevel = getOverallRiskLevel();
    const jsa: JSARecord = {
      jsaType: 'Comprehensive',
      hazards,
      overallRiskLevel,
      approvalRequired: ['High', 'Extreme'].includes(overallRiskLevel),
      completedBy: user?.name || '',
      completedAt: new Date().toISOString(),
    };
    onJSAChange(jsa);
  }, [hazards, user, onJSAChange]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">
          Comprehensive JSA Builder
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddHazard}
          disabled={disabled}
        >
          Add Hazard
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Create custom hazards with detailed analysis. Add unlimited hazards and specify mitigation strategies for each.
      </Alert>

      {hazards.length === 0 ? (
        <Alert severity="warning" sx={{ mb: 3 }}>
          No hazards identified yet. Add hazards to complete your JSA.
        </Alert>
      ) : (
        <TableContainer component={Paper} sx={{ mb: 3 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Hazard</TableCell>
                <TableCell>Likelihood</TableCell>
                <TableCell>Consequence</TableCell>
                <TableCell>Risk Level</TableCell>
                <TableCell>Mitigation Strategy</TableCell>
                <TableCell>Responsible</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {hazards.map((hazard, index) => (
                <TableRow key={hazard.id}>
                  <TableCell sx={{ maxWidth: 200 }}>
                    <Typography variant="body2">
                      {hazard.hazard}
                    </Typography>
                  </TableCell>
                  <TableCell>{hazard.likelihood}</TableCell>
                  <TableCell>{hazard.consequence}</TableCell>
                  <TableCell>
                    <Chip
                      label={hazard.riskLevel}
                      color={getRiskColor(hazard.riskLevel) as any}
                      size="small"
                    />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 300 }}>
                    <Typography variant="body2" noWrap>
                      {hazard.mitigation}
                    </Typography>
                  </TableCell>
                  <TableCell>{hazard.responsible}</TableCell>
                  <TableCell>
                    <IconButton
                      onClick={() => handleEditHazard(index)}
                      size="small"
                      disabled={disabled}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      onClick={() => handleDeleteHazard(index)}
                      size="small"
                      color="error"
                      disabled={disabled}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Overall Risk Assessment */}
      {hazards.length > 0 && (
        <Alert
          severity={getOverallRiskLevel() === 'Low' ? 'success' : getOverallRiskLevel() === 'Medium' ? 'warning' : 'error'}
        >
          <Typography variant="body2">
            <strong>Overall Risk Level: {getOverallRiskLevel()}</strong>
            {['High', 'Extreme'].includes(getOverallRiskLevel()) && (
              <> - Chief Remote Pilot approval required before mission commencement</>
            )}
          </Typography>
        </Alert>
      )}

      {/* Hazard Form Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingIndex !== null ? 'Edit Hazard' : 'Add New Hazard'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Hazard Description *"
                value={formData.hazard}
                onChange={(e) => setFormData(prev => ({ ...prev, hazard: e.target.value }))}
                multiline
                rows={3}
                placeholder="Describe the potential hazard in detail..."
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Likelihood *</InputLabel>
                <Select
                  value={formData.likelihood}
                  onChange={(e) => setFormData(prev => ({ ...prev, likelihood: e.target.value as any }))}
                >
                  <MenuItem value="Low">Low</MenuItem>
                  <MenuItem value="Medium">Medium</MenuItem>
                  <MenuItem value="High">High</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Consequence *</InputLabel>
                <Select
                  value={formData.consequence}
                  onChange={(e) => setFormData(prev => ({ ...prev, consequence: e.target.value as any }))}
                >
                  <MenuItem value="Minor">Minor</MenuItem>
                  <MenuItem value="Moderate">Moderate</MenuItem>
                  <MenuItem value="Major">Major</MenuItem>
                  <MenuItem value="Catastrophic">Catastrophic</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Alert severity="info">
                <Typography variant="body2">
                  Calculated Risk Level: <strong>{calculateRiskLevel(formData.likelihood, formData.consequence)}</strong>
                </Typography>
              </Alert>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Mitigation Strategy *"
                value={formData.mitigation}
                onChange={(e) => setFormData(prev => ({ ...prev, mitigation: e.target.value }))}
                multiline
                rows={4}
                placeholder="Describe specific actions to mitigate this hazard..."
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Responsible Person"
                value={formData.responsible}
                onChange={(e) => setFormData(prev => ({ ...prev, responsible: e.target.value }))}
                placeholder="Who is responsible for this mitigation?"
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Due Date"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveHazard}
            variant="contained"
            disabled={!formData.hazard || !formData.mitigation}
          >
            {editingIndex !== null ? 'Update' : 'Add'} Hazard
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
```

**Step 4: Create industry-specific JSA component**

Create `src/components/JSAIndustrySpecific.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Typography,
  Chip,
  Alert,
} from '@mui/material';
import { JSARecord } from '../types/mission';
import { useAuth } from '../contexts/AuthContext';

interface JSAIndustrySpecificProps {
  industryType: 'Crop Spraying' | 'Surveying' | 'Inspections';
  existingJSA?: JSARecord | null;
  onJSAChange: (jsa: JSARecord) => void;
  disabled?: boolean;
}

const INDUSTRY_HAZARDS = {
  'Crop Spraying': [
    {
      id: 'chemical-exposure',
      hazard: 'Chemical Exposure to Operator and Environment',
      defaultLikelihood: 'Medium' as const,
      defaultConsequence: 'Major' as const,
      defaultMitigation: 'Use appropriate PPE, follow chemical handling procedures, maintain buffer zones, monitor wind conditions',
    },
    {
      id: 'drift',
      hazard: 'Chemical Drift to Non-Target Areas',
      defaultLikelihood: 'High' as const,
      defaultConsequence: 'Major' as const,
      defaultMitigation: 'Monitor wind speed and direction, use appropriate nozzles, maintain buffer zones, follow label requirements',
    },
    {
      id: 'restricted-zones',
      hazard: 'Application in Restricted Zones',
      defaultLikelihood: 'Low' as const,
      defaultConsequence: 'Catastrophic' as const,
      defaultMitigation: 'Verify property boundaries, check for waterways and sensitive areas, maintain required buffer distances',
    },
    {
      id: 'tank-contamination',
      hazard: 'Tank Mix Incompatibility/Contamination',
      defaultLikelihood: 'Medium' as const,
      defaultConsequence: 'Moderate' as const,
      defaultMitigation: 'Follow chemical compatibility charts, clean tanks between applications, check for previous residues',
    },
    {
      id: 'payload-limits',
      hazard: 'Aircraft Overload Due to Chemical Payload',
      defaultLikelihood: 'Low' as const,
      defaultConsequence: 'Major' as const,
      defaultMitigation: 'Calculate weight and balance, verify maximum payload limits, monitor fuel consumption',
    },
  ],
  'Surveying': [
    {
      id: 'privacy',
      hazard: 'Privacy Concerns and Unauthorized Surveillance',
      defaultLikelihood: 'Medium' as const,
      defaultConsequence: 'Moderate' as const,
      defaultMitigation: 'Obtain landowner permissions, follow privacy laws, avoid residential areas, notify neighbors',
    },
    {
      id: 'data-security',
      hazard: 'Data Loss or Security Breach',
      defaultLikelihood: 'Low' as const,
      defaultConsequence: 'Major' as const,
      defaultMitigation: 'Use encrypted storage, backup data regularly, secure data transmission, follow data protection protocols',
    },
    {
      id: 'equipment-calibration',
      hazard: 'Equipment Calibration Errors Affecting Data Quality',
      defaultLikelihood: 'Medium' as const,
      defaultConsequence: 'Moderate' as const,
      defaultMitigation: 'Regular calibration checks, verify sensor accuracy, maintain calibration records, use ground control points',
    },
    {
      id: 'weather-data',
      hazard: 'Weather Conditions Affecting Data Quality',
      defaultLikelihood: 'High' as const,
      defaultConsequence: 'Minor' as const,
      defaultMitigation: 'Monitor weather conditions, avoid high wind or precipitation, plan flights for optimal lighting conditions',
    },
    {
      id: 'restricted-survey',
      hazard: 'Surveying in Restricted or Sensitive Areas',
      defaultLikelihood: 'Low' as const,
      defaultConsequence: 'Major' as const,
      defaultMitigation: 'Check for restricted zones, obtain necessary permits, coordinate with relevant authorities',
    },
  ],
  'Inspections': [
    {
      id: 'infrastructure-hazards',
      hazard: 'Collision with Infrastructure Being Inspected',
      defaultLikelihood: 'Medium' as const,
      defaultConsequence: 'Catastrophic' as const,
      defaultMitigation: 'Maintain safe distances, use visual observers, plan flight paths carefully, check for structural integrity',
    },
    {
      id: 'confined-spaces',
      hazard: 'Operations in Confined or Restricted Spaces',
      defaultLikelihood: 'High' as const,
      defaultConsequence: 'Major' as const,
      defaultMitigation: 'Assess space limitations, use smaller aircraft if needed, plan emergency escape routes, limit flight time',
    },
    {
      id: 'emergency-access',
      hazard: 'Limited Emergency Access in Remote Inspection Sites',
      defaultLikelihood: 'Medium' as const,
      defaultConsequence: 'Major' as const,
      defaultMitigation: 'Inform emergency services of operations, carry emergency communication equipment, plan emergency procedures',
    },
    {
      id: 'electrical-hazards',
      hazard: 'Electrical Hazards from Power Lines and Equipment',
      defaultLikelihood: 'Medium' as const,
      defaultConsequence: 'Catastrophic' as const,
      defaultMitigation: 'Identify all electrical hazards, maintain minimum clearance distances, coordinate with electrical operators',
    },
    {
      id: 'thermal-imaging',
      hazard: 'Thermal Imaging Equipment Failure in Critical Inspections',
      defaultLikelihood: 'Low' as const,
      defaultConsequence: 'Moderate' as const,
      defaultMitigation: 'Calibrate thermal equipment, carry backup systems, verify equipment function before critical inspections',
    },
  ],
};

export default function JSAIndustrySpecific({ industryType, existingJSA, onJSAChange, disabled }: JSAIndustrySpecificProps) {
  const { user } = useAuth();
  const [hazards, setHazards] = useState(() => {
    if (existingJSA?.hazards) {
      return existingJSA.hazards;
    }
    return INDUSTRY_HAZARDS[industryType].map(h => ({
      id: h.id,
      hazard: h.hazard,
      likelihood: h.defaultLikelihood,
      consequence: h.defaultConsequence,
      riskLevel: calculateRiskLevel(h.defaultLikelihood, h.defaultConsequence),
      mitigation: h.defaultMitigation,
      responsible: user?.name || '',
      dueDate: '',
    }));
  });

  function calculateRiskLevel(likelihood: string, consequence: string): 'Low' | 'Medium' | 'High' | 'Extreme' {
    const matrix: Record<string, Record<string, 'Low' | 'Medium' | 'High' | 'Extreme'>> = {
      'Low': { 'Minor': 'Low', 'Moderate': 'Low', 'Major': 'Medium', 'Catastrophic': 'High' },
      'Medium': { 'Minor': 'Low', 'Moderate': 'Medium', 'Major': 'High', 'Catastrophic': 'Extreme' },
      'High': { 'Minor': 'Medium', 'Moderate': 'High', 'Major': 'Extreme', 'Catastrophic': 'Extreme' },
    };
    return matrix[likelihood]?.[consequence] || 'Low';
  }

  const updateHazard = (id: string, field: string, value: string) => {
    setHazards(prev => prev.map(h => {
      if (h.id === id) {
        const updated = { ...h, [field]: value };
        if (field === 'likelihood' || field === 'consequence') {
          updated.riskLevel = calculateRiskLevel(updated.likelihood, updated.consequence);
        }
        return updated;
      }
      return h;
    }));
  };

  const getOverallRiskLevel = (): 'Low' | 'Medium' | 'High' | 'Extreme' => {
    const riskLevels = hazards.map(h => h.riskLevel);
    if (riskLevels.includes('Extreme')) return 'Extreme';
    if (riskLevels.includes('High')) return 'High';
    if (riskLevels.includes('Medium')) return 'Medium';
    return 'Low';
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Low': return 'success';
      case 'Medium': return 'warning';
      case 'High': return 'error';
      case 'Extreme': return 'error';
      default: return 'default';
    }
  };

  const getIndustryDescription = () => {
    switch (industryType) {
      case 'Crop Spraying':
        return 'Pre-loaded hazards specific to agricultural spraying operations, including chemical handling, drift control, and environmental protection.';
      case 'Surveying':
        return 'Hazards related to data collection, privacy concerns, equipment calibration, and survey accuracy requirements.';
      case 'Inspections':
        return 'Infrastructure inspection hazards including confined spaces, electrical hazards, and emergency access considerations.';
      default:
        return '';
    }
  };

  // Update parent component whenever hazards change
  useEffect(() => {
    const overallRiskLevel = getOverallRiskLevel();
    const jsa: JSARecord = {
      jsaType: 'Industry-Specific',
      industryType,
      hazards,
      overallRiskLevel,
      approvalRequired: ['High', 'Extreme'].includes(overallRiskLevel),
      completedBy: user?.name || '',
      completedAt: new Date().toISOString(),
    };
    onJSAChange(jsa);
  }, [hazards, user, industryType, onJSAChange]);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {industryType} JSA Template
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        {getIndustryDescription()}
      </Alert>

      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Hazard</TableCell>
              <TableCell>Likelihood</TableCell>
              <TableCell>Consequence</TableCell>
              <TableCell>Risk Level</TableCell>
              <TableCell>Mitigation Strategy</TableCell>
              <TableCell>Responsible</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {hazards.map((hazard) => (
              <TableRow key={hazard.id}>
                <TableCell sx={{ minWidth: 250 }}>
                  <Typography variant="body2" fontWeight="medium">
                    {hazard.hazard}
                  </Typography>
                </TableCell>
                <TableCell sx={{ minWidth: 120 }}>
                  <FormControl size="small" fullWidth>
                    <Select
                      value={hazard.likelihood}
                      onChange={(e) => updateHazard(hazard.id, 'likelihood', e.target.value)}
                      disabled={disabled}
                    >
                      <MenuItem value="Low">Low</MenuItem>
                      <MenuItem value="Medium">Medium</MenuItem>
                      <MenuItem value="High">High</MenuItem>
                    </Select>
                  </FormControl>
                </TableCell>
                <TableCell sx={{ minWidth: 120 }}>
                  <FormControl size="small" fullWidth>
                    <Select
                      value={hazard.consequence}
                      onChange={(e) => updateHazard(hazard.id, 'consequence', e.target.value)}
                      disabled={disabled}
                    >
                      <MenuItem value="Minor">Minor</MenuItem>
                      <MenuItem value="Moderate">Moderate</MenuItem>
                      <MenuItem value="Major">Major</MenuItem>
                      <MenuItem value="Catastrophic">Catastrophic</MenuItem>
                    </Select>
                  </FormControl>
                </TableCell>
                <TableCell sx={{ minWidth: 100 }}>
                  <Chip
                    label={hazard.riskLevel}
                    color={getRiskColor(hazard.riskLevel) as any}
                    size="small"
                    variant="filled"
                  />
                </TableCell>
                <TableCell sx={{ minWidth: 350 }}>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    value={hazard.mitigation}
                    onChange={(e) => updateHazard(hazard.id, 'mitigation', e.target.value)}
                    disabled={disabled}
                    placeholder="Describe mitigation strategies..."
                    size="small"
                  />
                </TableCell>
                <TableCell sx={{ minWidth: 150 }}>
                  <TextField
                    fullWidth
                    value={hazard.responsible || ''}
                    onChange={(e) => updateHazard(hazard.id, 'responsible', e.target.value)}
                    disabled={disabled}
                    placeholder="Responsible person"
                    size="small"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Overall Risk Assessment */}
      <Alert
        severity={getOverallRiskLevel() === 'Low' ? 'success' : getOverallRiskLevel() === 'Medium' ? 'warning' : 'error'}
      >
        <Typography variant="body2">
          <strong>Overall Risk Level: {getOverallRiskLevel()}</strong>
          {['High', 'Extreme'].includes(getOverallRiskLevel()) && (
            <> - Chief Remote Pilot approval required before mission commencement</>
          )}
        </Typography>
      </Alert>
    </Box>
  );
}
```

**Step 5: Test by manual verification**

Create a test page to verify JSA system components work correctly

**Step 6: Commit**

```bash
git add src/components/JSASystem.tsx src/components/JSAStandardTemplate.tsx src/components/JSAComprehensiveBuilder.tsx src/components/JSAIndustrySpecific.tsx
git commit -m "feat: add comprehensive JSA system with triple dropdown selection"
```

---

## Plan complete and saved to `docs/plans/2026-04-12-mission-management-platform.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**