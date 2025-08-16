import { withSecurityConfig } from '../../../lib/security/middleware.js';
import { getSessionStats } from '../../../lib/security/session.js';
import { getRateLimitStatus } from '../../../lib/security/rateLimit.js';

async function handler(req, res) {
  try {
    // Get security status information
    const sessionStats = getSessionStats();
    const rateLimitStatus = getRateLimitStatus(req, 'default');
    
    // Security configuration status
    const securityStatus = {
      timestamp: new Date().toISOString(),
      requestedBy: req.session.user.email,
      
      // Session management
      sessions: {
        active: sessionStats.active,
        expired: sessionStats.expired,
        total: sessionStats.total,
        config: {
          timeout: `${sessionStats.config.timeout / 1000 / 60} minutes`,
          maxDuration: `${sessionStats.config.maxDuration / 1000 / 60 / 60} hours`
        }
      },
      
      // Rate limiting
      rateLimit: {
        current: {
          limit: rateLimitStatus.limit,
          remaining: rateLimitStatus.remaining,
          exceeded: rateLimitStatus.exceeded
        },
        types: {
          default: '100 requests per 15 minutes',
          auth: '10 requests per 15 minutes',
          zkProof: '5 requests per 5 minutes',
          identity: '3 requests per 10 minutes'
        }
      },
      
      // Security features enabled
      features: {
        encryptionAtRest: !!process.env.ENCRYPTION_KEY,
        sessionTimeout: true,
        rateLimiting: true,
        inputValidation: true,
        secureHeaders: true,
        corsRestriction: true,
        cryptographicSeeds: true
      },
      
      // Environment info (non-sensitive)
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasEncryptionKey: !!process.env.ENCRYPTION_KEY,
        auth0Configured: !!(process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET)
      }
    };
    
    console.log('Security status requested by:', req.session.user.email);
    
    res.status(200).json({
      success: true,
      status: securityStatus
    });
    
  } catch (error) {
    console.error('Error getting security status:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error retrieving security status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}

// Apply security middleware (requires authentication)
export default withSecurityConfig('groupData')(handler);