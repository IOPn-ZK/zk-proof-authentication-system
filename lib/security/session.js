import { getSession } from '@auth0/nextjs-auth0';

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
      sessionData = {
        userId,
        createdAt: now,
        lastActivity: now,
        loginTime: now
      };
      sessionTracker.set(userId, sessionData);
    } else {
      // Check session timeout
      const timeSinceLastActivity = now - sessionData.lastActivity;
      const timeSinceLogin = now - sessionData.loginTime;
      
      if (timeSinceLastActivity > SESSION_CONFIG.timeout) {
        // Session timed out due to inactivity
        sessionTracker.delete(userId);
        return null;
      }
      
      if (timeSinceLogin > SESSION_CONFIG.maxDuration) {
        // Session exceeded maximum duration
        sessionTracker.delete(userId);
        return null;
      }
      
      // Update last activity
      sessionData.lastActivity = now;
    }
    
    // Add session metadata to the session object
    const enhancedSession = {
      ...session,
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