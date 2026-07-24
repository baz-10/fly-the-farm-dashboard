import { describe, expect, test, vi } from 'vitest';

/**
 * Security and Safety Tests for JSA System Fixes
 * Tests the critical security issues identified in Task 4
 */

import {
  sanitizeTextInput,
  sanitizeHazardTitle,
  sanitizeHazardDescription,
  sanitizePersonName,
  sanitizeLicenseNumber
} from '../inputSanitization';

import {
  isValidJSASystemRecord,
  isValidJSAHazard,
  safelyTransformJSAData
} from '../typeGuards';

import { JSAErrorHandler, createErrorState } from '../errorHandling';

describe('JSA Security Fixes', () => {
  describe('Input Sanitization (CRITICAL SECURITY)', () => {
    test('should sanitize XSS attempts in text input', () => {
      const maliciousInput = '<script>alert("XSS")</script>Test input';
      const sanitized = sanitizeTextInput(maliciousInput);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
      expect(sanitized).toContain('Test input');
    });

    test('should sanitize HTML tags in hazard titles', () => {
      const maliciousTitle = '<img src=x onerror=alert("XSS")>Weather Hazard';
      const sanitized = sanitizeHazardTitle(maliciousTitle);

      expect(sanitized).not.toContain('<img');
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).toContain('Weather Hazard');
    });

    test('should preserve safety-critical content while removing HTML', () => {
      const description = 'Risk of <b>electrical shock</b> during inspection. Use <em>safety protocols</em>.';
      const sanitized = sanitizeHazardDescription(description);

      expect(sanitized).toContain('electrical shock');
      expect(sanitized).toContain('safety protocols');
      expect(sanitized).not.toContain('<b>');
      expect(sanitized).not.toContain('<em>');
    });

    test('should sanitize person names properly', () => {
      const maliciousName = 'John<script>alert("hack")</script> Smith';
      const sanitized = sanitizePersonName(maliciousName);

      expect(sanitized).toBe('John Smith');
      expect(sanitized).not.toContain('<script>');
    });

    test('should handle license number sanitization', () => {
      const license = 'ABC-123<script>hack</script>';
      const sanitized = sanitizeLicenseNumber(license);

      expect(sanitized).toBe('ABC-123');
      expect(sanitized).not.toContain('<script>');
    });

    test('should limit input length for performance', () => {
      const longInput = 'x'.repeat(5000);
      const sanitized = sanitizeTextInput(longInput);

      expect(sanitized.length).toBeLessThanOrEqual(2000);
    });
  });

  describe('Type Guards (CRITICAL SAFETY)', () => {
    test('should validate JSA hazard structure safely', () => {
      const validHazard = {
        id: 'test-hazard',
        category: 'weather',
        title: 'Test Hazard',
        description: 'Test description',
        likelihood: 'medium',
        consequence: 'major',
        riskLevel: 'high',
        mitigations: ['Test mitigation'],
        residualRisk: 'medium',
        isPreDefined: true
      };

      expect(isValidJSAHazard(validHazard)).toBe(true);
    });

    test('should reject invalid hazard structures', () => {
      const invalidHazard = {
        id: 'test',
        // Missing required fields
        category: 'invalid-category',
        likelihood: 'invalid-level'
      };

      expect(isValidJSAHazard(invalidHazard)).toBe(false);
    });

    test('should safely transform data with fallback', () => {
      const invalidData = { invalid: 'data' };
      const fallback = { id: 'fallback', valid: true };

      const result = safelyTransformJSAData(
        invalidData,
        (data): data is any => false, // Always fail validation
        fallback,
        'Test error'
      );

      expect(result).toEqual(fallback);
    });

    test('should prevent type assertion bypasses', () => {
      const suspiciousData = {
        id: 'test',
        systemType: 'malicious-type', // Invalid enum value
      };

      // This should safely return false instead of crashing
      expect(isValidJSASystemRecord(suspiciousData)).toBe(false);
    });
  });

  describe('Error Handling (CRITICAL UX)', () => {
    test('should replace alert() with proper error handling', () => {
      const mockSetError = vi.fn();

      JSAErrorHandler.handleValidationError(
        'testField',
        'Test error message',
        mockSetError
      );

      expect(mockSetError).toHaveBeenCalledWith(
        expect.objectContaining({
          hasError: true,
          message: 'Validation Error: Test error message',
          severity: 'error'
        })
      );
    });

    test('should handle critical safety errors appropriately', () => {
      const mockSetError = vi.fn();

      JSAErrorHandler.handleCriticalError(
        'System failure',
        mockSetError,
        'Detailed error info'
      );

      expect(mockSetError).toHaveBeenCalledWith(
        expect.objectContaining({
          hasError: true,
          message: 'CRITICAL SAFETY ERROR: System failure',
          severity: 'error',
          details: 'Detailed error info',
          code: 'CRITICAL_ERROR'
        })
      );
    });

    test('should validate hazard with proper error feedback', () => {
      const mockSetError = vi.fn();
      const mockSetFieldErrors = vi.fn();

      const invalidHazard = {
        title: '', // Empty title should fail
        description: 'Test description',
        mitigations: []
      };

      const validation = JSAErrorHandler.validateHazard(
        invalidHazard,
        mockSetError,
        mockSetFieldErrors
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    test('should create standardized error states', () => {
      const result = createErrorState('Test error', 'error');

      expect(result.hasError).toBe(true);
      expect(result.message).toBe('Test error');
      expect(result.severity).toBe('error');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('Performance Optimization', () => {
    test('should handle large hazard arrays efficiently', () => {
      const largeHazardArray = Array.from({ length: 100 }, (_, i) => ({
        id: `hazard-${i}`,
        category: 'weather',
        title: `Hazard ${i}`,
        description: `Description ${i}`,
        likelihood: 'medium',
        consequence: 'major',
        riskLevel: 'high',
        mitigations: [`Mitigation ${i}`],
        residualRisk: 'medium',
        isPreDefined: false
      }));

      const startTime = performance.now();

      // Test validation performance
      const allValid = largeHazardArray.every(isValidJSAHazard);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(allValid).toBe(true);
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });
  });
});

describe('Integration Security Tests', () => {
  test('should prevent XSS in complete workflow', () => {
    const maliciousJSAData = {
      id: 'test-jsa',
      missionId: 'test-mission',
      systemType: 'standard',
      status: 'draft',
      jsaNumber: 'JSA-TEST-001',
      title: '<script>alert("XSS")</script>Test JSA',
      completedBy: 'test-user',
      responsiblePerson: {
        name: 'John<img src=x onerror=alert("hack")> Doe',
        licenseNumber: 'ABC123<script>hack()</script>',
        company: 'Test<b>Company</b>',
        contactDetails: 'test@evil<script>alert("pwned")</script>.com'
      },
      hazards: [{
        id: 'evil-hazard',
        category: 'weather',
        title: 'Weather<script>alert("XSS")</script> Hazard',
        description: 'Description with <img src=x onerror=alert("attack")>',
        likelihood: 'medium',
        consequence: 'major',
        riskLevel: 'high',
        mitigations: ['Mitigation<script>alert("hack")</script> strategy'],
        residualRisk: 'medium',
        isPreDefined: false
      }],
      emergencyContacts: {
        primary: {
          name: 'Emergency<script>alert("contact")</script>',
          relationship: 'Family',
          phone: '+1234567890'
        },
        emergencyServices: ['000']
      },
      overallRisk: {
        highestRiskLevel: 'high',
        totalHazards: 1,
        highRiskHazards: 1,
        extremeRiskHazards: 0,
        requiresCRPApproval: true
      },
      signatures: {
        pilot: {
          userId: 'test-user',
          name: 'Test User',
          signature: 'signature',
          signedAt: new Date().toISOString()
        }
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // After sanitization, no script tags should remain
    const sanitizedTitle = sanitizeTextInput(maliciousJSAData.title);
    const sanitizedName = sanitizePersonName(maliciousJSAData.responsiblePerson.name);
    const sanitizedHazardTitle = sanitizeHazardTitle(maliciousJSAData.hazards[0].title);

    expect(sanitizedTitle).not.toContain('<script>');
    expect(sanitizedName).not.toContain('<img');
    expect(sanitizedHazardTitle).not.toContain('<script>');

    // Content should be preserved
    expect(sanitizedTitle).toContain('Test JSA');
    expect(sanitizedName).toContain('John');
    expect(sanitizedName).toContain('Doe');
    expect(sanitizedHazardTitle).toContain('Weather');
    expect(sanitizedHazardTitle).toContain('Hazard');
  });
});
