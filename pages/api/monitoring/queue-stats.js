import { withSecurityConfig } from '../../../lib/security/middleware.js';
import { getQueueStats, cleanOldJobs } from '../../../lib/queue/proofQueue.js';
import logger from '../../../lib/logging/logger.js';

async function handler(req, res) {
  try {
    if (req.method === 'POST' && req.body?.action === 'cleanup') {
      // Manual cleanup trigger
      const cleanupResult = await cleanOldJobs();
      logger.info('Manual queue cleanup triggered', cleanupResult);
      
      return res.status(200).json({
        success: true,
        message: 'Queue cleanup completed',
        result: cleanupResult,
      });
    }

    // Get queue statistics
    const stats = await getQueueStats();
    
    logger.info('Queue stats retrieved', stats);
    
    res.status(200).json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Queue stats error', { error: error.message });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get queue statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
}

export default withSecurityConfig('groupData')(handler);
