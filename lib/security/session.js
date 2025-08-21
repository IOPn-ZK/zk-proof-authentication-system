import { getSession } from '@auth0/nextjs-auth0';
import { db } from '../db/connection.js';
import { userSessions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Session management with timeout and security enhancements
 */

const SESSION_CONFIG = {
  timeout: 30 * 60 * 1000,
  maxDuration: 24 * 60 * 60 * 1000,
  refreshThreshold: 5 * 60 * 1000
};

// In-memory session tracking (for production, use Redis or database)
const sessionTracker = new Map();

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
    console.error('DB session upsert failed:', error);
  }
}

/**
 * Enhanced session validation with timeout
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
    
    // Check session tracking
    let sessionData = sessionTracker.get(userId);
    
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
      sessionTracker.set(userId, sessionData);

      // Persist new session in DB
      await upsertDbSession(sessionData.id, null, null, true, now + SESSION_CONFIG.maxDuration);
    } else {
      // Check session timeout
      const timeSinceLastActivity = now - sessionData.lastActivity;
      const timeSinceLogin = now - sessionData.loginTime;
      
      if (timeSinceLastActivity > SESSION_CONFIG.timeout) {
        // Session timed out due to inactivity
        sessionTracker.delete(userId);
        await upsertDbSession(sessionData.id, null, null, false, now);
        return null;
      }
      
      if (timeSinceLogin > SESSION_CONFIG.maxDuration) {
        // Session exceeded maximum duration
        sessionTracker.delete(userId);
        await upsertDbSession(sessionData.id, null, null, false, now);
        return null;
      }
      
      // Update last activity
      sessionData.lastActivity = now;
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
    console.error('Session validation error:', error);
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
export function invalidateSession(userId) {
  const data = sessionTracker.get(userId);
  if (data) {
    upsertDbSession(data.id, null, null, false, Date.now()).catch(() => {});
  }
  sessionTracker.delete(userId);
}

/**
 * Clean expired sessions
 */
export function cleanExpiredSessions() {
  const now = Date.now();
  
  for (const [userId, sessionData] of sessionTracker.entries()) {
    const timeSinceLastActivity = now - sessionData.lastActivity;
    const timeSinceLogin = now - sessionData.loginTime;
    
    if (timeSinceLastActivity > SESSION_CONFIG.timeout || 
        timeSinceLogin > SESSION_CONFIG.maxDuration) {
      upsertDbSession(sessionData.id, null, null, false, now).catch(() => {});
      sessionTracker.delete(userId);
    }
  }
}

/**
 * Get session statistics
 * @returns {object} - Session statistics
 */
export function getSessionStats() {
  const now = Date.now();
  let activeSessions = 0;
  let expiredSessions = 0;
  
  for (const [userId, sessionData] of sessionTracker.entries()) {
    const timeSinceLastActivity = now - sessionData.lastActivity;
    const timeSinceLogin = now - sessionData.loginTime;
    
    if (timeSinceLastActivity > SESSION_CONFIG.timeout || 
        timeSinceLogin > SESSION_CONFIG.maxDuration) {
      expiredSessions++;
    } else {
      activeSessions++;
    }
  }
  
  return {
    total: sessionTracker.size,
    active: activeSessions,
    expired: expiredSessions,
    config: SESSION_CONFIG
  };
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
  } catch (error) {
    console.error('Failed setting session identity:', error);
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