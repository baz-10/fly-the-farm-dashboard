// Mission Status Types - 5-Phase Workflow
export type MissionStatus = 'Planning' | 'Approved' | 'Flying' | 'Completed' | 'Locked';

// Mission Types
export type MissionType = 'spray' | 'survey' | 'inspection' | 'mapping' | 'custom';
export type MissionPriority = 'low' | 'medium' | 'high' | 'critical';

// JSA Types
export type JSAType = 'standard-spray' | 'restricted-chemical' | 'urban-area' | 'powerline-proximity' |
                     'livestock-area' | 'water-source' | 'high-risk' | 'custom';

export type JSAStatus = 'pending' | 'in-progress' | 'completed' | 'approved' | 'rejected';

// Boundary Analysis Types
export type BoundaryAnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'failed' | 'requires-review';

// Flight Plan Types
export type FlightPlanType = 'automated' | 'manual' | 'hybrid';
export type FlightPattern = 'parallel' | 'spiral' | 'crosshatch' | 'perimeter' | 'custom';

// Approval Types
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface MissionPlanningChemical {
  product: string;
  ratePerHa: number;
  unit: 'L' | 'ml' | 'kg' | 'g';
  totalRequired: number;
}

export interface MissionPlanningState {
  clientName: string;
  propertyName: string;
  fieldName: string;
  siteAddress?: string;
  siteLatitude?: number;
  siteLongitude?: number;
  missionNotes: string;
  boundaryCoords: Array<[number, number]>;
  vegetationClearance?: {
    lotPlan: string;
    checkId?: string;
    sourceLabel?: string;
    checkedAt?: string;
    categories?: Record<string, number>;
    reviewStatus: 'clear' | 'requires-review' | 'not-checked' | 'not-applicable';
    acknowledged: boolean;
  };
  operation: {
    applicationRateLHa: number;
    perimeterKm: number;
    bufferZones: number;
    exclusionZones: number;
    estimatedBatteryChanges: number;
    flightLines: number;
    turnAroundCount: number;
  };
  weatherWindow: {
    startTime: string;
    endTime: string;
    windDirection: string;
    windSpeedKmh: number;
    windGustKmh: number;
    temperatureC: number;
    rainChancePercent: number;
  };
  chemicals: MissionPlanningChemical[];
}

// Core Mission Record
export interface MissionRecord {
  id: string;
  missionNumber: string; // Human-readable identifier (e.g., "MSN-2026-0001")
  status: MissionStatus;

  // Basic Mission Information
  missionName: string;
  missionType: MissionType;
  priority: MissionPriority;
  description: string;

  // Client and Location
  clientId: string;
  siteId?: string;
  location: {
    name: string;
    address: string;
    coordinates: {
      latitude: number;
      longitude: number;
    };
    elevation: number; // meters
  };

  // Scheduling
  scheduledDate: string; // ISO date
  estimatedDuration: number; // minutes
  weatherRequirements: {
    maxWindSpeed: number; // km/h
    minVisibility: number; // meters
    maxPrecipitationChance: number; // percentage
    allowedCloudCover: number; // percentage
  };

  // Aircraft and Equipment Assignment
  aircraftConfiguration: {
    aircraftId: string;
    configurationId: string; // AircraftKitConfiguration ID
    estimatedFlightTime: number; // minutes
    maxPayloadWeight: number; // kg
  };

  // Mission Components
  jsaRecord: JSARecord;
  boundaryFiles: BoundaryFile[];
  flightPlan?: FlightPlan;
  flightExecution?: FlightExecution;

  // Approvals and Signatures
  approvals: MissionApprovals;

  // Financial Information
  financialEstimate: {
    aircraftCost: number;
    equipmentCost: number;
    personnelCost: number;
    travelCost: number;
    chemicalCost?: number;
    totalEstimatedCost: number;
  };

  financialActual?: {
    aircraftCost: number;
    equipmentCost: number;
    personnelCost: number;
    travelCost: number;
    chemicalCost?: number;
    totalActualCost: number;
    profitMargin: number;
  };

  // Compliance and Safety
  complianceChecks: {
    casaNotification: boolean;
    airspaceApproval: boolean;
    localPermits: boolean;
    environmentalClearance: boolean;
    insuranceCoverage: boolean;
  };

  // Audit Trail
  auditTrail: MissionAuditEntry[];

  // Weather Data at Time of Mission
  weatherConditions?: {
    recordedAt: string;
    windSpeed: number; // km/h
    windDirection: number; // degrees
    temperature: number; // celsius
    humidity: number; // percentage
    pressure: number; // hPa
    visibility: number; // meters
    cloudCover: number; // percentage
  };

  planningState?: MissionPlanningState;

  createdAt: string;
  updatedAt: string;
  createdBy: string; // User ID
  lastModifiedBy: string; // User ID
}

// Job Safety Analysis Record
export interface JSARecord {
  id: string;
  missionId: string;
  jsaType: JSAType;
  status: JSAStatus;

  // JSA Details
  jsaNumber: string; // Human-readable identifier
  completedBy: string; // User ID
  reviewedBy?: string; // User ID (CRP/Supervisor)
  completedDate?: string;
  reviewedDate?: string;

  // Hazard Assessment
  hazardIdentification: {
    id: string;
    category: 'operational' | 'environmental' | 'personnel' | 'equipment' | 'external';
    description: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    likelihood: 'rare' | 'unlikely' | 'possible' | 'likely' | 'almost-certain';
    consequence: 'insignificant' | 'minor' | 'moderate' | 'major' | 'catastrophic';
    controlMeasures: string[];
    residualRisk: 'low' | 'medium' | 'high' | 'critical';
  }[];

  // Safety Requirements
  safetyRequirements: {
    personnelRequirements: {
      minimumCrewSize: number;
      requiredQualifications: string[];
      requiredTraining: string[];
      medicalRequirements?: string[];
    };
    equipmentRequirements: {
      requiredSafetyEquipment: string[];
      emergencyEquipment: string[];
      communicationEquipment: string[];
      backupSystems: string[];
    };
    operationalConstraints: {
      timeOfDayRestrictions?: string;
      weatherLimitations: string[];
      proximityRestrictions: string[];
      specialProcedures: string[];
    };
  };

  // Emergency Procedures
  emergencyProcedures: {
    communicationPlan: {
      primaryContact: string;
      secondaryContact: string;
      emergencyServices: string[];
    };
    evacuationPlan: string;
    equipmentFailureProcedures: string[];
    medicalEmergencyPlan: string;
  };

  // Sign-offs
  signOffs: {
    pilot: {
      userId: string;
      signature: string;
      signedAt: string;
    };
    crp?: {
      userId: string;
      signature: string;
      signedAt: string;
      comments?: string;
    };
  };

  createdAt: string;
  updatedAt: string;
}

// Boundary File with Analysis Results
export interface BoundaryFile {
  id: string;
  missionId: string;
  fileName: string;
  fileType: 'kml' | 'kmz' | 'shapefile' | 'geojson';
  fileSize: number; // bytes
  uploadedAt: string;
  uploadedBy: string; // User ID

  // File Storage
  fileUrl: string; // Local storage path or future cloud URL
  originalFileName: string;

  // Analysis Results
  analysis: {
    status: BoundaryAnalysisStatus;
    analyzedAt?: string;

    // Geometric Analysis
    geometry: {
      totalArea: number; // hectares
      perimeter: number; // meters
      boundingBox: {
        north: number;
        south: number;
        east: number;
        west: number;
      };
      complexity: 'simple' | 'moderate' | 'complex';
      isValid: boolean;
      validationErrors: string[];
    };

    // Operational Analysis
    operationalData: {
      estimatedFlightTime: number; // minutes
      estimatedBatteryChanges: number;
      recommendedOverlap: number; // percentage
      flightLines: number;
      turnAroundCount: number;
    };

    // Risk Assessment
    riskFactors: {
      id: string;
      type: 'powerlines' | 'buildings' | 'water-sources' | 'roads' | 'airports' | 'populated-areas' | 'environmental';
      description: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      mitigationRequired: boolean;
      bufferZoneRequired: number; // meters
    }[];

    // Compliance Checks
    complianceIssues: {
      id: string;
      type: 'airspace' | 'casa' | 'local-council' | 'environmental' | 'safety';
      description: string;
      requiresApproval: boolean;
      approvalType?: string;
      estimatedApprovalTime?: number; // days
    }[];
  };

  // Version Control
  version: number;
  supersedes?: string; // ID of previous version

  createdAt: string;
  updatedAt: string;
}

// Flight Plan
export interface FlightPlan {
  id: string;
  missionId: string;
  planName: string;
  planType: FlightPlanType;

  // Flight Parameters
  flightParameters: {
    altitude: number; // meters AGL
    groundSpeed: number; // km/h
    flightPattern: FlightPattern;
    overlapForward: number; // percentage
    overlapSide: number; // percentage
    lineSpacing: number; // meters
  };

  // Route Planning
  route: {
    waypoints: {
      id: string;
      latitude: number;
      longitude: number;
      altitude: number; // meters AGL
      action: 'fly-to' | 'hover' | 'start-spray' | 'stop-spray' | 'photo' | 'rtl';
      duration?: number; // seconds at waypoint
    }[];
    homePosition: {
      latitude: number;
      longitude: number;
      altitude: number;
    };
    alternateHomeSites: {
      name: string;
      latitude: number;
      longitude: number;
      altitude: number;
    }[];
  };

  // Mission Timing
  timing: {
    estimatedTotalTime: number; // minutes
    estimatedFlightTime: number; // minutes
    estimatedSetupTime: number; // minutes
    estimatedPackupTime: number; // minutes
    batteryChangeTime: number; // minutes per change
    requiredBatteryChanges: number;
  };

  // Safety Planning
  safetyPlanning: {
    emergencyLandingSites: {
      id: string;
      name: string;
      latitude: number;
      longitude: number;
      suitabilityRating: 'excellent' | 'good' | 'adequate' | 'emergency-only';
      notes?: string;
    }[];
    noFlyZones: {
      id: string;
      name: string;
      coordinates: Array<{latitude: number, longitude: number}>;
      reason: string;
      altitude?: number; // if altitude-specific restriction
    }[];
    contingencyProcedures: string[];
  };

  // Created/Approved by
  createdBy: string; // User ID
  approvedBy?: string; // CRP User ID
  approvedAt?: string;

  createdAt: string;
  updatedAt: string;
}

// Flight Execution Results
export interface FlightExecution {
  id: string;
  missionId: string;
  flightPlanId: string;
  executionDate: string;

  // Crew Information
  crew: {
    pilot: {
      userId: string;
      licenseNumber: string;
      qualifications: string[];
    };
    visualObserver?: {
      userId: string;
      qualifications: string[];
    };
    crp?: {
      userId: string;
      licenseNumber: string;
      present: boolean; // Was CRP physically present?
    };
  };

  // Actual Flight Data
  actualFlightData: {
    startTime: string;
    endTime: string;
    totalFlightTime: number; // minutes
    actualAltitudes: {
      minimum: number;
      maximum: number;
      average: number;
    };
    actualGroundSpeed: {
      minimum: number;
      maximum: number;
      average: number;
    };
    batteryChanges: number;
    fuelUsed?: number; // liters for fuel aircraft
    distanceTraveled: number; // kilometers
  };

  // Planned vs Actual Comparison
  deviations: {
    timeDeviation: number; // minutes (positive = over, negative = under)
    routeDeviations: {
      waypointId: string;
      plannedPosition: { latitude: number; longitude: number };
      actualPosition: { latitude: number; longitude: number };
      deviation: number; // meters
      reason?: string;
    }[];
    altitudeDeviations: {
      timestamp: string;
      plannedAltitude: number;
      actualAltitude: number;
      deviation: number; // meters
      reason?: string;
    }[];
  };

  // Mission Results
  results: {
    missionStatus: 'successful' | 'partially-successful' | 'aborted' | 'failed';
    areaCompleted: number; // hectares
    areaMissed?: number; // hectares
    reasonsForDeviations: string[];
    qualityAssessment: {
      coverageQuality: 'excellent' | 'good' | 'adequate' | 'poor';
      overlapAchieved: number; // percentage
      gapsIdentified: boolean;
      reworkRequired: boolean;
    };
  };

  // Issues and Incidents
  issues: {
    id: string;
    timestamp: string;
    type: 'equipment-failure' | 'weather' | 'airspace' | 'safety' | 'operational' | 'other';
    severity: 'minor' | 'moderate' | 'major' | 'critical';
    description: string;
    actionTaken: string;
    resolved: boolean;
    reportRequired: boolean;
  }[];

  // Post-Flight Checks
  postFlightChecks: {
    aircraftInspection: {
      completed: boolean;
      completedBy: string; // User ID
      completedAt: string;
      issues: string[];
      nextInspectionDue?: string;
    };
    equipmentInspection: {
      completed: boolean;
      completedBy: string; // User ID
      completedAt: string;
      issues: string[];
      cleaningRequired: boolean;
      calibrationRequired: boolean;
    };
    dataBackup: {
      completed: boolean;
      location: string;
      verifiedIntegrity: boolean;
    };
  };

  createdAt: string;
  updatedAt: string;
}

// Mission Approvals and Digital Signatures
export interface MissionApprovals {
  missionId: string;

  // Planning to Approved Transition
  planningApproval?: {
    approvedBy: string; // CRP User ID
    approvedAt: string;
    digitalSignature: string;
    conditions?: string[];
    validUntil?: string; // Approval expiry
    comments?: string;
  };

  // Approved to Flying Transition
  flyingAuthorization?: {
    authorizedBy: string; // CRP User ID
    authorizedAt: string;
    digitalSignature: string;
    preFlightChecklistCompleted: boolean;
    weatherConditionsAcceptable: boolean;
    crpAvailable: boolean; // Is CRP available during flight?
    comments?: string;
  };

  // Flying to Completed Transition
  completionApproval?: {
    approvedBy: string; // User ID (can be pilot or CRP)
    approvedAt: string;
    digitalSignature: string;
    postFlightChecklistCompleted: boolean;
    allDataCaptured: boolean;
    clientNotified: boolean;
    comments?: string;
  };

  // Completed to Locked Transition
  finalApproval?: {
    approvedBy: string; // CRP User ID (required)
    approvedAt: string;
    digitalSignature: string;
    invoiceGenerated: boolean;
    dataDelivered: boolean;
    clientSatisfied: boolean;
    noOutstandingIssues: boolean;
    archivalComplete: boolean;
    comments?: string;
  };

  createdAt: string;
  updatedAt: string;
}

// Audit Trail Entry
export interface MissionAuditEntry {
  id: string;
  missionId: string;
  timestamp: string;
  userId: string;
  action: 'created' | 'updated' | 'status-changed' | 'approved' | 'rejected' | 'deleted' | 'archived';

  // Details of the change
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];

  // Status transitions
  statusTransition?: {
    fromStatus: MissionStatus;
    toStatus: MissionStatus;
    reason?: string;
    approvalRequired: boolean;
    validationPassed: boolean;
  };

  comments?: string;
  ipAddress?: string;
  userAgent?: string;
}

// Mission Search and Filter Types
export interface MissionSearchCriteria {
  // Text Search
  searchTerm?: string; // Searches mission name, number, client name, location

  // Status Filters
  statuses?: MissionStatus[];

  // Date Filters
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  scheduledDateRange?: {
    startDate: string;
    endDate: string;
  };

  // Type and Priority
  missionTypes?: MissionType[];
  priorities?: MissionPriority[];

  // Client and Location
  clientIds?: string[];
  siteIds?: string[];

  // Aircraft and Equipment
  aircraftIds?: string[];
  configurationIds?: string[];

  // Financial
  costRange?: {
    minimum: number;
    maximum: number;
  };

  // Assignments
  assignedTo?: string[]; // User IDs
  createdBy?: string[]; // User IDs

  // Compliance
  requiresApprovals?: boolean;
  hasOutstandingIssues?: boolean;

  // Sorting
  sortBy?: 'scheduledDate' | 'createdDate' | 'missionNumber' | 'priority' | 'status' | 'estimatedCost';
  sortOrder?: 'asc' | 'desc';

  // Pagination
  page?: number;
  limit?: number;
}

// Mission Statistics for Dashboard
export interface MissionStatistics {
  totalMissions: number;
  missionsByStatus: Record<MissionStatus, number>;
  missionsByType: Record<MissionType, number>;
  missionsByPriority: Record<MissionPriority, number>;

  // Financial Stats
  totalEstimatedRevenue: number;
  totalActualRevenue: number;
  averageMissionValue: number;
  profitMargin: number;

  // Operational Stats
  totalFlightHours: number;
  totalAreaCovered: number; // hectares
  averageFlightTime: number;
  successRate: number; // percentage of successful missions

  // Time-based Stats
  missionsThisWeek: number;
  missionsThisMonth: number;
  missionsThisQuarter: number;
  upcomingMissions: number; // next 7 days
  overdueMissions: number;

  // Efficiency Stats
  onTimeCompletionRate: number; // percentage
  averageSetupTime: number; // minutes
  equipmentUtilizationRate: number; // percentage
}

// Validation Error Types
export interface MissionValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
}

// Mission Template for common mission types
export interface MissionTemplate {
  id: string;
  name: string;
  description: string;
  missionType: MissionType;

  // Default values for new missions
  defaults: {
    priority: MissionPriority;
    estimatedDuration: number;
    weatherRequirements: MissionRecord['weatherRequirements'];
    jsaType: JSAType;
    flightParameters: Partial<FlightPlan['flightParameters']>;
    safetyRequirements: Partial<JSARecord['safetyRequirements']>;
  };

  // Required fields for this template
  requiredFields: string[];

  // Custom validation rules
  validationRules?: {
    field: string;
    rule: string;
    message: string;
  }[];

  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
