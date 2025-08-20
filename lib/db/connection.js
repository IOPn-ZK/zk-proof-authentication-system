import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Pool } = pg;

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'semaphore_oauth_demo',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DB_POOL_MAX || '10'),
  min: parseInt(process.env.DB_POOL_MIN || '2'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '60000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
  acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '10000'),
  reapIntervalMillis: parseInt(process.env.DB_REAP_INTERVAL || '1000'),
  createTimeoutMillis: parseInt(process.env.DB_CREATE_TIMEOUT || '10000'),
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

// Reuse single pool/drizzle instance across hot-reloads in dev
const globalForDb = globalThis;

if (!globalForDb.__semaphoreDbPool) {
  globalForDb.__semaphoreDbPool = new Pool(dbConfig);
}
const pool = globalForDb.__semaphoreDbPool;

if (!globalForDb.__semaphoreDrizzleDb) {
  globalForDb.__semaphoreDrizzleDb = drizzle(pool, { schema });
}

export const db = globalForDb.__semaphoreDrizzleDb;

// Export pool for direct access if needed
export { pool };

// Connection health check
export async function checkDatabaseConnection() {
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