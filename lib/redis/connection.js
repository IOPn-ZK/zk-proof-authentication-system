import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  family: 4,
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'semaphore:',
};

// Create Redis client
const redis = new Redis(redisConfig);

// Handle Redis events
redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('error', (error) => {
  console.error('Redis connection error:', error);
});

redis.on('close', () => {
  console.log('Redis connection closed');
});

redis.on('reconnecting', () => {
  console.log('Redis reconnecting...');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await redis.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await redis.quit();
  process.exit(0);
});

export { redis };

// Session management helpers
export const sessionKeys = {
  userSession: (sessionId) => `session:${sessionId}`,
  userSessions: (userId) => `user_sessions:${userId}`,
  rateLimit: (identifier, action) => `rate_limit:${identifier}:${action}`,
  cache: (key) => `cache:${key}`,
  proofQueue: (proofId) => `proof_queue:${proofId}`,
};

// Session operations
export async function setSession(sessionId, data, ttl = 3600) {
  try {
    await redis.setex(sessionKeys.userSession(sessionId), ttl, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Redis setSession error:', error);
    return false;
  }
}

export async function getSession(sessionId) {
  try {
    const data = await redis.get(sessionKeys.userSession(sessionId));
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Redis getSession error:', error);
    return null;
  }
}

export async function deleteSession(sessionId) {
  try {
    await redis.del(sessionKeys.userSession(sessionId));
    return true;
  } catch (error) {
    console.error('Redis deleteSession error:', error);
    return false;
  }
}

// Cache operations
export async function setCache(key, data, ttl = 300) {
  try {
    await redis.setex(sessionKeys.cache(key), ttl, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Redis setCache error:', error);
    return false;
  }
}

export async function getCache(key) {
  try {
    const data = await redis.get(sessionKeys.cache(key));
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Redis getCache error:', error);
    return null;
  }
}

export async function deleteCache(key) {
  try {
    await redis.del(sessionKeys.cache(key));
    return true;
  } catch (error) {
    console.error('Redis deleteCache error:', error);
    return false;
  }
}

// Health check
export async function checkRedisHealth() {
  try {
    await redis.ping();
    return { status: 'healthy', timestamp: new Date().toISOString() };
  } catch (error) {
    return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
  }
}
