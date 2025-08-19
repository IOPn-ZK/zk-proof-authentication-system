/**
 * In-memory rate limiting implementation
 * For production, consider using Redis or similar persistent storage
 */

const rateLimitStore = new Map();

/**
 * Enhanced rate limiting configuration with progressive restrictions
 */
const RATE_LIMIT_CONFIG = {
  // General API endpoints
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // 100 requests per window
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  },
  // Authentication endpoints (stricter)
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 auth attempts per window
    skipSuccessfulRequests: true, // Only count failed attempts
    skipFailedRequests: false,
  },
  // ZK proof generation (very restrictive)
  zkProof: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 3, // 3 proof generations per window
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  },
  // Identity creation (restrictive)
  identity: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxRequests: 2, // 2 identity creations per window
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  },
  // Group operations
  group: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 10, // 10 group operations per window
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  },
  // Verification endpoints (moderate)
  verify: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 20, // 20 verifications per minute
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  },
  // Security status checks (lenient)
  status: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 60, // 60 status checks per minute
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  }
};

/**
 * Get client identifier (IP + User Agent for better uniqueness)
 * @param {object} req - Request object
 * @returns {string} - Client identifier
 */
function getClientId(req) {
  const ip = req.headers['x-forwarded-for'] || 
             req.headers['x-real-ip'] || 
             req.connection?.remoteAddress || 
             req.socket?.remoteAddress ||
             'unknown';
  
  const userAgent = req.headers['user-agent'] || 'unknown';
  return `${ip}-${Buffer.from(userAgent).toString('base64').slice(0, 20)}`;
}

/**
 * Clean expired entries from rate limit store
 */
function cleanExpiredEntries() {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Enhanced rate limiting middleware with progressive restrictions
 * @param {string} type - Rate limit type
 * @param {object} options - Additional options
 * @returns {function} - Middleware function
 */
export function rateLimit(type = 'default', options = {}) {
  return (req, res, next) => {
    const config = RATE_LIMIT_CONFIG[type] || RATE_LIMIT_CONFIG.default;
    const clientId = getClientId(req);
    const key = `${type}-${clientId}`;
    const now = Date.now();
    
    // Clean expired entries periodically
    if (Math.random() < 0.1) { // 10% chance to clean on each request
      cleanExpiredEntries();
    }
    
    let clientData = rateLimitStore.get(key);
    
    if (!clientData || now > clientData.resetTime) {
      // Initialize or reset the client data
      clientData = {
        count: 0,
        successCount: 0,
        failCount: 0,
        resetTime: now + config.windowMs,
        firstRequest: now,
        lastRequest: now
      };
      rateLimitStore.set(key, clientData);
    }
    
    // Update last request time
    clientData.lastRequest = now;
    
    // Check if we should count this request based on config
    const shouldCount = !options.skipRequest;
    
    if (shouldCount) {
      clientData.count++;
    }
    
    // Set enhanced rate limit headers
    res.setHeader('X-RateLimit-Limit', config.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, config.maxRequests - clientData.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(clientData.resetTime / 1000));
    res.setHeader('X-RateLimit-Window', config.windowMs);
    res.setHeader('X-RateLimit-Type', type);
    
    // Check rate limit
    if (clientData.count > config.maxRequests) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((clientData.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      
      // Log rate limit violation
      console.warn(`Rate limit exceeded for ${type}:`, {
        clientId: clientId.substring(0, 20) + '...',
        count: clientData.count,
        limit: config.maxRequests,
        window: config.windowMs,
        retryAfter
      });
      
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded for ${type}. Try again in ${retryAfter} seconds.`,
        retryAfter,
        limit: config.maxRequests,
        window: config.windowMs,
        type
      });
    }
    
    // Add rate limit info to request for handler use
    req.rateLimit = {
      limit: config.maxRequests,
      remaining: Math.max(0, config.maxRequests - clientData.count),
      reset: clientData.resetTime,
      current: clientData.count
    };
    
    // Continue to next middleware
    if (typeof next === 'function') {
      next();
    }
  };
}

/**
 * Apply rate limiting to API handler
 * @param {function} handler - API handler function
 * @param {string} type - Rate limit type
 * @returns {function} - Wrapped handler with rate limiting
 */
export function withRateLimit(handler, type = 'default') {
  return async (req, res) => {
    const rateLimitMiddleware = rateLimit(type);
    
    return new Promise((resolve, reject) => {
      rateLimitMiddleware(req, res, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(handler(req, res));
        }
      });
    });
  };
}

/**
 * Get current rate limit status for a client
 * @param {object} req - Request object
 * @param {string} type - Rate limit type
 * @returns {object} - Rate limit status
 */
export function getRateLimitStatus(req, type = 'default') {
  const config = RATE_LIMIT_CONFIG[type] || RATE_LIMIT_CONFIG.default;
  const clientId = getClientId(req);
  const key = `${type}-${clientId}`;
  const clientData = rateLimitStore.get(key);
  
  if (!clientData) {
    return {
      limit: config.maxRequests,
      remaining: config.maxRequests,
      resetTime: null,
      exceeded: false
    };
  }
  
  const now = Date.now();
  const isExpired = now > clientData.resetTime;
  
  return {
    limit: config.maxRequests,
    remaining: isExpired ? config.maxRequests : Math.max(0, config.maxRequests - clientData.count),
    resetTime: clientData.resetTime,
    exceeded: !isExpired && clientData.count > config.maxRequests
  };
}