import { getSession } from '@auth0/nextjs-auth0';

/**
 * Simplified security middleware that focuses on core functionality
 */

/**
 * Apply security headers to response
 * @param {object} res - Response object
 */
function setSecurityHeaders(res) {
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', process.env.AUTH0_BASE_URL || 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
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
 * Simple session validation middleware
 * @param {function} handler - API handler function
 * @returns {function} - Wrapped handler with session validation
 */
export function withSession(handler) {
  return async (req, res) => {
    try {
      // Set security headers
      setSecurityHeaders(res);
      
      // Handle CORS preflight
      if (handleCORS(req, res)) {
        return;
      }
      
      // Get session from Auth0
      const session = await getSession(req, res);
      
      if (!session || !session.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          error: 'UNAUTHORIZED'
        });
      }
      
      // Add session to request for handler use
      req.session = session;
      
      // Call the actual handler
      return handler(req, res);
      
    } catch (error) {
      console.error('Session middleware error:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: 'SESSION_ERROR'
      });
    }
  };
}

/**
 * Predefined security configurations for different endpoint types
 */
export const securityConfigs = {
  // Identity creation endpoint
  identity: {
    requireAuth: true,
    allowedMethods: ['POST']
  },
  
  // Group member addition
  groupMember: {
    requireAuth: true,
    allowedMethods: ['POST']
  },
  
  // Group data retrieval
  groupData: {
    requireAuth: true,
    allowedMethods: ['GET']
  },
  
  // ZK proof generation
  proofGeneration: {
    requireAuth: true,
    allowedMethods: ['POST']
  },
  
  // ZK proof verification
  zkProof: {
    requireAuth: false,
    allowedMethods: ['POST']
  },
  
  // Group reset (admin operation)
  groupReset: {
    requireAuth: true,
    allowedMethods: ['POST']
  }
};

/**
 * Quick security wrapper with predefined config
 * @param {string} configName - Configuration name
 * @returns {function} - Security middleware
 */
export function withSecurityConfig(configName) {
  const config = securityConfigs[configName];
  if (!config) {
    throw new Error(`Unknown security configuration: ${configName}`);
  }
  
  if (config.requireAuth) {
    return withSession;
  } else {
    // For endpoints that don't require auth, just apply basic security
    return (handler) => async (req, res) => {
      try {
        setSecurityHeaders(res);
        if (handleCORS(req, res)) return;
        return handler(req, res);
      } catch (error) {
        console.error('Security middleware error:', error);
        return res.status(500).json({
          success: false,
          message: 'Internal server error'
        });
      }
    };
  }
}