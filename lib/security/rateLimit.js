/**
 * In-memory rate limiting implementation
 * For production, consider using Redis or similar persistent storage
 */

const rateLimitStore = new Map();

/**
 * Rate limiting configuration
 */
const RATE_LIMIT_CONFIG = {
  // General API endpoints
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // 100 requests per window
  },
  // Authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10, // 10 auth attempts per window
  },
  // ZK proof generation (more restrictive)
  zkProof: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 5, // 5 proof generations per window
  },
  // Identity creation
  identity: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxRequests: 3, // 3 identity creations per window
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
 * Rate limiting middleware
 * @param {string} type - Rate limit type (default, auth, zkProof, identity)
 * @returns {function} - Middleware function
 */
export function rateLimit(type = 'default') {
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
        count: 1,
        resetTime: now + config.windowMs,
        firstRequest: now
      };
      rateLimitStore.set(key, clientData);
    } else {
      // Increment the request count
      clientData.count++;
    }
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', config.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, config.maxRequests - clientData.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(clientData.resetTime / 1000));
    
    if (clientData.count > config.maxRequests) {
      // Rate limit exceeded
      res.setHeader('Retry-After', Math.ceil((clientData.resetTime - now) / 1000));
      
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil((clientData.resetTime - now) / 1000)} seconds.`,
        retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
      });
    }
    
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