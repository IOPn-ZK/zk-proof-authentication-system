import { rateLimit } from './rateLimit.js';
import { getValidSession } from './session.js';
import { db } from '../db/connection.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { validateRequestBody, sanitizeObject, validateMethod } from './validation.js';

/**
 * Comprehensive security middleware with all hardening features
 */

/**
 * Apply comprehensive security headers to response
 * @param {object} res - Response object
 * @param {string} requestUrl - Optional request URL for conditional headers
 */
function setSecurityHeaders(res, requestUrl = '') {
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
  
  // Cross-Origin-Opener-Policy
  // Note: Setting this can interfere with OAuth popups (Google, Auth0, etc.)
  // Only set for non-OAuth endpoints to avoid blocking popup communication
  // OAuth endpoints will work without this header (browser default)
  if (requestUrl && !requestUrl.includes('/api/auth/') && !requestUrl.includes('/api/zk/shares/cloud-backup')) {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  }
  
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
    const requestUrl = req?.url || '';
    setSecurityHeaders(res, requestUrl);
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
    // Capture req and res at the start to ensure they're always available in error handlers
    const request = req;
    const response = res;
    const method = req?.method || 'UNKNOWN';
    const url = req?.url || 'UNKNOWN';
    
    try {
      // Set comprehensive security headers (pass URL for conditional COOP header)
      setSecurityHeaders(response, url);
      
      // Handle CORS preflight
      if (handleCORS(request, response)) {
        return;
      }
      
      // Validate HTTP method FIRST (before any other processing)
      if (!validateMethod(method, allowedMethods)) {
        console.warn('Method not allowed', { 
          method: method, 
          allowedMethods, 
          url: url
        });
        return response.status(405).json({
          success: false,
          message: `Method ${method} not allowed`,
          error: 'METHOD_NOT_ALLOWED',
          allowedMethods
        });
      }
      
      // Apply rate limiting
      if (!skipRateLimit) {
        try {
          const rateLimitMiddleware = rateLimit(rateLimitType);
          let responseSent = false;
          
          // Track if response gets sent
          const checkResponseSent = () => {
            if (response.headersSent && !responseSent) {
              responseSent = true;
              console.log('Response sent by rate limiter, stopping middleware');
            }
            return responseSent;
          };
          
          await new Promise((resolve) => {
            // Set a timeout to prevent hanging
            const timeout = setTimeout(() => {
              console.warn('Rate limit middleware timeout, allowing request');
              resolve();
            }, 2000); // 2 second timeout
            
            // Call rate limiter
            rateLimitMiddleware(request, response, (error) => {
              clearTimeout(timeout);
              
              // Check if response was sent (rate limit exceeded)
              if (checkResponseSent()) {
                resolve('response_sent');
                return;
              }
              
              if (error) {
                console.warn('Rate limit middleware error, allowing request', { error: error.message });
              }
              resolve();
            });
          });
          
          // If rate limit response was sent, stop here
          if (response.headersSent) {
            return;
          }
        } catch (rateLimitError) {
          // If rate limiting fails completely, log and continue
          console.warn('Rate limiting failed, allowing request', { error: rateLimitError.message });
          // Check if response was already sent
          if (response.headersSent) {
            return;
          }
        }
      }
      
      // Sanitize request body
      if (request.body && typeof request.body === 'object') {
        request.body = sanitizeObject(request.body, {
          maxLength: 10000,
          allowHTML: false,
          preventXSS: true
        });
      }
      
      // Validate request body if schema provided
      if (validationSchema && request.body) {
        const validation = validateRequestBody(request.body, validationSchema);
        if (!validation.isValid) {
          return response.status(400).json({
            success: false,
            message: 'Invalid request data',
            error: 'VALIDATION_ERROR',
            details: validation.errors
          });
        }
        request.body = validation.sanitized;
      }
      
      // Handle authentication
      if (requireAuth) {
        try {
          const session = await getValidSession(request, response);
          if (!session) {
            return response.status(401).json({
              success: false,
              message: 'Authentication required',
              error: 'UNAUTHORIZED'
            });
          }
          request.session = session;

          // Attach RBAC role from DB (admin flag) - non-blocking
          try {
            const sub = session.user?.sub || null;
            if (sub) {
              const rows = await db.select().from(users).where(eq(users.auth0Sub, sub)).limit(1);
              request.session.roles = { isAdmin: rows.length > 0 ? !!rows[0].isAdmin : false };
            } else {
              request.session.roles = { isAdmin: false };
            }
          } catch (dbError) {
            console.warn('Failed to fetch user roles from DB, defaulting to non-admin', {
              error: dbError.message,
              sub: session.user?.sub
            });
            request.session.roles = { isAdmin: false };
          }
        } catch (authError) {
          console.error('Authentication error in middleware:', authError);
          if (!response.headersSent) {
            return response.status(500).json({
              success: false,
              message: 'Authentication error',
              error: 'AUTH_ERROR',
              details: process.env.NODE_ENV === 'development' ? authError.message : undefined
            });
          }
          return;
        }
      }
      
      // Add security context to request
      request.security = {
        rateLimited: !skipRateLimit,
        rateLimitType,
        authenticated: requireAuth,
        sanitized: true,
        validated: !!validationSchema,
        roles: request.session?.roles || { isAdmin: false }
      };
      
      // Check if response was already sent before calling handler
      if (response.headersSent) {
        console.warn('Response already sent, skipping handler', { method: method, url: url });
        return;
      }
      
      // Call the actual handler
      return await handler(request, response);
      
    } catch (error) {
      console.error('Security middleware error:', error);
      
      // Safely access req/res properties with fallbacks
      const errorMethod = method || (request?.method) || 'UNKNOWN';
      const errorUrl = url || (request?.url) || 'UNKNOWN';
      
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        method: errorMethod,
        url: errorUrl,
        allowedMethods
      });
      
      // Handle rate limit errors specifically
      if (error.message && error.message.includes('Rate limit')) {
        return; // Rate limit middleware already sent response
      }
      
      // Don't send response if headers already sent or response is not available
      if (!response || response.headersSent) {
        console.warn('Cannot send error response, headers already sent or response unavailable');
        return;
      }
      
      return response.status(500).json({
        success: false,
        message: 'Internal server error',
        error: 'SECURITY_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    requireAuth: true,
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
  },

  // Key share/cloud backup endpoints
  shares: {
    requireAuth: true,
    rateLimitType: 'default',
    allowedMethods: ['GET', 'POST'],
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