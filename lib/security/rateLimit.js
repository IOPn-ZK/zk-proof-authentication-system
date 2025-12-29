/**
 * Redis-based rate limiting implementation
 * For production, uses Redis for distributed rate limiting
 */

import { redis, sessionKeys, isRedisAvailable } from '../redis/connection.js';
import logger from '../logging/logger.js';

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
  // Identity creation and wallet export (moderate)
  identity: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxRequests: 15, // 15 requests per window (increased for wallet export)
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
 * Enhanced rate limiting middleware with Redis backend
 * @param {string} type - Rate limit type
 * @param {object} options - Additional options
 * @returns {function} - Middleware function
 */
export function rateLimit(type = 'default', options = {}) {
  return async (req, res, next) => {
    const config = RATE_LIMIT_CONFIG[type] || RATE_LIMIT_CONFIG.default;
    const clientId = getClientId(req);
    const key = sessionKeys.rateLimit(clientId, type);
    const now = Date.now();
    
    // If Redis is not available, skip rate limiting and allow request
    if (!isRedisAvailable()) {
      logger.debug('Redis not available, skipping rate limiting', { type, clientId: clientId.substring(0, 20) });
      if (typeof next === 'function') {
        next();
      }
      return;
    }
    
    try {
      // Get current rate limit data from Redis
      let clientData = null;
      try {
        clientData = await redis.get(key);
      } catch (redisError) {
        // If Redis operation fails, allow request but log
        logger.warn('Redis operation failed for rate limiting, allowing request', { 
          error: redisError.message,
          type 
        });
        if (typeof next === 'function') {
          next();
        }
        return;
      }
      
      if (!clientData) {
        // Initialize new rate limit window
        clientData = {
          count: 0,
          resetTime: now + config.windowMs,
          firstRequest: now,
          lastRequest: now
        };
        try {
          await redis.setex(key, Math.ceil(config.windowMs / 1000), JSON.stringify(clientData));
        } catch (redisError) {
          logger.warn('Failed to set rate limit in Redis, continuing', { error: redisError.message });
        }
        
        // Persist to DB asynchronously
        (async () => {
          try {
            const { db } = await import('../db/connection.js');
            const { rateLimits } = await import('../db/schema.js');
            const { eq, and } = await import('drizzle-orm');
            
            const windowStart = new Date(now);
            const expiresAt = new Date(now + config.windowMs);
            
            const existing = await db.select().from(rateLimits).where(and(
              eq(rateLimits.identifier, clientId), 
              eq(rateLimits.action, type)
            )).limit(1);
            
            if (existing.length > 0) {
              await db.update(rateLimits)
                .set({ count: 0, windowStart, expiresAt, updatedAt: new Date() })
                .where(and(
                  eq(rateLimits.identifier, clientId), 
                  eq(rateLimits.action, type)
                ));
            } else {
              await db.insert(rateLimits).values({ 
                identifier: clientId, 
                action: type, 
                count: 0, 
                windowStart, 
                expiresAt, 
                createdAt: new Date(), 
                updatedAt: new Date() 
              });
            }
          } catch (e) {
            logger.warn('Rate limit DB window init failed', { error: e?.message });
          }
        })();
      } else {
        clientData = JSON.parse(clientData);
        
        // Check if window has expired
        if (now > clientData.resetTime) {
          clientData = {
            count: 0,
            resetTime: now + config.windowMs,
            firstRequest: now,
            lastRequest: now
          };
          try {
            await redis.setex(key, Math.ceil(config.windowMs / 1000), JSON.stringify(clientData));
          } catch (redisError) {
            logger.warn('Failed to reset rate limit window in Redis, continuing', { error: redisError.message });
          }
        } else {
          // Update last request time
          clientData.lastRequest = now;
        }
      }
      
      // Increment count
      clientData.count++;
      try {
        await redis.setex(key, Math.ceil(config.windowMs / 1000), JSON.stringify(clientData));
      } catch (redisError) {
        logger.warn('Failed to update rate limit in Redis, continuing', { error: redisError.message });
      }
      
      // Update DB count asynchronously
      (async () => {
        try {
          const { db } = await import('../db/connection.js');
          const { rateLimits } = await import('../db/schema.js');
          const { eq, and } = await import('drizzle-orm');
          
          await db.execute`
            UPDATE rate_limits
            SET count = count + 1, updated_at = NOW()
            WHERE identifier = ${clientId} AND action = ${type}
          `;
        } catch (e) {
          // Best-effort; ignore errors
        }
      })();
      
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
        logger.warn('Rate limit exceeded', {
          type,
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
      
    } catch (error) {
      logger.error('Rate limiting error', { error: error.message, type, clientId });
      
      // On Redis error, allow request but log
      if (typeof next === 'function') {
        next();
      }
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
export async function getRateLimitStatus(req, type = 'default') {
  try {
    const config = RATE_LIMIT_CONFIG[type] || RATE_LIMIT_CONFIG.default;
    const clientId = getClientId(req);
    const key = sessionKeys.rateLimit(clientId, type);
    const clientData = await redis.get(key);
    
    if (!clientData) {
      return {
        limit: config.maxRequests,
        remaining: config.maxRequests,
        resetTime: null,
        exceeded: false
      };
    }
    
    const data = JSON.parse(clientData);
    const now = Date.now();
    const isExpired = now > data.resetTime;
    
    return {
      limit: config.maxRequests,
      remaining: isExpired ? config.maxRequests : Math.max(0, config.maxRequests - data.count),
      resetTime: data.resetTime,
      exceeded: !isExpired && data.count > config.maxRequests
    };
  } catch (error) {
    logger.error('Rate limit status error', { error: error.message });
    return {
      limit: 100,
      remaining: 100,
      resetTime: null,
      exceeded: false
    };
  }
}