import validator from 'validator';

/**
 * Input validation and sanitization utilities
 */

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - Validation result
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  return validator.isEmail(email) && email.length <= 254;
}

/**
 * Validate commitment string (should be a valid BigInt string)
 * @param {string} commitment - Commitment to validate
 * @returns {boolean} - Validation result
 */
export function validateCommitment(commitment) {
  if (!commitment || typeof commitment !== 'string') {
    return false;
  }
  
  try {
    // Check if it's a valid BigInt
    const bigIntValue = BigInt(commitment);
    // Check if it's positive and within reasonable bounds
    return bigIntValue > 0n && commitment.length <= 100;
  } catch (error) {
    return false;
  }
}

/**
 * Validate ZK proof structure
 * @param {object} proof - Proof object to validate
 * @returns {boolean} - Validation result
 */
export function validateZKProof(proof) {
  if (!proof || typeof proof !== 'object') {
    return false;
  }
  
  // Check required fields
  const requiredFields = ['proof', 'publicSignals'];
  for (const field of requiredFields) {
    if (!proof[field]) {
      return false;
    }
  }
  
  // Validate proof structure
  if (!Array.isArray(proof.proof) || proof.proof.length === 0) {
    return false;
  }
  
  // Validate public signals
  if (!Array.isArray(proof.publicSignals) || proof.publicSignals.length === 0) {
    return false;
  }
  
  return true;
}

/**
 * Sanitize string input
 * @param {string} input - Input to sanitize
 * @param {object} options - Sanitization options
 * @returns {string} - Sanitized input
 */
export function sanitizeString(input, options = {}) {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  const {
    maxLength = 1000,
    allowHTML = false,
    trim = true
  } = options;
  
  let sanitized = input;
  
  // Trim whitespace
  if (trim) {
    sanitized = sanitized.trim();
  }
  
  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  // Escape HTML if not allowed
  if (!allowHTML) {
    sanitized = validator.escape(sanitized);
  }
  
  return sanitized;
}

/**
 * Validate and sanitize request body
 * @param {object} body - Request body to validate
 * @param {object} schema - Validation schema
 * @returns {object} - Validation result
 */
export function validateRequestBody(body, schema) {
  const errors = [];
  const sanitized = {};
  
  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: ['Request body must be a valid object'],
      sanitized: {}
    };
  }
  
  for (const [field, rules] of Object.entries(schema)) {
    const value = body[field];
    
    // Check required fields
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`Field '${field}' is required`);
      continue;
    }
    
    // Skip validation for optional empty fields
    if (!rules.required && (value === undefined || value === null || value === '')) {
      continue;
    }
    
    // Type validation
    if (rules.type && typeof value !== rules.type) {
      errors.push(`Field '${field}' must be of type ${rules.type}`);
      continue;
    }
    
    // String validation
    if (rules.type === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`Field '${field}' must be at least ${rules.minLength} characters long`);
        continue;
      }
      
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`Field '${field}' must be at most ${rules.maxLength} characters long`);
        continue;
      }
      
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`Field '${field}' format is invalid`);
        continue;
      }
      
      // Sanitize string
      sanitized[field] = sanitizeString(value, {
        maxLength: rules.maxLength || 1000,
        allowHTML: rules.allowHTML || false
      });
    } else {
      sanitized[field] = value;
    }
    
    // Custom validation
    if (rules.validate && typeof rules.validate === 'function') {
      const customResult = rules.validate(value);
      if (customResult !== true) {
        errors.push(customResult || `Field '${field}' is invalid`);
        continue;
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Common validation schemas
 */
export const schemas = {
  identity: {
    // No body validation needed for identity creation
  },
  
  groupMember: {
    commitment: {
      required: true,
      type: 'string',
      validate: validateCommitment
    }
  },
  
  proof: {
    signal: {
      required: true,
      type: 'number'
    },
    externalNullifier: {
      required: true,
      type: 'number'
    },
    groupId: {
      required: true,
      type: 'number'
    },
    treeDepth: {
      required: true,
      type: 'number'
    }
  },
  
  zkProof: {
    fullProof: {
      required: true,
      type: 'object',
      validate: validateZKProof
    }
  }
};

/**
 * Validate HTTP method
 * @param {string} method - HTTP method
 * @param {array} allowedMethods - Allowed methods
 * @returns {boolean} - Validation result
 */
export function validateMethod(method, allowedMethods) {
  return allowedMethods.includes(method);
}

/**
 * Validate session
 * @param {object} session - Session object
 * @returns {boolean} - Validation result
 */
export function validateSession(session) {
  if (!session || !session.user) {
    return false;
  }
  
  if (!session.user.email || !validateEmail(session.user.email)) {
    return false;
  }
  
  return true;
}