import DOMPurify from 'dompurify';

/**
 * Input sanitization utilities for JSA system security
 * Prevents XSS attacks and ensures data integrity in safety-critical aviation system
 */

// Configure DOMPurify for aviation safety data
const purifyConfig = {
  ALLOWED_TAGS: [], // No HTML tags allowed in safety data
  ALLOWED_ATTR: [],
  KEEP_CONTENT: true, // Preserve text content while removing HTML
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_DOM_IMPORT: false,
  SANITIZE_DOM: true
};

/**
 * Sanitizes text input to prevent XSS attacks while preserving safety-critical content
 * @param input - Raw user input string
 * @returns Sanitized string safe for storage and display
 */
export const sanitizeTextInput = (input: string): string => {
  if (typeof input !== 'string') {
    console.warn('Non-string input provided to sanitizeTextInput:', typeof input);
    return '';
  }

  // Trim whitespace and sanitize HTML
  const cleaned = input.trim();
  if (!cleaned) {
    return '';
  }

  // Use DOMPurify to remove any potential XSS vectors
  const sanitized = DOMPurify.sanitize(cleaned, purifyConfig);

  // Additional safety measures for aviation data
  return sanitized
    .replace(/[<>]/g, '') // Remove any remaining angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: URLs
    .replace(/on\w+=/gi, '') // Remove event handlers
    .substring(0, 2000); // Limit length for performance and storage
};

/**
 * Sanitizes hazard title with specific validation for safety requirements
 * @param title - Hazard title input
 * @returns Sanitized and validated hazard title
 */
export const sanitizeHazardTitle = (title: string): string => {
  const sanitized = sanitizeTextInput(title);

  // Ensure hazard titles are meaningful and not empty
  if (sanitized.length < 3) {
    return sanitized; // Let validation handle minimum length requirements
  }

  return sanitized.substring(0, 150); // Reasonable limit for hazard titles
};

/**
 * Sanitizes hazard description with preservation of safety-critical formatting
 * @param description - Hazard description input
 * @returns Sanitized hazard description
 */
export const sanitizeHazardDescription = (description: string): string => {
  const sanitized = sanitizeTextInput(description);

  // Preserve line breaks for readability in safety documentation
  return sanitized
    .replace(/\n\s*\n/g, '\n\n') // Normalize multiple line breaks
    .substring(0, 1000); // Reasonable limit for descriptions
};

/**
 * Sanitizes mitigation strategy text
 * @param mitigation - Mitigation strategy input
 * @returns Sanitized mitigation strategy
 */
export const sanitizeMitigation = (mitigation: string): string => {
  const sanitized = sanitizeTextInput(mitigation);
  return sanitized.substring(0, 500); // Reasonable limit for mitigation strategies
};

/**
 * Sanitizes person name with special handling for professional names
 * @param name - Person name input
 * @returns Sanitized name
 */
export const sanitizePersonName = (name: string): string => {
  const sanitized = sanitizeTextInput(name);

  // Allow common name characters including hyphens, apostrophes, and spaces
  return sanitized
    .replace(/[^a-zA-Z\s\-'\.]/g, '') // Keep only letters, spaces, hyphens, apostrophes, periods
    .replace(/\s+/g, ' ') // Normalize spaces
    .substring(0, 100); // Reasonable limit for names
};

/**
 * Sanitizes license number with format validation
 * @param license - License number input
 * @returns Sanitized license number
 */
export const sanitizeLicenseNumber = (license: string): string => {
  const sanitized = sanitizeTextInput(license);

  // Allow alphanumeric characters, hyphens, and spaces (common in license formats)
  return sanitized
    .replace(/[^a-zA-Z0-9\s\-]/g, '')
    .replace(/\s+/g, ' ')
    .substring(0, 50);
};

/**
 * Sanitizes contact details (phone, email, etc.)
 * @param contact - Contact information input
 * @returns Sanitized contact information
 */
export const sanitizeContactDetails = (contact: string): string => {
  const sanitized = sanitizeTextInput(contact);

  // Allow common contact characters
  return sanitized
    .replace(/[^a-zA-Z0-9\s\-\+\(\)@\.]/g, '')
    .substring(0, 200);
};

/**
 * Validates and sanitizes array of strings (like mitigations)
 * @param items - Array of string items
 * @param sanitizer - Sanitization function to apply
 * @returns Sanitized array with empty items filtered out
 */
export const sanitizeStringArray = (
  items: string[],
  sanitizer: (item: string) => string = sanitizeTextInput
): string[] => {
  if (!Array.isArray(items)) {
    console.warn('Non-array input provided to sanitizeStringArray');
    return [];
  }

  return items
    .map(sanitizer)
    .filter(item => item.trim().length > 0); // Remove empty items
};

/**
 * Comprehensive input validation for JSA records
 * @param input - Any input to be validated and sanitized
 * @returns Object with sanitized value and validation result
 */
export const validateAndSanitizeInput = (input: any): {
  sanitized: string;
  isValid: boolean;
  error?: string;
} => {
  try {
    if (input === null || input === undefined) {
      return { sanitized: '', isValid: true };
    }

    if (typeof input !== 'string') {
      return {
        sanitized: '',
        isValid: false,
        error: 'Input must be a string'
      };
    }

    const sanitized = sanitizeTextInput(input);
    return { sanitized, isValid: true };

  } catch (error) {
    console.error('Error in validateAndSanitizeInput:', error);
    return {
      sanitized: '',
      isValid: false,
      error: 'Sanitization failed'
    };
  }
};

/**
 * Debounced validation function for performance optimization
 */
let validationTimeout: NodeJS.Timeout;

export const debouncedValidation = <T>(
  validationFn: (data: T) => void,
  delay: number = 300
) => {
  return (data: T) => {
    clearTimeout(validationTimeout);
    validationTimeout = setTimeout(() => validationFn(data), delay);
  };
};