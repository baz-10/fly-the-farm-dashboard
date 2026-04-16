/**
 * Type guards and validation utilities for JSA system type safety
 * Replaces unsafe type assertions with proper runtime validation
 */

import {
  JSASystemRecord,
  JSAHazard,
  JSASystemType,
  IndustryType,
  RiskLevel,
  LikelihoodLevel,
  ConsequenceLevel
} from '../types/jsa';

/**
 * Type guard to validate JSASystemType
 */
export const isValidJSASystemType = (value: any): value is JSASystemType => {
  return typeof value === 'string' &&
         ['standard', 'comprehensive', 'industry-specific'].includes(value);
};

/**
 * Type guard to validate IndustryType
 */
export const isValidIndustryType = (value: any): value is IndustryType => {
  return typeof value === 'string' &&
         ['crop-spraying', 'surveying', 'inspections'].includes(value);
};

/**
 * Type guard to validate RiskLevel
 */
export const isValidRiskLevel = (value: any): value is RiskLevel => {
  return typeof value === 'string' &&
         ['low', 'medium', 'high', 'extreme'].includes(value);
};

/**
 * Type guard to validate LikelihoodLevel
 */
export const isValidLikelihoodLevel = (value: any): value is LikelihoodLevel => {
  return typeof value === 'string' &&
         ['low', 'medium', 'high'].includes(value);
};

/**
 * Type guard to validate ConsequenceLevel
 */
export const isValidConsequenceLevel = (value: any): value is ConsequenceLevel => {
  return typeof value === 'string' &&
         ['minor', 'moderate', 'major', 'catastrophic'].includes(value);
};

/**
 * Type guard to validate JSAHazard structure
 */
export const isValidJSAHazard = (value: any): value is JSAHazard => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const requiredStringFields = ['id', 'title', 'description'];
  for (const field of requiredStringFields) {
    if (typeof value[field] !== 'string') {
      return false;
    }
  }

  // Validate enum fields
  if (!isValidLikelihoodLevel(value.likelihood)) return false;
  if (!isValidConsequenceLevel(value.consequence)) return false;
  if (!isValidRiskLevel(value.riskLevel)) return false;
  if (!isValidRiskLevel(value.residualRisk)) return false;

  // Validate mitigations array
  if (!Array.isArray(value.mitigations)) return false;
  if (!value.mitigations.every((m: any) => typeof m === 'string')) return false;

  // Validate boolean fields
  if (typeof value.isPreDefined !== 'boolean') return false;

  // Validate category
  const validCategories = [
    'weather', 'obstacles', 'wildlife', 'mechanical', 'human-factors',
    'airspace', 'ground-personnel', 'battery', 'chemical', 'privacy',
    'infrastructure', 'electrical', 'thermal', 'custom'
  ];
  if (!validCategories.includes(value.category)) return false;

  return true;
};

/**
 * Type guard to validate responsible person structure
 */
export const isValidResponsiblePerson = (value: any): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const requiredFields = ['name', 'licenseNumber', 'company', 'contactDetails'];
  return requiredFields.every(field => typeof value[field] === 'string');
};

/**
 * Type guard to validate emergency contacts structure
 */
export const isValidEmergencyContacts = (value: any): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  // Validate primary contact
  if (!value.primary || typeof value.primary !== 'object') {
    return false;
  }

  const primaryFields = ['name', 'relationship', 'phone'];
  if (!primaryFields.every(field => typeof value.primary[field] === 'string')) {
    return false;
  }

  // Validate emergency services array
  if (!Array.isArray(value.emergencyServices)) {
    return false;
  }

  if (!value.emergencyServices.every((service: any) => typeof service === 'string')) {
    return false;
  }

  return true;
};

/**
 * Type guard to validate overall risk structure
 */
export const isValidOverallRisk = (value: any): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  // Check required fields and types
  if (!isValidRiskLevel(value.highestRiskLevel)) return false;
  if (typeof value.totalHazards !== 'number' || value.totalHazards < 0) return false;
  if (typeof value.highRiskHazards !== 'number' || value.highRiskHazards < 0) return false;
  if (typeof value.extremeRiskHazards !== 'number' || value.extremeRiskHazards < 0) return false;
  if (typeof value.requiresCRPApproval !== 'boolean') return false;

  return true;
};

/**
 * Type guard to validate signature structure
 */
export const isValidSignature = (value: any): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const requiredFields = ['userId', 'name', 'signature', 'signedAt'];
  return requiredFields.every(field => typeof value[field] === 'string');
};

/**
 * Type guard to validate signatures structure
 */
export const isValidSignatures = (value: any): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  // Pilot signature is required
  if (!isValidSignature(value.pilot)) {
    return false;
  }

  // CRP signature is optional but must be valid if present
  if (value.crp && !isValidSignature(value.crp)) {
    return false;
  }

  return true;
};

/**
 * Comprehensive type guard to validate complete JSASystemRecord
 */
export const isValidJSASystemRecord = (value: any): value is JSASystemRecord => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  // Validate required string fields
  const requiredStringFields = [
    'id', 'missionId', 'jsaNumber', 'title', 'completedBy', 'createdAt', 'updatedAt'
  ];
  for (const field of requiredStringFields) {
    if (typeof value[field] !== 'string') {
      return false;
    }
  }

  // Validate enum fields
  if (!isValidJSASystemType(value.systemType)) return false;

  // Industry type is optional but must be valid if present
  if (value.industryType && !isValidIndustryType(value.industryType)) {
    return false;
  }

  // Validate status
  const validStatuses = ['draft', 'in-progress', 'completed', 'approved', 'rejected'];
  if (!validStatuses.includes(value.status)) {
    return false;
  }

  // Validate complex objects
  if (!isValidResponsiblePerson(value.responsiblePerson)) return false;
  if (!isValidEmergencyContacts(value.emergencyContacts)) return false;
  if (!isValidOverallRisk(value.overallRisk)) return false;
  if (!isValidSignatures(value.signatures)) return false;

  // Validate hazards array
  if (!Array.isArray(value.hazards)) return false;
  if (!value.hazards.every(isValidJSAHazard)) return false;

  return true;
};

/**
 * Safe data transformation with validation
 */
export const safelyTransformJSAData = <T>(
  data: any,
  validator: (data: any) => data is T,
  fallbackValue: T,
  errorMessage?: string
): T => {
  try {
    if (validator(data)) {
      return data;
    } else {
      console.warn(errorMessage || 'Data validation failed, using fallback', data);
      return fallbackValue;
    }
  } catch (error) {
    console.error('Error during data transformation:', error);
    return fallbackValue;
  }
};

/**
 * Validates JSA data with detailed error reporting
 */
export const validateJSAWithErrors = (data: any): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} => {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    if (!data || typeof data !== 'object') {
      errors.push('JSA data must be an object');
      return { isValid: false, errors, warnings };
    }

    // Check required fields
    if (!data.id) errors.push('JSA ID is required');
    if (!data.missionId) errors.push('Mission ID is required');
    if (!data.systemType) errors.push('System type is required');

    // Validate system type
    if (data.systemType && !isValidJSASystemType(data.systemType)) {
      errors.push(`Invalid system type: ${data.systemType}`);
    }

    // Validate industry type if present
    if (data.industryType && !isValidIndustryType(data.industryType)) {
      errors.push(`Invalid industry type: ${data.industryType}`);
    }

    // Check hazards
    if (!Array.isArray(data.hazards)) {
      errors.push('Hazards must be an array');
    } else {
      data.hazards.forEach((hazard: any, index: number) => {
        if (!isValidJSAHazard(hazard)) {
          errors.push(`Invalid hazard at index ${index}`);
        }
      });
    }

    // Check responsible person
    if (!isValidResponsiblePerson(data.responsiblePerson)) {
      errors.push('Invalid responsible person data');
    }

    // Warnings for optional but recommended fields
    if (!data.completedDate) {
      warnings.push('Completion date not set');
    }

    if (data.overallRisk?.requiresCRPApproval && !data.signatures?.crp) {
      warnings.push('CRP approval required but signature missing');
    }

  } catch (error) {
    errors.push(`Validation error: ${(error as Error).message}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Performance optimized validation for large datasets
 */
export const validateJSABatch = (jsaRecords: any[]): {
  validRecords: JSASystemRecord[];
  invalidRecords: { record: any; errors: string[] }[];
} => {
  const validRecords: JSASystemRecord[] = [];
  const invalidRecords: { record: any; errors: string[] }[] = [];

  jsaRecords.forEach(record => {
    const validation = validateJSAWithErrors(record);
    if (validation.isValid) {
      validRecords.push(record as JSASystemRecord);
    } else {
      invalidRecords.push({ record, errors: validation.errors });
    }
  });

  return { validRecords, invalidRecords };
};