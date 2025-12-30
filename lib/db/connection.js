import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Pool } = pg;

// Parse database connection string if provided, otherwise use individual variables
function parseDatabaseConfig() {
  // If DATABASE_URL is provided, parse it
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      const config = {
        host: url.hostname,
        port: parseInt(url.port || '5432'),
        database: url.pathname.slice(1) || 'postgres', // Remove leading /
        user: url.username,
        password: url.password,
        ssl: { rejectUnauthorized: false }, // Supabase requires SSL
      };
      
      // Handle pool_mode parameter if present in connection string
      if (url.searchParams.has('pool_mode')) {
        // pool_mode is handled by Supabase pooler, no need to set it in pg config
        console.log('Connection pooler mode:', url.searchParams.get('pool_mode'));
      }
      
      return config;
    } catch (error) {
      console.error('Error parsing DATABASE_URL, falling back to individual variables:', error.message);
    }
  }
  
  // Fall back to individual environment variables
  const config = {
    host: process.env.DB_HOST || '',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || '',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
  
  // Auto-enable SSL for pooler connections
  if (config.host.includes('pooler') || config.host.includes('supabase')) {
    config.ssl = { rejectUnauthorized: false };
  }
  
  return config;
}

// Database configuration
const baseConfig = parseDatabaseConfig();
const dbConfig = {
  ...baseConfig,
  // Pool settings
  max: parseInt(process.env.DB_POOL_MAX || '10'),
  min: parseInt(process.env.DB_POOL_MIN || '2'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '60000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
  acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '10000'),
  reapIntervalMillis: parseInt(process.env.DB_REAP_INTERVAL || '1000'),
  createTimeoutMillis: parseInt(process.env.DB_CREATE_TIMEOUT || '10000'),
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  // Force SSL for Supabase (if host contains supabase.co, pooler.supabase.com, or aws pooler)
  ssl: baseConfig.host.includes('supabase.co') || 
       baseConfig.host.includes('pooler.supabase.com') || 
       baseConfig.host.includes('pooler') ||
       baseConfig.host.includes('supabase') 
    ? { rejectUnauthorized: false } 
    : (baseConfig.ssl || false),
};

// Reuse single pool/drizzle instance across hot-reloads in dev
const globalForDb = globalThis;

let pool;
let db;

try {
  if (!globalForDb.__semaphoreDbPool) {
    // Log connection details (without password)
    console.log('Initializing database connection:', {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      hasPassword: !!dbConfig.password,
      ssl: !!dbConfig.ssl,
      usingConnectionString: !!process.env.DATABASE_URL
    });
    
    globalForDb.__semaphoreDbPool = new Pool(dbConfig);
    
    // Handle pool errors gracefully
    globalForDb.__semaphoreDbPool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });
    
    globalForDb.__semaphoreDbPool.on('connect', () => {
      console.log('Database pool connected successfully');
    });
  }
  pool = globalForDb.__semaphoreDbPool;

  if (!globalForDb.__semaphoreDrizzleDb) {
    globalForDb.__semaphoreDrizzleDb = drizzle(pool, { schema });
  }
  db = globalForDb.__semaphoreDrizzleDb;
  } catch (error) {
    console.error('Failed to initialize database connection:', error);
    console.error('Connection config (sanitized):', {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      hasPassword: !!dbConfig.password,
      ssl: !!dbConfig.ssl
    });
    
    // Provide helpful error message for common issues
    if (error.code === 'ENOTFOUND' && dbConfig.host.includes('supabase')) {
      console.error('\n⚠️  DNS Resolution Failed for Supabase hostname');
      console.error('Possible solutions:');
      console.error('1. Check if Supabase project is active (not paused)');
      console.error('2. Use Connection Pooler URL instead: xxxxx.pooler.supabase.com:6543');
      console.error('3. Verify hostname in Supabase Dashboard → Settings → Database');
      console.error('4. Check Supabase project status in dashboard');
    }
  // Create a mock db that fails gracefully
  pool = null;
  db = {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    insert: () => ({ values: () => Promise.resolve([]) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
    delete: () => ({ where: () => Promise.resolve([]) })
  };
}

export { db };

// Export pool for direct access if needed
export { pool };

// Connection health check
export async function checkDatabaseConnection() {
  if (!pool) {
    console.warn('Database pool not initialized');
    return false;
  }
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeDatabaseConnection() {
  try {
    // Only end the pool if we created it (avoid ending shared pool during dev reloads)
    if (pool && pool.end) {
      await pool.end();
      console.log('Database connection pool closed');
      globalForDb.__semaphoreDbPool = undefined;
      globalForDb.__semaphoreDrizzleDb = undefined;
    }
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
}

// Handle process termination
process.on('SIGINT', closeDatabaseConnection);
process.on('SIGTERM', closeDatabaseConnection);