import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
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

  // Load data from localStorage
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const data = safeLocalStorageOperation(
      () => {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
      },
      null,
      'Failed to load aircraft data from localStorage'
    );

    if (data) {
      setAircraft(data.aircraft || []);
      setEquipmentKits(data.equipmentKits || []);
      setConfigurations(data.configurations || []);
    }

    setIsLoading(false);
  }, []);

  // Save data to localStorage
  const saveData = useCallback(async () => {
    const data = {
      aircraft,
      equipmentKits,
      configurations,
      lastUpdated: new Date().toISOString(),
    };

    safeLocalStorageOperation(
      () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
      },
      false,
      'Failed to save aircraft data to localStorage'
    );
  }, [aircraft, equipmentKits, configurations]);

  // Clear all data
  const clearData = useCallback(async () => {
    setAircraft([]);
    setEquipmentKits([]);
    setConfigurations([]);
    safeLocalStorageOperation(
      () => {
        localStorage.removeItem(STORAGE_KEY);
        return true;
      },
      false,
      'Failed to clear aircraft data from localStorage'
    );
  }, []);

  // Aircraft CRUD operations
  const createAircraft = useCallback(async (aircraftData: Omit<Aircraft, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    const id = generateId();
    const now = new Date().toISOString();
    const newAircraft: Aircraft = {
      ...aircraftData,
      id,
      createdAt: now,
      updatedAt: now,
    };

    setAircraft(prev => [...prev, newAircraft]);
    return id;
  }, []);

  const updateAircraft = useCallback(async (id: string, updates: Partial<Omit<Aircraft, 'id' | 'createdAt' | 'updatedAt'>>) => {
    setAircraft(prev =>
      prev.map(aircraft =>
        aircraft.id === id
          ? { ...aircraft, ...updates, updatedAt: new Date().toISOString() }
          : aircraft
      )
    );
  }, []);

  const deleteAircraft = useCallback(async (id: string) => {
    setAircraft(prev => prev.filter(aircraft => aircraft.id !== id));
    // Also remove configurations for this aircraft
    setConfigurations(prev => prev.filter(config => config.aircraftId !== id));
  }, []);

  const getAircraftById = useCallback((id: string): Aircraft | undefined => {
    return aircraft.find(a => a.id === id);
  }, [aircraft]);

  // Equipment Kit CRUD operations
  const createEquipmentKit = useCallback(async (kitData: Omit<EquipmentKit, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    const id = generateId();
    const now = new Date().toISOString();
    const newKit: EquipmentKit = {
      ...kitData,
      id,
      createdAt: now,
      updatedAt: now,
    };

    setEquipmentKits(prev => [...prev, newKit]);
    return id;
  }, []);

  const updateEquipmentKit = useCallback(async (id: string, updates: Partial<Omit<EquipmentKit, 'id' | 'createdAt' | 'updatedAt'>>) => {
    setEquipmentKits(prev =>
      prev.map(kit =>
        kit.id === id
          ? { ...kit, ...updates, updatedAt: new Date().toISOString() }
          : kit
      )
    );
  }, []);

  const deleteEquipmentKit = useCallback(async (id: string) => {
    setEquipmentKits(prev => prev.filter(kit => kit.id !== id));
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
  }, []);

  const getEquipmentKitById = useCallback((id: string): EquipmentKit | undefined => {
    return equipmentKits.find(k => k.id === id);
  }, [equipmentKits]);

  // Configuration CRUD operations
  const createConfiguration = useCallback(async (configData: Omit<AircraftKitConfiguration, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    const id = generateId();
    const now = new Date().toISOString();
    const newConfig: AircraftKitConfiguration = {
      ...configData,
      id,
      createdAt: now,
      updatedAt: now,
    };

    setConfigurations(prev => [...prev, newConfig]);
    return id;
  }, []);

  const updateConfiguration = useCallback(async (id: string, updates: Partial<Omit<AircraftKitConfiguration, 'id' | 'createdAt' | 'updatedAt'>>) => {
    setConfigurations(prev =>
      prev.map(config =>
        config.id === id
          ? { ...config, ...updates, updatedAt: new Date().toISOString() }
          : config
      )
    );
  }, []);

  const deleteConfiguration = useCallback(async (id: string) => {
    setConfigurations(prev => prev.filter(config => config.id !== id));
  }, []);

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

  // Auto-save when data changes
  useEffect(() => {
    if (aircraft.length > 0 || equipmentKits.length > 0 || configurations.length > 0) {
      saveData();
    }
  }, [aircraft, equipmentKits, configurations, saveData]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  const contextValue: AircraftContextType = {
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
  };

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