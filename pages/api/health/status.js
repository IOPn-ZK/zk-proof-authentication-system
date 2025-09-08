import { checkDatabaseConnection } from '../../../lib/db/connection.js';
import { checkRedisHealth } from '../../../lib/redis/connection.js';
import { getQueueStats } from '../../../lib/queue/proofQueue.js';
import logger from '../../../lib/logging/logger.js';

async function handler(req, res) {
  const startTime = Date.now();
  const healthChecks = {};

  try {
    // Database health check
    try {
      const dbHealth = await checkDatabaseConnection();
      healthChecks.database = {
        status: dbHealth ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      healthChecks.database = {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }

    // Redis health check
    try {
      const redisHealth = await checkRedisHealth();
      healthChecks.redis = redisHealth;
    } catch (error) {
      healthChecks.redis = {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }

    // Queue health check
    try {
      const queueStats = await getQueueStats();
      healthChecks.queue = {
        status: 'healthy',
        stats: queueStats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      healthChecks.queue = {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }

    // System health check
    const systemHealth = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      timestamp: new Date().toISOString(),
    };

    // Environment health check
    const envHealth = {
      nodeEnv: process.env.NODE_ENV || 'development',
      hasAuth0Config: !!(process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET),
      hasEncryptionKey: !!process.env.ENCRYPTION_KEY,
      hasRedisConfig: !!(process.env.REDIS_HOST || process.env.REDIS_URL),
      timestamp: new Date().toISOString(),
    };

    // Determine overall health
    const allHealthy = Object.values(healthChecks).every(check => check.status === 'healthy');
    const overallStatus = allHealthy ? 'healthy' : 'degraded';

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      checks: {
        ...healthChecks,
        system: systemHealth,
        environment: envHealth,
      },
    };

    // Log health check
    logger.info('Health check completed', {
      status: overallStatus,
      responseTime: response.responseTime,
      checks: Object.keys(healthChecks).map(key => ({ service: key, status: healthChecks[key].status })),
    });

    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json(response);

  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      error: error.message,
      checks: healthChecks,
    });
  }
}

export default handler;
