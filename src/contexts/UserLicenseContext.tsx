import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';

// State license mapping for auto-population
export interface StateLicenses {
  NSW: {
    chemcert_nsw?: boolean;
    poeo_permit?: string;
    applicator_permit_nsw?: string;
    spray_diary_nsw?: boolean;
    buffer_zones_nsw?: boolean;
    insurance_nsw?: boolean;
  };
  VIC: {
    acp_permit_vic?: string;
    commercial_license_vic?: string;
    equipment_calibration_vic?: boolean;
    epa_compliance_vic?: boolean;
    ffg_compliance_vic?: boolean;
    worksafe_notification_vic?: boolean;
  };
  QLD: {
    applicator_license_qld?: string;
    contractor_license_qld?: string;
    restricted_authority_qld?: string;
    vegetation_compliance_qld?: boolean;
    reef_protection_qld?: boolean;
    continuing_education_qld?: boolean;
  };
  SA: {
    producer_permit_sa?: string;
    control_order_sa?: boolean;
    native_vegetation_sa?: boolean;
    river_murray_sa?: boolean;
    landscape_consultation_sa?: boolean;
    professional_development_sa?: boolean;
  };
  WA: {
    technician_license_wa?: string;
    contractor_registration_wa?: string;
    use_pattern_wa?: boolean;
    water_rights_wa?: boolean;
    continuing_education_wa?: boolean;
    drummuster_wa?: boolean;
  };
  TAS: {
    crop_protection_tas?: string;
    applicator_license_tas?: string;
    threatened_species_tas?: boolean;
    empca_compliance_tas?: boolean;
    water_management_tas?: boolean;
    devil_protection_tas?: boolean;
  };
  NT: {
    chemical_permit_nt?: string;
    operator_license_nt?: string;
    epa_compliance_nt?: boolean;
    parks_wildlife_nt?: boolean;
    water_compliance_nt?: boolean;
    sacred_sites_nt?: string;
  };
  ACT: {
    pesticide_control_act?: boolean;
    urban_permit_act?: string;
    environment_protection_act?: boolean;
    nature_conservation_act?: boolean;
    tree_protection_act?: boolean;
    business_registration_act?: string;
    community_notification_act?: boolean;
  };
}

// User profile with license information
export interface UserLicenseProfile {
  userId: string;
  generalInfo: {
    applicatorName: string;
    primaryLicenseNumber: string;
    companyName: string;
    abn: string;
    insurancePolicyNumber: string;
    insuranceExpiryDate: string;
  };
  stateLicenses: StateLicenses;
  lastUpdated: string;
}

interface UserLicenseContextType {
  licenseProfile: UserLicenseProfile | null;
  isLoading: boolean;
  updateGeneralInfo: (info: Partial<UserLicenseProfile['generalInfo']>) => void;
  updateStateLicense: (state: keyof StateLicenses, field: string, value: string | boolean) => void;
  getAutoPopulateData: (state: keyof StateLicenses) => Record<string, any>;
  saveLicenseProfile: () => Promise<void>;
  loadLicenseProfile: () => Promise<void>;
}

const UserLicenseContext = createContext<UserLicenseContextType | undefined>(undefined);

const STORAGE_KEY = 'ftf_user_licenses';

export function UserLicenseProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [licenseProfile, setLicenseProfile] = useState<UserLicenseProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize empty profile for new users
  const createEmptyProfile = useCallback((): UserLicenseProfile => ({
    userId: user?.id || '',
    generalInfo: {
      applicatorName: user?.name || '',
      primaryLicenseNumber: '',
      companyName: '',
      abn: '',
      insurancePolicyNumber: '',
      insuranceExpiryDate: '',
    },
    stateLicenses: {
      NSW: {},
      VIC: {},
      QLD: {},
      SA: {},
      WA: {},
      TAS: {},
      NT: {},
      ACT: {},
    },
    lastUpdated: new Date().toISOString(),
  }), [user]);

  // Load license profile from localStorage
  const loadLicenseProfile = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const storedProfiles = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const userProfile = storedProfiles[user.id];

      if (userProfile) {
        setLicenseProfile(userProfile);
      } else {
        // Create empty profile for new users
        const emptyProfile = createEmptyProfile();
        setLicenseProfile(emptyProfile);
      }
    } catch (error) {
      console.error('Error loading license profile:', error);
      const emptyProfile = createEmptyProfile();
      setLicenseProfile(emptyProfile);
    } finally {
      setIsLoading(false);
    }
  }, [user, createEmptyProfile]);

  // Save license profile to localStorage
  const saveLicenseProfile = useCallback(async () => {
    if (!user?.id || !licenseProfile) return;

    try {
      const storedProfiles = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const updatedProfile = {
        ...licenseProfile,
        lastUpdated: new Date().toISOString(),
      };

      storedProfiles[user.id] = updatedProfile;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedProfiles));
      setLicenseProfile(updatedProfile);
    } catch (error) {
      console.error('Error saving license profile:', error);
      throw new Error('Failed to save license profile');
    }
  }, [user, licenseProfile]);

  // Update general applicator information
  const updateGeneralInfo = useCallback((info: Partial<UserLicenseProfile['generalInfo']>) => {
    setLicenseProfile(prev => {
      if (!prev) return null;
      return {
        ...prev,
        generalInfo: { ...prev.generalInfo, ...info },
      };
    });
  }, []);

  // Update state-specific license information
  const updateStateLicense = useCallback((state: keyof StateLicenses, field: string, value: string | boolean) => {
    setLicenseProfile(prev => {
      if (!prev) return null;
      return {
        ...prev,
        stateLicenses: {
          ...prev.stateLicenses,
          [state]: {
            ...prev.stateLicenses[state],
            [field]: value,
          },
        },
      };
    });
  }, []);

  // Get auto-populate data for a specific state's compliance form
  const getAutoPopulateData = useCallback((state: keyof StateLicenses): Record<string, any> => {
    if (!licenseProfile) return {};

    const stateData = licenseProfile.stateLicenses[state];
    const generalInfo = licenseProfile.generalInfo;

    // Combine state-specific data with general applicator information
    return {
      ...stateData,
      // Auto-populate applicator name and general info across all states
      applicatorName: generalInfo.applicatorName,
      primaryLicense: generalInfo.primaryLicenseNumber,
      companyName: generalInfo.companyName,
      insurancePolicy: generalInfo.insurancePolicyNumber,
    };
  }, [licenseProfile]);

  // Load profile when user changes
  useEffect(() => {
    if (user?.id) {
      loadLicenseProfile();
    } else {
      setLicenseProfile(null);
    }
  }, [user?.id, loadLicenseProfile]);

  return (
    <UserLicenseContext.Provider
      value={{
        licenseProfile,
        isLoading,
        updateGeneralInfo,
        updateStateLicense,
        getAutoPopulateData,
        saveLicenseProfile,
        loadLicenseProfile,
      }}
    >
      {children}
    </UserLicenseContext.Provider>
  );
}

export function useUserLicense() {
  const context = useContext(UserLicenseContext);
  if (!context) {
    throw new Error('useUserLicense must be used within UserLicenseProvider');
  }
  return context;
}