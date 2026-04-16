/**
 * Enhanced error handling utilities for JSA system
 * Replaces browser alerts with proper UI error handling for production aviation systems
 */

export interface ErrorState {
  hasError: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'success';
  details?: string;
  code?: string;
  timestamp: string;
}

export interface FieldError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: FieldError[];
  warnings: FieldError[];
}

/**
 * Creates a standardized error state object
 */
export const createErrorState = (
  message: string,
  severity: ErrorState['severity'] = 'error',
  details?: string,
  code?: string
): ErrorState => ({
  hasError: true,
  message,
  severity,
  details,
  code,
  timestamp: new Date().toISOString()
});

/**
 * Creates a success state object
 */
export const createSuccessState = (message: string): ErrorState => ({
  hasError: false,
  message,
  severity: 'success',
  timestamp: new Date().toISOString()
});

/**
 * Clears error state
 */
export const clearErrorState = (): ErrorState => ({
  hasError: false,
  message: '',
  severity: 'info',
  timestamp: new Date().toISOString()
});

/**
 * Enhanced error handling for JSA validation
 */
export class JSAErrorHandler {
  private static errorHistory: ErrorState[] = [];

  /**
   * Handles validation errors with proper UI feedback
   */
  static handleValidationError(
    field: string,
    message: string,
    setError: (error: ErrorState) => void,
    setFieldErrors?: (errors: Record<string, string>) => void
  ): void {
    const errorState = createErrorState(
      `Validation Error: ${message}`,
      'error',
      `Field: ${field}`,
      'VALIDATION_ERROR'
    );

    setError(errorState);

    if (setFieldErrors) {
      setFieldErrors({ [field]: message });
    }

    this.logError(errorState);
  }

  /**
   * Handles missing required field errors
   */
  static handleRequiredFieldError(
    field: string,
    fieldName: string,
    setError: (error: ErrorState) => void,
    setFieldErrors?: (errors: Record<string, string>) => void
  ): void {
    const message = `${fieldName} is required for aviation safety compliance`;
    this.handleValidationError(field, message, setError, setFieldErrors);
  }

  /**
   * Handles safety-critical errors that require immediate attention
   */
  static handleCriticalError(
    message: string,
    setError: (error: ErrorState) => void,
    details?: string
  ): void {
    const errorState = createErrorState(
      `CRITICAL SAFETY ERROR: ${message}`,
      'error',
      details,
      'CRITICAL_ERROR'
    );

    setError(errorState);
    this.logError(errorState);

    // In production, this would trigger alerts to safety officers
    console.error('Critical JSA Error:', errorState);
  }

  /**
   * Handles CRP approval requirement warnings
   */
  static handleCRPApprovalWarning(
    setError: (error: ErrorState) => void
  ): void {
    const errorState = createErrorState(
      'Chief Remote Pilot approval required for high/extreme risk operations',
      'warning',
      'This JSA contains hazards that exceed standard risk thresholds',
      'CRP_APPROVAL_REQUIRED'
    );

    setError(errorState);
    this.logError(errorState);
  }

  /**
   * Handles save operation errors
   */
  static handleSaveError(
    error: Error,
    setError: (error: ErrorState) => void
  ): void {
    const errorState = createErrorState(
      'Failed to save JSA data',
      'error',
      error.message,
      'SAVE_ERROR'
    );

    setError(errorState);
    this.logError(errorState);
  }

  /**
   * Handles successful operations
   */
  static handleSuccess(
    message: string,
    setError: (error: ErrorState) => void
  ): void {
    const successState = createSuccessState(message);
    setError(successState);
    this.logError(successState);
  }

  /**
   * Validates hazard completeness
   */
  static validateHazard(
    hazard: any,
    setError: (error: ErrorState) => void,
    setFieldErrors?: (errors: Record<string, string>) => void
  ): ValidationResult {
    const errors: FieldError[] = [];
    const warnings: FieldError[] = [];

    // Title validation
    if (!hazard.title || hazard.title.trim().length === 0) {
      errors.push({
        field: 'title',
        message: 'Hazard title is required for safety analysis',
        severity: 'error'
      });
    } else if (hazard.title.trim().length < 3) {
      errors.push({
        field: 'title',
        message: 'Hazard title must be at least 3 characters for clarity',
        severity: 'error'
      });
    }

    // Description validation
    if (!hazard.description || hazard.description.trim().length === 0) {
      errors.push({
        field: 'description',
        message: 'Detailed hazard description is required for regulatory compliance',
        severity: 'error'
      });
    } else if (hazard.description.trim().length < 10) {
      warnings.push({
        field: 'description',
        message: 'Consider providing more detailed hazard description',
        severity: 'warning'
      });
    }

    // Mitigation validation
    if (!hazard.mitigations || !Array.isArray(hazard.mitigations)) {
      errors.push({
        field: 'mitigations',
        message: 'Mitigation strategies array is required',
        severity: 'error'
      });
    } else {
      const validMitigations = hazard.mitigations.filter((m: string) => m.trim().length > 0);
      if (validMitigations.length === 0) {
        errors.push({
          field: 'mitigations',
          message: 'At least one mitigation strategy is required for each hazard',
          severity: 'error'
        });
      } else if (validMitigations.length < 2 && hazard.riskLevel === 'high') {
        warnings.push({
          field: 'mitigations',
          message: 'High-risk hazards should have multiple mitigation strategies',
          severity: 'warning'
        });
      }
    }

    // Handle errors and warnings
    if (errors.length > 0) {
      const errorMessages = errors.map(e => `${e.field}: ${e.message}`).join('; ');
      this.handleValidationError('hazard', errorMessages, setError, setFieldErrors);
    }

    if (warnings.length > 0 && setFieldErrors) {
      const warningMap: Record<string, string> = {};
      warnings.forEach(w => {
        warningMap[w.field] = w.message;
      });
      // Note: In a real implementation, you'd have separate warning state
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validates complete JSA record
   */
  static validateCompleteJSA(
    jsa: any,
    setError: (error: ErrorState) => void
  ): ValidationResult {
    const errors: FieldError[] = [];
    const warnings: FieldError[] = [];

    // Responsible person validation
    if (!jsa.responsiblePerson?.name) {
      errors.push({
        field: 'responsiblePerson.name',
        message: 'Responsible person name is required',
        severity: 'error'
      });
    }

    if (!jsa.responsiblePerson?.licenseNumber) {
      errors.push({
        field: 'responsiblePerson.licenseNumber',
        message: 'License number is required for regulatory compliance',
        severity: 'error'
      });
    }

    // Emergency contacts validation
    if (!jsa.emergencyContacts?.primary?.name) {
      errors.push({
        field: 'emergencyContacts.primary.name',
        message: 'Primary emergency contact name is required',
        severity: 'error'
      });
    }

    if (!jsa.emergencyContacts?.primary?.phone) {
      errors.push({
        field: 'emergencyContacts.primary.phone',
        message: 'Primary emergency contact phone is required',
        severity: 'error'
      });
    }

    // Hazards validation
    if (!jsa.hazards || jsa.hazards.length === 0) {
      errors.push({
        field: 'hazards',
        message: 'At least one hazard must be identified',
        severity: 'error'
      });
    }

    // CRP approval validation
    const highRiskHazards = jsa.hazards?.filter(
      (h: any) => h.riskLevel === 'high' || h.riskLevel === 'extreme'
    ) || [];

    if (highRiskHazards.length > 0 && !jsa.signatures?.crp) {
      errors.push({
        field: 'signatures.crp',
        message: 'CRP approval required for high/extreme risk operations',
        severity: 'error'
      });
    }

    // Handle validation results
    if (errors.length > 0) {
      const errorMessage = `JSA validation failed: ${errors.length} error(s) found`;
      const errorDetails = errors.map(e => `${e.field}: ${e.message}`).join('\n');

      this.handleValidationError('jsa', errorMessage, setError);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Logs errors for monitoring and debugging
   */
  private static logError(error: ErrorState): void {
    this.errorHistory.push(error);

    // Keep only recent errors (last 100)
    if (this.errorHistory.length > 100) {
      this.errorHistory = this.errorHistory.slice(-100);
    }

    // In production, send to error monitoring service
    if (error.severity === 'error' || error.code === 'CRITICAL_ERROR') {
      console.error('JSA Error:', {
        message: error.message,
        details: error.details,
        code: error.code,
        timestamp: error.timestamp
      });
    }
  }

  /**
   * Gets error history for debugging
   */
  static getErrorHistory(): ErrorState[] {
    return [...this.errorHistory];
  }

  /**
   * Clears error history
   */
  static clearErrorHistory(): void {
    this.errorHistory = [];
  }
}

/**
 * Hook-like interface for React components
 */
export const useJSAErrorHandler = () => {
  return {
    handleValidationError: JSAErrorHandler.handleValidationError,
    handleRequiredFieldError: JSAErrorHandler.handleRequiredFieldError,
    handleCriticalError: JSAErrorHandler.handleCriticalError,
    handleCRPApprovalWarning: JSAErrorHandler.handleCRPApprovalWarning,
    handleSaveError: JSAErrorHandler.handleSaveError,
    handleSuccess: JSAErrorHandler.handleSuccess,
    validateHazard: JSAErrorHandler.validateHazard,
    validateCompleteJSA: JSAErrorHandler.validateCompleteJSA,
    createErrorState,
    createSuccessState,
    clearErrorState
  };
};