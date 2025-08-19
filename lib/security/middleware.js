import { rateLimit } from './rateLimit.js';
import { getValidSession } from './session.js';
import { validateRequestBody, sanitizeObject, validateMethod } from './validation.js';

/**
 * Comprehensive security middleware with all hardening features
 */

/**
 * Apply comprehensive security headers to response
 * @param {object} res - Response object
 */
function setSecurityHeaders(res) {
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  // Core security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https:; " +
    "font-src 'self'; " +
    "object-src 'none'; " +
    "media-src 'self'; " +
    "frame-src 'none';"
  );
  
  // HSTS (HTTP Strict Transport Security)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Permissions Policy
  res.setHeader('Permissions-Policy', 
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
  );
  
  // CORS headers with stricter configuration
  const allowedOrigins = [
    process.env.AUTH0_BASE_URL,
    process.env.NGROK_BASE_URL,
    'http://localhost:3000',
    'https://localhost:3000'
  ].filter(Boolean);
  
  res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0] || 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); 
}

/**
 * Handle CORS preflight requests
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @returns {boolean} - Whether request was handled
 */
function handleCORS(req, res) {
  if (req.method === 'OPTIONS') {
    setSecurityHeaders(res);
    res.status(200).end();
    return true;
  }
  return false;
}

/**
 * Comprehensive security middleware with all hardening features
 * @param {function} handler - API handler function
 * @param {object} options - Security options
 * @returns {function} - Wrapped handler with full security
 */
export function withComprehensiveSecurity(handler, options = {}) {
  const {
    requireAuth = true,
    rateLimitType = 'default',
    allowedMethods = ['GET', 'POST'],
    validationSchema = null,
    skipRateLimit = false
  } = options;

  return async (req, res) => {
    try {
      // Set comprehensive security headers
      setSecurityHeaders(res);
      
      // Handle CORS preflight
      if (handleCORS(req, res)) {
        return;
      }
      
      // Validate HTTP method
      if (!validateMethod(req.method, allowedMethods)) {
        return res.status(405).json({
          success: false,
          message: `Method ${req.method} not allowed`,
          error: 'METHOD_NOT_ALLOWED',
          allowedMethods
        });
      }
      
      // Apply rate limiting
      if (!skipRateLimit) {
        const rateLimitMiddleware = rateLimit(rateLimitType);
        await new Promise((resolve, reject) => {
          rateLimitMiddleware(req, res, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }
      
      // Sanitize request body
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body, {
          maxLength: 10000,
          allowHTML: false,
          preventXSS: true
        });
      }
      
      // Validate request body if schema provided
      if (validationSchema && req.body) {
        const validation = validateRequestBody(req.body, validationSchema);
        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            message: 'Invalid request data',
            error: 'VALIDATION_ERROR',
            details: validation.errors
          });
        }
        req.body = validation.sanitized;
      }
      
      // Handle authentication
      if (requireAuth) {
        const session = await getValidSession(req, res);
        if (!session) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required',
            error: 'UNAUTHORIZED'
          });
        }
        req.session = session;
      }
      
      // Add security context to request
      req.security = {
        rateLimited: !skipRateLimit,
        rateLimitType,
        authenticated: requireAuth,
        sanitized: true,
        validated: !!validationSchema
      };
      
      // Call the actual handler
      return handler(req, res);
      
    } catch (error) {
      console.error('Security middleware error:', error);
      
      // Handle rate limit errors specifically
      if (error.message && error.message.includes('Rate limit')) {
        return; // Rate limit middleware already sent response
      }
      
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: 'SECURITY_ERROR'
      });
    }
  };
}

/**
 * Legacy session middleware (kept for backward compatibility)
 * @param {function} handler - API handler function
 * @returns {function} - Wrapped handler with session validation
 */
export function withSession(handler) {
  return withComprehensiveSecurity(handler, {
    requireAuth: true,
    rateLimitType: 'default',
    allowedMethods: ['GET', 'POST']
  });
}

/**
 * Enhanced security configurations for different endpoint types
 */
export const securityConfigs = {
  // Identity creation endpoint
  identity: {
    requireAuth: true,
    rateLimitType: 'identity',
    allowedMethods: ['POST'],
    validationSchema: null // No body validation needed for identity creation
  },
  
  // Group member addition
  groupMember: {
    requireAuth: true,
    rateLimitType: 'group',
    allowedMethods: ['POST'],
    validationSchema: {
      commitment: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 100
      }
    }
  },
  
  // Group data retrieval
  groupData: {
    requireAuth: true,
    rateLimitType: 'group',
    allowedMethods: ['GET'],
    validationSchema: null
  },
  
  // ZK proof generation
  proofGeneration: {
    requireAuth: true,
    rateLimitType: 'zkProof',
    allowedMethods: ['POST'],
    validationSchema: {
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
    }
  },
  
  // ZK proof verification
  zkProof: {
    requireAuth: false,
    rateLimitType: 'verify',
    allowedMethods: ['POST'],
    validationSchema: {
      fullProof: {
        required: true,
        type: 'object'
      }
    }
  },
  
  // Group reset (admin operation)
  groupReset: {
    requireAuth: true,
    rateLimitType: 'group',
    allowedMethods: ['POST'],
    validationSchema: null
  },
  
  // Security status endpoint
  securityStatus: {
    requireAuth: false,
    rateLimitType: 'status',
    allowedMethods: ['GET'],
    validationSchema: null
  }
};

/**
 * Enhanced security wrapper with predefined configurations
 * @param {string} configName - Configuration name
 * @returns {function} - Security middleware
 */
export function withSecurityConfig(configName) {
  const config = securityConfigs[configName];
  if (!config) {
    throw new Error(`Unknown security configuration: ${configName}`);
  }
  
  return (handler) => withComprehensiveSecurity(handler, config);
}

/**
 * Create custom security middleware with specific options
 * @param {object} options - Security options
 * @returns {function} - Security middleware
 */
export function withCustomSecurity(options) {
  return (handler) => withComprehensiveSecurity(handler, options);
}