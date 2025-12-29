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

// Create Redis client with error handling
let redis;
let redisAvailable = false;

try {
  redis = new Redis(redisConfig);

  // Handle Redis events
  redis.on('connect', () => {
    console.log('Redis connected successfully');
    redisAvailable = true;
  });

  redis.on('error', (error) => {
    console.error('Redis connection error:', error);
    redisAvailable = false;
    // Don't throw - allow app to continue without Redis
  });

  redis.on('close', () => {
    console.log('Redis connection closed');
    redisAvailable = false;
  });

  redis.on('reconnecting', () => {
    console.log('Redis reconnecting...');
  });

  // Try to connect (non-blocking) - only if lazyConnect is true
  // With lazyConnect, connection happens on first command, so we don't need to call connect()
  // But we can check status after a short delay
  setTimeout(() => {
    if (redis && redis.status === 'ready') {
      redisAvailable = true;
    }
  }, 100);
} catch (error) {
  console.error('Failed to create Redis client, continuing without Redis:', error.message);
  redisAvailable = false;
  // Create a mock redis object that fails gracefully
  redis = {
    get: async () => null,
    setex: async () => false,
    del: async () => false,
    ping: async () => { throw new Error('Redis not available'); },
    quit: async () => {}
  };
}

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

// Check if Redis is available
export function isRedisAvailable() {
  if (!redis || !redisAvailable) {
    return false;
  }
  // Check if redis has a status property (ioredis client)
  if (typeof redis.status === 'string') {
    return redis.status === 'ready';
  }
  // If it's a mock object, it's not available
  return redis.get && typeof redis.get === 'function' && redisAvailable;
}

// Session operations
export async function setSession(sessionId, data, ttl = 3600) {
  if (!isRedisAvailable()) {
    return false;
  }
  try {
    await redis.setex(sessionKeys.userSession(sessionId), ttl, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Redis setSession error:', error);
    redisAvailable = false;
    return false;
  }
}

export async function getSession(sessionId) {
  if (!isRedisAvailable()) {
    return null;
  }
  try {
    const data = await redis.get(sessionKeys.userSession(sessionId));
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Redis getSession error:', error);
    redisAvailable = false;
    return null;
  }
}

export async function deleteSession(sessionId) {
  if (!isRedisAvailable()) {
    return false;
  }
  try {
    await redis.del(sessionKeys.userSession(sessionId));
    return true;
  } catch (error) {
    console.error('Redis deleteSession error:', error);
    redisAvailable = false;
    return false;
  }
}

// Cache operations
export async function setCache(key, data, ttl = 300) {
  if (!isRedisAvailable()) {
    return false;
  }
  try {
    await redis.setex(sessionKeys.cache(key), ttl, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Redis setCache error:', error);
    redisAvailable = false;
    return false;
  }
}

export async function getCache(key) {
  if (!isRedisAvailable()) {
    return null;
  }
  try {
    const data = await redis.get(sessionKeys.cache(key));
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Redis getCache error:', error);
    redisAvailable = false;
    return null;
  }
}

export async function deleteCache(key) {
  if (!isRedisAvailable()) {
    return false;
  }
  try {
    await redis.del(sessionKeys.cache(key));
    return true;
  } catch (error) {
    console.error('Redis deleteCache error:', error);
    redisAvailable = false;
    return false;
  }
}

// Health check
export async function checkRedisHealth() {
  if (!isRedisAvailable()) {
    return { status: 'unavailable', timestamp: new Date().toISOString() };
  }
  try {
    await redis.ping();
    return { status: 'healthy', timestamp: new Date().toISOString() };
  } catch (error) {
    redisAvailable = false;
    return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
  }
}
