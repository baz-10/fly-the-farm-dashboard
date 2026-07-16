export type AircraftStatus = 'operational' | 'maintenance' | 'retired' | 'inspection';
export type EquipmentKitType = 'spray-system' | 'camera-gimbal' | 'lidar' | 'multispectral' | 'thermal' | 'custom';
export type OperationalStatus = 'available' | 'assigned' | 'maintenance' | 'calibration';
export type PricingModel = 'included' | 'per-hour' | 'per-hectare' | 'daily-rate' | 'per-job';

// Core aircraft interface
export interface Aircraft {
  id: string;
  registration: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  activationDate?: string;
  mtow: number; // Maximum Take-Off Weight in kg
  maxAltitude: number; // meters AGL
  maxWindSpeed: number; // km/h

  // Maintenance tracking
  maintenanceDates: {
    lastInspection: string;
    nextInspectionDue: string;
    lastMajorService: string;
    nextMajorServiceDue: string;
    totalFlightHours: number;
    hoursSinceLastService: number;
  };

  // Insurance and legal
  insurance: {
    policyNumber: string;
    provider: string;
    expiryDate: string;
    coverageAmount: number;
    hullValue: number;
  };

  status: AircraftStatus;
  assignedKits: string[]; // Equipment kit IDs currently installed

  // Operational limits and capabilities
  operationalLimits: {
    minOperatingTemp: number; // Celsius
    maxOperatingTemp: number; // Celsius
    maxPayloadWeight: number; // kg
    batteryCycles?: number;
    /** @deprecated Legacy records stored battery duration in this field. */
    batteryLife?: number;
    maxFlightTime: number; // minutes
    serviceRange: number; // km from base
    minimumCrewSize: number;
  };

  // Documentation and compliance
  documentation: {
    manuals: string[];
    certificates: string[];
    logbooks: string[];
    complianceChecks: {
      casaCompliant: boolean;
      lastCasaInspection: string;
      nextCasaInspectionDue: string;
    };
  };

  createdAt: string;
  updatedAt: string;
}

// Equipment kit for aircraft configurations
export interface EquipmentKit {
  id: string;
  name: string;
  type: EquipmentKitType;
  description: string;

  // Technical specifications
  specifications: {
    weight: number; // kg
    dimensions: {
      length: number; // cm
      width: number; // cm
      height: number; // cm
    };
    powerRequirement: number; // watts
    operatingVoltage: string;
    temperatureRange: {
      min: number; // Celsius
      max: number; // Celsius
    };
    weatherResistance: string; // IP rating
  };

  // Kit components
  components: {
    id: string;
    name: string;
    partNumber: string;
    manufacturer: string;
    serialNumber?: string;
    quantity: number;
    unitCost: number;
    warrantyExpiry?: string;
  }[];

  // Operational data
  operationalData: {
    status: OperationalStatus;
    totalOperatingHours: number;
    lastCalibrationDate: string;
    nextCalibrationDue: string;
    lastMaintenanceDate: string;
    nextMaintenanceDue: string;
    averageSetupTime: number; // minutes
    averagePackupTime: number; // minutes
  };

  // Financial tracking
  financialData: {
    purchasePrice: number;
    currentValue: number;
    depreciationRate: number; // percentage per year
    maintenanceCostPerHour: number;
    insuranceValue: number;
    leaseRate?: {
      dailyRate: number;
      weeklyRate: number;
      monthlyRate: number;
    };
  };

  // Aircraft compatibility
  compatibleAircraft: string[]; // Aircraft model strings or IDs

  createdAt: string;
  updatedAt: string;
}

// Configuration linking aircraft with specific equipment kits
export interface AircraftKitConfiguration {
  id: string;
  aircraftId: string;
  kitId: string;
  configurationName: string;

  // Weight and balance calculations
  weightAndBalance: {
    totalWeight: number; // kg
    centerOfGravity: {
      x: number; // cm from datum
      y: number; // cm from datum
      z: number; // cm from datum
    };
    momentArm: number;
    withinLimits: boolean;
    maxPayloadRemaining: number; // kg
  };

  // Operational limits for this specific configuration
  operationalLimits: {
    maxWindSpeed: number; // km/h (may be reduced from aircraft max)
    maxAltitude: number; // meters AGL (may be reduced from aircraft max)
    maxFlightTime: number; // minutes (considering kit power draw)
    recommendedCrewSize: number;
    specialRequirements: string[];
  };

  // Pricing model for this configuration
  pricingModel: {
    type: PricingModel;
    baseRate: number;
    setupFee: number;
    minimumCharge: number;
    additionalFees: {
      description: string;
      amount: number;
      frequency: 'per-job' | 'per-hour' | 'per-day';
    }[];
  };

  // Performance characteristics
  performance: {
    sprayRate?: {
      hectaresPerHour: number;
      litresPerMinute: number;
      swathWidth: number; // meters
    };
    imagingRate?: {
      hectaresPerHour: number;
      groundSampleDistance: number; // cm/pixel
      overlapPercent: number;
    };
    enduranceModifier: number; // factor applied to base aircraft endurance
  };

  createdAt: string;
  updatedAt: string;
}
