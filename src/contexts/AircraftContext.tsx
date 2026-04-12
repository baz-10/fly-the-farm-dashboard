import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Aircraft, EquipmentKit, AircraftKitConfiguration, AircraftStatus, EquipmentKitType, OperationalStatus } from '../types/aircraft';

// Context type definition
interface AircraftContextType {
  // State
  aircraft: Aircraft[];
  equipmentKits: EquipmentKit[];
  configurations: AircraftKitConfiguration[];
  isLoading: boolean;
  error: string | null;

  // Aircraft CRUD operations
  createAircraft: (aircraft: Omit<Aircraft, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateAircraft: (id: string, updates: Partial<Omit<Aircraft, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  deleteAircraft: (id: string) => Promise<void>;
  getAircraftById: (id: string) => Aircraft | undefined;

  // Equipment Kit CRUD operations
  createEquipmentKit: (kit: Omit<EquipmentKit, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateEquipmentKit: (id: string, updates: Partial<Omit<EquipmentKit, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  deleteEquipmentKit: (id: string) => Promise<void>;
  getEquipmentKitById: (id: string) => EquipmentKit | undefined;

  // Configuration CRUD operations
  createConfiguration: (config: Omit<AircraftKitConfiguration, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateConfiguration: (id: string, updates: Partial<Omit<AircraftKitConfiguration, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  deleteConfiguration: (id: string) => Promise<void>;
  getConfigurationById: (id: string) => AircraftKitConfiguration | undefined;

  // Helper functions
  getAvailableAircraft: () => Aircraft[];
  getCompatibleKits: (aircraftId: string) => EquipmentKit[];
  getAircraftConfigurations: (aircraftId: string) => AircraftKitConfiguration[];
  getKitConfigurations: (kitId: string) => AircraftKitConfiguration[];
  getAircraftByStatus: (status: AircraftStatus) => Aircraft[];
  getKitsByType: (type: EquipmentKitType) => EquipmentKit[];
  getKitsByStatus: (status: OperationalStatus) => EquipmentKit[];
  validateConfiguration: (aircraftId: string, kitId: string) => boolean;

  // Data management
  loadData: () => Promise<void>;
  saveData: () => Promise<void>;
  clearData: () => Promise<void>;
}

// Default context value
const defaultContext: AircraftContextType = {
  aircraft: [],
  equipmentKits: [],
  configurations: [],
  isLoading: false,
  error: null,
  createAircraft: async () => '',
  updateAircraft: async () => {},
  deleteAircraft: async () => {},
  getAircraftById: () => undefined,
  createEquipmentKit: async () => '',
  updateEquipmentKit: async () => {},
  deleteEquipmentKit: async () => {},
  getEquipmentKitById: () => undefined,
  createConfiguration: async () => '',
  updateConfiguration: async () => {},
  deleteConfiguration: async () => {},
  getConfigurationById: () => undefined,
  getAvailableAircraft: () => [],
  getCompatibleKits: () => [],
  getAircraftConfigurations: () => [],
  getKitConfigurations: () => [],
  getAircraftByStatus: () => [],
  getKitsByType: () => [],
  getKitsByStatus: () => [],
  validateConfiguration: () => false,
  loadData: async () => {},
  saveData: async () => {},
  clearData: async () => {},
};

// Create context
const AircraftContext = createContext<AircraftContextType>(defaultContext);

// Storage key
const STORAGE_KEY = 'ftf_aircraft_data';

// Helper function to generate timestamp-based IDs
const generateId = (): string => {
  return `aircraft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Type guards and validation functions
const isValidAircraft = (data: any): data is Aircraft => {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.id === 'string' &&
    typeof data.registration === 'string' &&
    typeof data.manufacturer === 'string' &&
    typeof data.model === 'string' &&
    typeof data.serialNumber === 'string' &&
    typeof data.mtow === 'number' &&
    typeof data.maxAltitude === 'number' &&
    typeof data.maxWindSpeed === 'number' &&
    typeof data.maintenanceDates === 'object' &&
    typeof data.insurance === 'object' &&
    typeof data.status === 'string' &&
    Array.isArray(data.assignedKits) &&
    typeof data.operationalLimits === 'object' &&
    typeof data.documentation === 'object' &&
    typeof data.createdAt === 'string' &&
    typeof data.updatedAt === 'string'
  );
};

const isValidEquipmentKit = (data: any): data is EquipmentKit => {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.id === 'string' &&
    typeof data.name === 'string' &&
    typeof data.type === 'string' &&
    typeof data.description === 'string' &&
    typeof data.specifications === 'object' &&
    Array.isArray(data.components) &&
    typeof data.operationalData === 'object' &&
    typeof data.financialData === 'object' &&
    Array.isArray(data.compatibleAircraft) &&
    typeof data.createdAt === 'string' &&
    typeof data.updatedAt === 'string'
  );
};

const isValidConfiguration = (data: any): data is AircraftKitConfiguration => {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.id === 'string' &&
    typeof data.aircraftId === 'string' &&
    typeof data.kitId === 'string' &&
    typeof data.configurationName === 'string' &&
    typeof data.weightAndBalance === 'object' &&
    typeof data.operationalLimits === 'object' &&
    typeof data.pricingModel === 'object' &&
    typeof data.performance === 'object' &&
    typeof data.createdAt === 'string' &&
    typeof data.updatedAt === 'string'
  );
};

const validateStoredData = (data: unknown): boolean => {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const typedData = data as any;

  // Check if aircraft array exists and all items are valid
  if (!Array.isArray(typedData.aircraft)) {
    return false;
  }

  for (const aircraft of typedData.aircraft) {
    if (!isValidAircraft(aircraft)) {
      return false;
    }
  }

  // Check if equipmentKits array exists and all items are valid
  if (!Array.isArray(typedData.equipmentKits)) {
    return false;
  }

  for (const kit of typedData.equipmentKits) {
    if (!isValidEquipmentKit(kit)) {
      return false;
    }
  }

  // Check if configurations array exists and all items are valid
  if (!Array.isArray(typedData.configurations)) {
    return false;
  }

  for (const config of typedData.configurations) {
    if (!isValidConfiguration(config)) {
      return false;
    }
  }

  return true;
};

// Debounce utility function
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

// Helper function for localStorage operations with error handling
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

// Aircraft Context Provider
export function AircraftProvider({ children }: { children: React.ReactNode }) {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [equipmentKits, setEquipmentKits] = useState<EquipmentKit[]>([]);
  const [configurations, setConfigurations] = useState<AircraftKitConfiguration[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Enhanced error handling function
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

  // Load data from localStorage with validation
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const data = safeOperation(() => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;

      const parsed = JSON.parse(stored);

      // Validate the stored data structure
      if (!validateStoredData(parsed)) {
        throw new Error('Invalid data format in localStorage');
      }

      return parsed;
    }, 'Failed to load aircraft data from localStorage');

    if (data) {
      setAircraft(data.aircraft || []);
      setEquipmentKits(data.equipmentKits || []);
      setConfigurations(data.configurations || []);
    }

    setIsLoading(false);
  }, [safeOperation]);

  // Save data to localStorage with error handling
  const saveData = useCallback(async () => {
    const data = {
      aircraft,
      equipmentKits,
      configurations,
      lastUpdated: new Date().toISOString(),
    };

    safeOperation(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    }, 'Failed to save aircraft data to localStorage');
  }, [aircraft, equipmentKits, configurations, safeOperation]);

  // Debounced save function
  const debouncedSave = useCallback(
    debounce(() => {
      saveData();
    }, 1000),
    [saveData]
  );

  // Clear all data
  const clearData = useCallback(async () => {
    setAircraft([]);
    setEquipmentKits([]);
    setConfigurations([]);
    safeOperation(
      () => {
        localStorage.removeItem(STORAGE_KEY);
        return true;
      },
      'Failed to clear aircraft data from localStorage'
    );
  }, [safeOperation]);

  // Aircraft CRUD operations with validation
  const createAircraft = useCallback(async (aircraftData: Omit<Aircraft, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    return safeOperation(() => {
      // Validate input data
      if (!aircraftData.registration || !aircraftData.manufacturer || !aircraftData.model) {
        throw new Error('Missing required fields: registration, manufacturer, or model');
      }

      const id = generateId();
      const now = new Date().toISOString();
      const newAircraft: Aircraft = {
        ...aircraftData,
        id,
        createdAt: now,
        updatedAt: now,
      };

      // Validate the constructed aircraft object
      if (!isValidAircraft(newAircraft)) {
        throw new Error('Invalid aircraft data structure');
      }

      setAircraft(prev => [...prev, newAircraft]);
      return id;
    }, 'Failed to create aircraft') || '';
  }, [safeOperation]);

  const updateAircraft = useCallback(async (id: string, updates: Partial<Omit<Aircraft, 'id' | 'createdAt' | 'updatedAt'>>) => {
    safeOperation(() => {
      if (!id) {
        throw new Error('Aircraft ID is required');
      }

      setAircraft(prev => {
        const aircraftExists = prev.some(aircraft => aircraft.id === id);
        if (!aircraftExists) {
          throw new Error(`Aircraft with ID ${id} not found`);
        }

        return prev.map(aircraft =>
          aircraft.id === id
            ? { ...aircraft, ...updates, updatedAt: new Date().toISOString() }
            : aircraft
        );
      });
    }, 'Failed to update aircraft');
  }, [safeOperation]);

  const deleteAircraft = useCallback(async (id: string) => {
    safeOperation(() => {
      if (!id) {
        throw new Error('Aircraft ID is required');
      }

      setAircraft(prev => {
        const aircraftExists = prev.some(aircraft => aircraft.id === id);
        if (!aircraftExists) {
          throw new Error(`Aircraft with ID ${id} not found`);
        }
        return prev.filter(aircraft => aircraft.id !== id);
      });

      // Also remove configurations for this aircraft
      setConfigurations(prev => prev.filter(config => config.aircraftId !== id));
    }, 'Failed to delete aircraft');
  }, [safeOperation]);

  const getAircraftById = useCallback((id: string): Aircraft | undefined => {
    return aircraft.find(a => a.id === id);
  }, [aircraft]);

  // Equipment Kit CRUD operations with validation
  const createEquipmentKit = useCallback(async (kitData: Omit<EquipmentKit, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    return safeOperation(() => {
      // Validate input data
      if (!kitData.name || !kitData.type) {
        throw new Error('Missing required fields: name or type');
      }

      const id = generateId();
      const now = new Date().toISOString();
      const newKit: EquipmentKit = {
        ...kitData,
        id,
        createdAt: now,
        updatedAt: now,
      };

      // Validate the constructed kit object
      if (!isValidEquipmentKit(newKit)) {
        throw new Error('Invalid equipment kit data structure');
      }

      setEquipmentKits(prev => [...prev, newKit]);
      return id;
    }, 'Failed to create equipment kit') || '';
  }, [safeOperation]);

  const updateEquipmentKit = useCallback(async (id: string, updates: Partial<Omit<EquipmentKit, 'id' | 'createdAt' | 'updatedAt'>>) => {
    safeOperation(() => {
      if (!id) {
        throw new Error('Equipment kit ID is required');
      }

      setEquipmentKits(prev => {
        const kitExists = prev.some(kit => kit.id === id);
        if (!kitExists) {
          throw new Error(`Equipment kit with ID ${id} not found`);
        }

        return prev.map(kit =>
          kit.id === id
            ? { ...kit, ...updates, updatedAt: new Date().toISOString() }
            : kit
        );
      });
    }, 'Failed to update equipment kit');
  }, [safeOperation]);

  const deleteEquipmentKit = useCallback(async (id: string) => {
    safeOperation(() => {
      if (!id) {
        throw new Error('Equipment kit ID is required');
      }

      setEquipmentKits(prev => {
        const kitExists = prev.some(kit => kit.id === id);
        if (!kitExists) {
          throw new Error(`Equipment kit with ID ${id} not found`);
        }
        return prev.filter(kit => kit.id !== id);
      });

      // Also remove configurations for this kit
      setConfigurations(prev => prev.filter(config => config.kitId !== id));
      // Remove kit from aircraft assignments
      setAircraft(prev =>
        prev.map(aircraft => ({
          ...aircraft,
          assignedKits: aircraft.assignedKits.filter(kitId => kitId !== id),
          updatedAt: new Date().toISOString(),
        }))
      );
    }, 'Failed to delete equipment kit');
  }, [safeOperation]);

  const getEquipmentKitById = useCallback((id: string): EquipmentKit | undefined => {
    return equipmentKits.find(k => k.id === id);
  }, [equipmentKits]);

  // Configuration CRUD operations with validation
  const createConfiguration = useCallback(async (configData: Omit<AircraftKitConfiguration, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    return safeOperation(() => {
      // Validate input data
      if (!configData.aircraftId || !configData.kitId || !configData.configurationName) {
        throw new Error('Missing required fields: aircraftId, kitId, or configurationName');
      }

      const id = generateId();
      const now = new Date().toISOString();
      const newConfig: AircraftKitConfiguration = {
        ...configData,
        id,
        createdAt: now,
        updatedAt: now,
      };

      // Validate the constructed configuration object
      if (!isValidConfiguration(newConfig)) {
        throw new Error('Invalid configuration data structure');
      }

      setConfigurations(prev => [...prev, newConfig]);
      return id;
    }, 'Failed to create configuration') || '';
  }, [safeOperation]);

  const updateConfiguration = useCallback(async (id: string, updates: Partial<Omit<AircraftKitConfiguration, 'id' | 'createdAt' | 'updatedAt'>>) => {
    safeOperation(() => {
      if (!id) {
        throw new Error('Configuration ID is required');
      }

      setConfigurations(prev => {
        const configExists = prev.some(config => config.id === id);
        if (!configExists) {
          throw new Error(`Configuration with ID ${id} not found`);
        }

        return prev.map(config =>
          config.id === id
            ? { ...config, ...updates, updatedAt: new Date().toISOString() }
            : config
        );
      });
    }, 'Failed to update configuration');
  }, [safeOperation]);

  const deleteConfiguration = useCallback(async (id: string) => {
    safeOperation(() => {
      if (!id) {
        throw new Error('Configuration ID is required');
      }

      setConfigurations(prev => {
        const configExists = prev.some(config => config.id === id);
        if (!configExists) {
          throw new Error(`Configuration with ID ${id} not found`);
        }
        return prev.filter(config => config.id !== id);
      });
    }, 'Failed to delete configuration');
  }, [safeOperation]);

  const getConfigurationById = useCallback((id: string): AircraftKitConfiguration | undefined => {
    return configurations.find(c => c.id === id);
  }, [configurations]);

  // Helper functions
  const getAvailableAircraft = useCallback((): Aircraft[] => {
    return aircraft.filter(a => a.status === 'operational');
  }, [aircraft]);

  const getCompatibleKits = useCallback((aircraftId: string): EquipmentKit[] => {
    const targetAircraft = aircraft.find(a => a.id === aircraftId);
    if (!targetAircraft) return [];

    return equipmentKits.filter(kit =>
      kit.compatibleAircraft.includes(targetAircraft.model) ||
      kit.compatibleAircraft.includes(aircraftId)
    );
  }, [aircraft, equipmentKits]);

  const getAircraftConfigurations = useCallback((aircraftId: string): AircraftKitConfiguration[] => {
    return configurations.filter(config => config.aircraftId === aircraftId);
  }, [configurations]);

  const getKitConfigurations = useCallback((kitId: string): AircraftKitConfiguration[] => {
    return configurations.filter(config => config.kitId === kitId);
  }, [configurations]);

  const getAircraftByStatus = useCallback((status: AircraftStatus): Aircraft[] => {
    return aircraft.filter(a => a.status === status);
  }, [aircraft]);

  const getKitsByType = useCallback((type: EquipmentKitType): EquipmentKit[] => {
    return equipmentKits.filter(kit => kit.type === type);
  }, [equipmentKits]);

  const getKitsByStatus = useCallback((status: OperationalStatus): EquipmentKit[] => {
    return equipmentKits.filter(kit => kit.operationalData.status === status);
  }, [equipmentKits]);

  const validateConfiguration = useCallback((aircraftId: string, kitId: string): boolean => {
    const targetAircraft = aircraft.find(a => a.id === aircraftId);
    const targetKit = equipmentKits.find(k => k.id === kitId);

    if (!targetAircraft || !targetKit) return false;

    // Check compatibility
    const isCompatible = targetKit.compatibleAircraft.includes(targetAircraft.model) ||
                        targetKit.compatibleAircraft.includes(aircraftId);

    // Check weight limits
    const weightWithinLimits = targetKit.specifications.weight <= targetAircraft.operationalLimits.maxPayloadWeight;

    // Check operational status
    const bothOperational = targetAircraft.status === 'operational' &&
                           targetKit.operationalData.status === 'available';

    return isCompatible && weightWithinLimits && bothOperational;
  }, [aircraft, equipmentKits]);

  // Auto-save when data changes (debounced to prevent excessive saves)
  useEffect(() => {
    if (aircraft.length > 0 || equipmentKits.length > 0 || configurations.length > 0) {
      // Cancel any pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Schedule a new debounced save
      debouncedSave();
    }
  }, [aircraft, equipmentKits, configurations, debouncedSave]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Memoized context value to prevent unnecessary re-renders
  const contextValue: AircraftContextType = useMemo(() => ({
    aircraft,
    equipmentKits,
    configurations,
    isLoading,
    error,
    createAircraft,
    updateAircraft,
    deleteAircraft,
    getAircraftById,
    createEquipmentKit,
    updateEquipmentKit,
    deleteEquipmentKit,
    getEquipmentKitById,
    createConfiguration,
    updateConfiguration,
    deleteConfiguration,
    getConfigurationById,
    getAvailableAircraft,
    getCompatibleKits,
    getAircraftConfigurations,
    getKitConfigurations,
    getAircraftByStatus,
    getKitsByType,
    getKitsByStatus,
    validateConfiguration,
    loadData,
    saveData,
    clearData,
  }), [
    aircraft,
    equipmentKits,
    configurations,
    isLoading,
    error,
    createAircraft,
    updateAircraft,
    deleteAircraft,
    getAircraftById,
    createEquipmentKit,
    updateEquipmentKit,
    deleteEquipmentKit,
    getEquipmentKitById,
    createConfiguration,
    updateConfiguration,
    deleteConfiguration,
    getConfigurationById,
    getAvailableAircraft,
    getCompatibleKits,
    getAircraftConfigurations,
    getKitConfigurations,
    getAircraftByStatus,
    getKitsByType,
    getKitsByStatus,
    validateConfiguration,
    loadData,
    saveData,
    clearData,
  ]);

  return (
    <AircraftContext.Provider value={contextValue}>
      {children}
    </AircraftContext.Provider>
  );
}

// Hook for using the context
export function useAircraft() {
  const context = useContext(AircraftContext);
  if (!context) {
    throw new Error('useAircraft must be used within AircraftProvider');
  }
  return context;
}