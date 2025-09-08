import { getSession } from '@auth0/nextjs-auth0';
import { setSession, getSession as getRedisSession, deleteSession } from '../redis/connection.js';
import { db } from '../db/connection.js';
import { userSessions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import logger from '../logging/logger.js';

/**
 * Session management with Redis backend and timeout
 */

const SESSION_CONFIG = {
  timeout: 30 * 60 * 1000,
  maxDuration: 24 * 60 * 60 * 1000,
  refreshThreshold: 5 * 60 * 1000
};

async function upsertDbSession(sessionId, identityCommitment = null, encryptedIdentity = null, isActive = true, expiresAtMs = Date.now() + SESSION_CONFIG.maxDuration) {
  try {
    const expiresAt = new Date(expiresAtMs);
    const now = new Date();

    // Try update first
    const existing = await db.select().from(userSessions).where(eq(userSessions.sessionId, sessionId)).limit(1);
    if (existing.length > 0) {
      await db.update(userSessions)
        .set({
          identityCommitment: identityCommitment ?? existing[0].identityCommitment,
          encryptedIdentity: encryptedIdentity ?? existing[0].encryptedIdentity,
          isActive,
          updatedAt: now,
          expiresAt: expiresAt,
        })
        .where(eq(userSessions.sessionId, sessionId));
      return;
    }

    await db.insert(userSessions).values({
      sessionId,
      identityCommitment: identityCommitment ?? null,
      encryptedIdentity: encryptedIdentity ?? null,
      isActive,
      createdAt: now,
      updatedAt: now,
      expiresAt: expiresAt,
    });
  } catch (error) {
    logger.error('DB session upsert failed', { error: error.message, sessionId });
  }
}

/**
 * Enhanced session validation with Redis backend
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @returns {object|null} - Session object or null if invalid
 */
export async function getValidSession(req, res) {
  try {
    const session = await getSession(req, res);
    
    if (!session || !session.user) {
      return null;
    }
    
    const userId = session.user.sub || session.user.email;
    const now = Date.now();
    
    // Check Redis session
    let sessionData = await getRedisSession(userId);
    
    if (!sessionData) {
      // First time seeing this session
      const generatedId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${userId}:${now}`;
      sessionData = {
        userId,
        id: generatedId,
        createdAt: now,
        lastActivity: now,
        loginTime: now
      };
      
      // Store in Redis
      await setSession(userId, sessionData, Math.floor(SESSION_CONFIG.maxDuration / 1000));
      
      // Persist new session in DB
      await upsertDbSession(sessionData.id, null, null, true, now + SESSION_CONFIG.maxDuration);
      
      logger.info('New session created', { userId, sessionId: sessionData.id });
    } else {
      // Check session timeout
      const timeSinceLastActivity = now - sessionData.lastActivity;
      const timeSinceLogin = now - sessionData.loginTime;
      
      if (timeSinceLastActivity > SESSION_CONFIG.timeout) {
        // Session timed out due to inactivity
        await deleteSession(userId);
        await upsertDbSession(sessionData.id, null, null, false, now);
        logger.info('Session timed out due to inactivity', { userId, sessionId: sessionData.id });
        return null;
      }
      
      if (timeSinceLogin > SESSION_CONFIG.maxDuration) {
        // Session exceeded maximum duration
        await deleteSession(userId);
        await upsertDbSession(sessionData.id, null, null, false, now);
        logger.info('Session exceeded maximum duration', { userId, sessionId: sessionData.id });
        return null;
      }
      
      // Update last activity
      sessionData.lastActivity = now;
      await setSession(userId, sessionData, Math.floor(SESSION_CONFIG.maxDuration / 1000));
      await upsertDbSession(sessionData.id, null, null, true, sessionData.loginTime + SESSION_CONFIG.maxDuration);
    }
    
    // Add session metadata to the session object
    const enhancedSession = {
      ...session,
      id: sessionData.id,
      sessionData: {
        createdAt: sessionData.createdAt,
        lastActivity: sessionData.lastActivity,
        loginTime: sessionData.loginTime,
        timeRemaining: SESSION_CONFIG.timeout - (now - sessionData.lastActivity),
        maxTimeRemaining: SESSION_CONFIG.maxDuration - (now - sessionData.loginTime)
      }
    };
    
    return enhancedSession;
  } catch (error) {
    logger.error('Session validation error', { error: error.message, stack: error.stack });
    return null;
  }
}

/**
 * Check if session needs refresh
 * @param {object} session - Session object with sessionData
 * @returns {boolean} - Whether session needs refresh
 */
export function needsSessionRefresh(session) {
  if (!session || !session.sessionData) {
    return false;
  }
  
  return session.sessionData.timeRemaining < SESSION_CONFIG.refreshThreshold;
}

/**
 * Invalidate session
 * @param {string} userId - User ID to invalidate
 */
export async function invalidateSession(userId) {
  try {
    const data = await getRedisSession(userId);
    if (data) {
      await upsertDbSession(data.id, null, null, false, Date.now());
    }
    await deleteSession(userId);
    logger.info('Session invalidated', { userId });
  } catch (error) {
    logger.error('Session invalidation error', { error: error.message, userId });
  }
}

/**
 * Clean expired sessions
 */
export async function cleanExpiredSessions() {
  try {
    // This would need to be implemented with Redis SCAN for production
    // For now, we rely on Redis TTL and DB cleanup
    logger.info('Session cleanup completed');
  } catch (error) {
    logger.error('Session cleanup error', { error: error.message });
  }
}

/**
 * Get session statistics
 * @returns {object} - Session statistics
 */
export async function getSessionStats() {
  try {
    // In a production environment, you'd get these from Redis
    // For now, return basic stats
    return {
      total: 0, // Would be Redis SCARD of session keys
      active: 0,
      expired: 0,
      config: SESSION_CONFIG
    };
  } catch (error) {
    logger.error('Session stats error', { error: error.message });
    return {
      total: 0,
      active: 0,
      expired: 0,
      config: SESSION_CONFIG
    };
  }
}

/**
 * Persist identity metadata for the current session
 * @param {object} session - Enhanced session from getValidSession
 * @param {string|null} identityCommitment - Commitment string
 * @param {string|null} encryptedIdentity - Encrypted identity payload
 */
export async function setSessionIdentity(session, identityCommitment = null, encryptedIdentity = null) {
  try {
    if (!session || !session.id) return;
    await upsertDbSession(session.id, identityCommitment, encryptedIdentity, true, Date.now() + SESSION_CONFIG.maxDuration);
    logger.info('Session identity updated', { sessionId: session.id, hasCommitment: !!identityCommitment });
  } catch (error) {
    logger.error('Failed setting session identity', { error: error.message, sessionId: session?.id });
  }
}

/**
 * Middleware to require valid session
 * @param {function} handler - API handler function
 * @returns {function} - Wrapped handler with session validation
 */
export function requireSession(handler) {
  return async (req, res) => {
    const session = await getValidSession(req, res);
    
    if (!session) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid session required. Please log in again.',
        code: 'SESSION_INVALID'
      });
    }
    
    // Add session to request for handler use
    req.session = session;
    
    // Set session headers
    res.setHeader('X-Session-Timeout', SESSION_CONFIG.timeout);
    res.setHeader('X-Session-Remaining', session.sessionData.timeRemaining);
    
    if (needsSessionRefresh(session)) {
      res.setHeader('X-Session-Refresh-Needed', 'true');
    }
    
    return handler(req, res);
  };
}

// Clean expired sessions periodically
setInterval(cleanExpiredSessions, 5 * 60 * 1000); // Every 5 minutes